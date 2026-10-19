// Test-only read-only input-source/modifier diagnostics; no key text or codes.
import AppKit
import Carbon
import ApplicationServices

final class InputStateObserver:NSObject,NSApplicationDelegate {
    let output=CommandLine.arguments[1]
    let started=Date().timeIntervalSince1970
    var samples:[[String:Any]]=[]
    var flagsEvents:[[String:Any]]=[]
    var changes:[[String:Any]]=[]
    var last:String=""
    var timer:Timer?
    var flush:Timer?
    var tap:CFMachPort?
    var tapSource:CFRunLoopSource?
    var stop:DispatchSourceSignal?
    func inputID()->String {
        guard let source=TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),let raw=TISGetInputSourceProperty(source,kTISPropertyInputSourceID) else{return "unavailable"}
        return Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String
    }
    func sample(){
        let mask:CGEventFlags=[.maskAlphaShift,.maskShift,.maskControl,.maskAlternate,.maskCommand,.maskSecondaryFn]
        let hid=CGEventSource.flagsState(.hidSystemState).intersection(mask).rawValue
        let combined=CGEventSource.flagsState(.combinedSessionState).intersection(mask).rawValue
        let source=inputID(),now=Date().timeIntervalSince1970
        let row:[String:Any]=["epoch":now,"source":source,"hidFlags":hid,"combinedFlags":combined,"frontPID":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0]
        samples.append(row)
        let signature="\(source):\(hid):\(combined)"
        if signature != last {changes.append(row);last=signature}
    }
    func save(){let report:[String:Any]=["started":started,"samples":samples,"changes":changes,"flagsChangedEvents":flagsEvents,"tapAvailable":tap != nil,"privacy":"Only input-source ID, modifier masks and event source/target PIDs. No key codes, key text or app text."]
        if let data=try? JSONSerialization.data(withJSONObject:report,options:[.sortedKeys]){try? data.write(to:URL(fileURLWithPath:output),options:.atomic)}
    }
    func applicationDidFinishLaunching(_ notification:Notification){
        tap=CGEvent.tapCreate(tap:.cgAnnotatedSessionEventTap,place:.headInsertEventTap,options:.listenOnly,eventsOfInterest:CGEventMask(1)<<12,callback:{_,type,event,ref in
            guard let ref else{return Unmanaged.passUnretained(event)}
            let observer=Unmanaged<InputStateObserver>.fromOpaque(ref).takeUnretainedValue()
            observer.flagsEvents.append(["epoch":Date().timeIntervalSince1970,"type":type.rawValue,"flags":event.flags.rawValue,"sourcePID":event.getIntegerValueField(.eventSourceUnixProcessID),"targetPID":event.getIntegerValueField(.eventTargetUnixProcessID)])
            return Unmanaged.passUnretained(event)
        },userInfo:Unmanaged.passUnretained(self).toOpaque())
        if let tap {tapSource=CFMachPortCreateRunLoopSource(nil,tap,0);CFRunLoopAddSource(CFRunLoopGetMain(),tapSource,.commonModes);CGEvent.tapEnable(tap:tap,enable:true)}
        timer=Timer.scheduledTimer(withTimeInterval:0.005,repeats:true){[weak self]_ in self?.sample()}
        flush=Timer.scheduledTimer(withTimeInterval:0.25,repeats:true){[weak self]_ in self?.save()}
        signal(SIGTERM,SIG_IGN);stop=DispatchSource.makeSignalSource(signal:SIGTERM,queue:.main);stop?.setEventHandler{[weak self] in self?.sample();self?.save();exit(0)};stop?.resume()
        sample();save();print("READY");fflush(stdout)
    }
}
let application=NSApplication.shared;application.setActivationPolicy(.accessory)
let observer=InputStateObserver();application.delegate=observer;application.run()
