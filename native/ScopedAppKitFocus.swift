import AppKit
import ApplicationServices

// ABI verified from this OS wrapper's ARM64 instructions; semantic attribution
// of its raw reply is still provisional. Never expose it as proven hardware
// delivery. Restrict this experiment to the exact OS version investigated.
@MainActor enum ExperimentalTypingFocus {
    typealias Query=@convention(c)()->UInt32
    static let query:Query?=dlsym(UnsafeMutableRawPointer(bitPattern:-2),"SLPSGetTypingFocusProcess").map{unsafeBitCast($0,to:Query.self)}
    static func read(forScopedInput: Bool = false)->UInt32? {
        guard forScopedInput || ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1" else{return nil}
        #if arch(arm64)
        let os=ProcessInfo.processInfo.operatingSystemVersion
        guard os.majorVersion==26,os.minorVersion==6,os.patchVersion==2 else{return nil}
        return query?()
        #else
        return nil
        #endif
    }
}

enum ScopedAppKitInput: String {
    case key, click

    private static func bundles(_ variable: String) -> Set<String> {
        Set((ProcessInfo.processInfo.environment[variable] ?? "").split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
    }
    private static let keyBundles = bundles("CU_EXPERIMENTAL_APPKIT_KEY_BUNDLE_IDS")
    private static let clickBundles = bundles("CU_EXPERIMENTAL_APPKIT_CLICK_BUNDLE_IDS")

    var bundleIDs: Set<String> { self == .key ? Self.keyBundles : Self.clickBundles }
    func code(_ suffix: String) -> String { "SCOPED_\(rawValue.uppercased())_\(suffix)" }
}

// Experimental independent implementation of observed app-local focus notices.
// Opt-in at server startup. It does not request WindowServer focus, freeze the
// display, restore foreground, or filter other processes' focus/keyboard events.
@MainActor final class ScopedAppKitFocus {
    let pid:pid_t
    let windowID:CGWindowID
    var finished=false
    var notifications=0
    var skippedCleanupForRealFocus=false
    let startedEpoch=Date().timeIntervalSince1970
    let startedUptime=ProcessInfo.processInfo.systemUptime
    var finishedEpoch:Double?
    var activeDurationMs:Double?
    init(pid:pid_t,windowID:CGWindowID){self.pid=pid;self.windowID=windowID}
    func send(_ type:NSEvent.EventType,_ subtype:Int16,_ flags:NSEvent.ModifierFlags,_ window:Int) throws {
        guard let event=NSEvent.otherEvent(with:type,location:.zero,modifierFlags:flags,timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:window,context:nil,subtype:subtype,data1:0,data2:0)?.cgEvent else{throw BridgeError("EVENT_FAILED","Could not build an app-local focus notice")}
        event.setIntegerValueField(.eventSourceUserData,value:0x43554247)
        event.timestamp=DispatchTime.now().uptimeNanoseconds;event.postToPid(pid);notifications += 1
    }
    func finish(){
        guard !finished else{return};finished=true
        finishedEpoch=Date().timeIntervalSince1970;activeDurationMs=(ProcessInfo.processInfo.systemUptime-startedUptime)*1000
        // A user may have switched to the app during the operation. Never send
        // a synthetic deactivation to an app now owning real foreground/focus.
        let now=SystemInputFocus.observe()
        guard now.foregroundPID != pid,now.keyboardPID != pid else{skippedCleanupForRealFocus=true;return}
        try? send(NSEvent.EventType(rawValue:21)!,0x1000,[],0)
        try? send(.appKitDefined,2,[],0)
    }
    var json:[String:Any]{["experimental":true,"method":"scoped app-local AppKit notices and observed AX activation-point click","notificationsGenerated":notifications,"explicitRegistryFocusAPIRequests":0,"foregroundRestorations":0,"cleanupSkippedForRealFocus":skippedCleanupForRealFocus,"startedEpoch":startedEpoch,"finishedEpoch":finishedEpoch as Any? ?? NSNull(),"activeDurationMs":activeDurationMs as Any? ?? NSNull()]}
}

@MainActor extension Desktop {
    func prepareScopedAppKitFocus(_ pid:pid_t,_ wid:CGWindowID,_ frame:CGRect,_ delivery:BackgroundPointerDelivery,_ observation:BackgroundFocusObservation) async throws -> ScopedAppKitFocus? {
        let scoped = observation.scopedInput != nil
        guard scoped || ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1" else{return nil}
        guard let typing=ExperimentalTypingFocus.read(forScopedInput: scoped),typing>0 else{throw BridgeError("EXPERIMENTAL_FOCUS_OS_UNVERIFIED","App-local focus is experimental and currently requires the investigated macOS 26.6.2 typing-focus query. No notice was sent")}
        if scoped { try observation.validate() }
        let focus=SystemInputFocus.observe()
        guard focus.foregroundPID != pid,focus.keyboardPID != pid else{return nil}
        guard focus.keyboardPID != nil else{throw BridgeError("BACKGROUND_FOCUS_UNRESOLVED","Experimental app-local focus requires a resolved registry baseline")}
        let window=try axWindow(pid,frame)
        guard let value=attr(window,NSAccessibility.Attribute.activationPoint.rawValue),CFGetTypeID(value)==AXValueGetTypeID() else {
            throw BridgeError("BACKGROUND_ACTIVATION_POINT_REQUIRED","Experimental app-local focus needs the window's observed AX activation point; no guessed click or notice was sent")
        }
        var point=CGPoint.zero
        guard AXValueGetValue(value as! AXValue,.cgPoint,&point),point.x.isFinite,point.y.isFinite,frame.contains(point) else{throw BridgeError("BACKGROUND_ACTIVATION_POINT_REQUIRED","Window activation point is invalid or outside the target")}
        let session=ScopedAppKitFocus(pid:pid,windowID:wid);activeAppKitSession=session
        do {
            try session.send(.appKitDefined,1,[.control,.option],Int(wid))
            try await Task.sleep(nanoseconds:20_000_000);try observation.validate()
            if scoped, (try target(["pid": Int(pid), "windowId": Int(wid)])).2 != frame {
                throw BridgeError("WINDOW_MOVED", "The target moved during scoped focus preparation. No pointer event or key was sent.")
            }
            try backgroundMouse(.leftMouseDown,point,.left,1,pid,wid,frame,delivery)
            // The activation-point click is an adjacent down/up pair; do not
            // hold the title or consume intervening user pointer movement.
            try backgroundMouse(.leftMouseUp,point,.left,1,pid,wid,frame,delivery)
            try session.send(NSEvent.EventType(rawValue:21)!,Int16.min,[],0)
            try await Task.sleep(nanoseconds:30_000_000);try observation.validate()
            return session
        }catch{session.finish();activeAppKitSession=nil;try? await Task.sleep(nanoseconds:80_000_000);throw error}
    }
}
