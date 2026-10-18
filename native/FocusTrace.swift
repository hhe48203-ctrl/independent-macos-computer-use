// Test-only, read-only observer. Never records another app's keyboard contents.
import AppKit
import ApplicationServices

@MainActor final class FocusTrace: NSObject, NSApplicationDelegate {
    let directory: URL
    let seconds: Double
    let started = ProcessInfo.processInfo.systemUptime
    var samples: [[String:Any]] = []
    var notifications: [[String:Any]] = []
    var activations: [[String:Any]] = []
    var tap: CFMachPort?
    var source: CFRunLoopSource?
    var processTap: CFMachPort?
    var processSource: CFRunLoopSource?
    var processEvents: [[String:Any]] = []
    var taggedKeyboardOnly=false
    var timers: [Timer] = []
    var workspaceObserver: NSObjectProtocol?
    var sampleCount=0
    var maxSampleGap:Double=0
    var lastSampleTime:Double=0
    var lastWindowPoll:Double = -1
    var lastEmission:Double = -1
    var cachedWindows:[[String:Int]]=[]
    var lastState:NSDictionary?
    var terminationSource:DispatchSourceSignal?
    init(_ directory: String, _ seconds: Double) {
        self.directory=URL(fileURLWithPath:directory); self.seconds=seconds
    }
    var elapsed: Double { ProcessInfo.processInfo.systemUptime-started }
    func applicationDidFinishLaunching(_ notification: Notification) {
        try? FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        signal(SIGTERM,SIG_IGN)
        terminationSource=DispatchSource.makeSignalSource(signal:SIGTERM,queue:.main)
        terminationSource?.setEventHandler { [weak self] in self?.finish() }
        terminationSource?.resume()
        // Event 21 is the OS process-notification stream, not a keyboard stream.
        tap=CGEvent.tapCreate(tap:.cgAnnotatedSessionEventTap,place:.headInsertEventTap,
            options:.listenOnly,eventsOfInterest:CGEventMask(1)<<21,callback:{ _,type,event,context in
                guard let context else { return Unmanaged.passUnretained(event) }
                let trace=Unmanaged<FocusTrace>.fromOpaque(context).takeUnretainedValue()
                var row:[String:Any]=["t":ProcessInfo.processInfo.systemUptime-trace.started,"type":type.rawValue]
                if type.rawValue == 21 {
                    for field in [40,41,51,55,64,66,67,69,71,73,83] {
                        row[String(field)]=event.getIntegerValueField(CGEventField(rawValue:UInt32(field))!)
                    }
                    row["tag"]=event.getIntegerValueField(.eventSourceUserData)
                }
                DispatchQueue.main.async { trace.notifications.append(row) }
                return Unmanaged.passUnretained(event)
            },userInfo:Unmanaged.passUnretained(self).toOpaque())
        if let tap {
            source=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0)
            CFRunLoopAddSource(CFRunLoopGetMain(),source,.commonModes)
            CGEvent.tapEnable(tap:tap,enable:true)
        }
        if CommandLine.arguments.count == 4,let targetPID=Int32(CommandLine.arguments[3]),
           let target=NSRunningApplication(processIdentifier:targetPID),
           ["io.local.computeruse.background-target","io.local.computeruse.foreground-workspace","com.apple.calculator","com.apple.TextEdit"].contains(target.bundleIdentifier ?? "") {
            taggedKeyboardOnly=target.bundleIdentifier == "com.apple.TextEdit"
            processTap=CGEvent.tapCreateForPid(pid:targetPID,place:.headInsertEventTap,options:.listenOnly,
                eventsOfInterest:CGEventMask.max,callback:{ _,type,event,context in
                    guard let context else{return Unmanaged.passUnretained(event)}
                    let trace=Unmanaged<FocusTrace>.fromOpaque(context).takeUnretainedValue()
                    let tag=event.getIntegerValueField(.eventSourceUserData)
                    if trace.taggedKeyboardOnly,(type == .keyDown || type == .keyUp),![Int64(0x43555052),Int64(0x43554247)].contains(tag) {return Unmanaged.passUnretained(event)}
                    var row:[String:Any]=["t":ProcessInfo.processInfo.systemUptime-trace.started,"type":type.rawValue,
                        "flags":event.flags.rawValue,"tag":event.getIntegerValueField(.eventSourceUserData)]
                    for field in [40,41,51,55,64,66,67,69,71,73,83] {row[String(field)]=event.getIntegerValueField(CGEventField(rawValue:UInt32(field))!)}
                    if type == .keyDown || type == .keyUp {
                        row["keyCode"]=event.getIntegerValueField(.keyboardEventKeycode)
                        if tag == 0x43555052 {
                            var count=0;var units=[UniChar](repeating:0,count:128)
                            event.keyboardGetUnicodeString(maxStringLength:128,actualStringLength:&count,unicodeString:&units)
                            row["syntheticTestUnicode"]=String(utf16CodeUnits:units,count:min(count,128))
                        }
                    }
                    DispatchQueue.main.async {trace.processEvents.append(row)}
                    return Unmanaged.passUnretained(event)
                },userInfo:Unmanaged.passUnretained(self).toOpaque())
            if let processTap {
                processSource=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,processTap,0)
                CFRunLoopAddSource(CFRunLoopGetMain(),processSource,.commonModes)
                CGEvent.tapEnable(tap:processTap,enable:true)
            }
        }
        workspaceObserver=NSWorkspace.shared.notificationCenter.addObserver(forName:NSWorkspace.didActivateApplicationNotification,object:nil,queue:.main) { [weak self] notification in
            guard let self,let application=notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else{return}
            self.activations.append(["t":self.elapsed,"pid":application.processIdentifier])
        }
        timers.append(Timer.scheduledTimer(withTimeInterval:0.005,repeats:true) { [weak self] _ in self?.sample() })
        timers.append(Timer.scheduledTimer(withTimeInterval:1,repeats:true) { [weak self] _ in self?.save() })
        timers.append(Timer.scheduledTimer(withTimeInterval:seconds,repeats:false) { [weak self] _ in self?.finish() })
        sample();save()
        print("READY \(ProcessInfo.processInfo.processIdentifier)");fflush(stdout)
    }
    func sample() {
        let now=elapsed;sampleCount += 1
        if lastSampleTime>0 {maxSampleGap=max(maxSampleGap,now-lastSampleTime)}
        lastSampleTime=now
        var row=SystemInputFocus.observe().json
        let point=CGEvent(source:nil)?.location ?? .zero
        row["pointer"]=["x":point.x,"y":point.y]
        if now-lastWindowPoll>=0.05 {
            let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
            cachedWindows=windows.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }.compactMap { window -> [String:Int]? in
                guard let id=window[kCGWindowNumber as String] as? Int,let pid=window[kCGWindowOwnerPID as String] as? Int else{return nil}
                return ["id":id,"pid":pid]
            }
            lastWindowPoll=now
        }
        row["windows"]=cachedWindows
        let state=NSDictionary(dictionary:row)
        if lastState?.isEqual(state) != true || now-lastEmission>=0.05 {
            row["t"]=now;samples.append(row);lastState=state;lastEmission=now
        }
    }
    func save() {
        let report:[String:Any]=["schema":1,"pid":ProcessInfo.processInfo.processIdentifier,
            "tapAvailable":tap != nil,"tapEnabled":tap.map { CGEvent.tapIsEnabled(tap:$0) } ?? false,
            "eventFieldsAreUndocumented":true,"samples":samples,"notifications":notifications,"activations":activations,
            "processTapAvailable":processTap != nil,"processEvents":processEvents,"sampleCount":sampleCount,
            "focusPollRequestedInterval":0.005,"windowPollRequestedInterval":0.05,"maxSampleGap":maxSampleGap,
            "sampleStorage":"state changes and 50ms heartbeats; sampling gaps are measured"]
        if let data=try? JSONSerialization.data(withJSONObject:report) {try? data.write(to:directory.appendingPathComponent("focus-trace.json"),options:.atomic)}
    }
    func finish() {
        terminationSource?.cancel();terminationSource=nil
        timers.forEach{$0.invalidate()};sample();save()
        if let tap { CGEvent.tapEnable(tap:tap,enable:false);CFMachPortInvalidate(tap) }
        if let processTap {CGEvent.tapEnable(tap:processTap,enable:false);CFMachPortInvalidate(processTap)}
        NSApp.terminate(nil)
    }
}

@main struct FocusTraceMain {
    @MainActor static func main() {
        guard (3...4).contains(CommandLine.arguments.count),let seconds=Double(CommandLine.arguments[2]),seconds>0,seconds<=180 else {fputs("Usage: focus-trace DIRECTORY SECONDS (0..180) [OWN_FIXTURE_PID]\n",stderr);exit(2)}
        let app=NSApplication.shared
        let trace=FocusTrace(CommandLine.arguments[1],seconds)
        app.setActivationPolicy(.accessory);app.delegate=trace;app.run()
    }
}
