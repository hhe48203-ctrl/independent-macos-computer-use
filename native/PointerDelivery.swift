import AppKit
import ApplicationServices

// Independent routing alternative. WindowServer sees a Command background
// click; the per-process tap removes that temporary flag before AppKit receives
// our event. Never modify hardware events or another sender's events. No global
// modifier down/up events, activation notifications or focus restoration.
@MainActor final class BackgroundPointerDelivery {
    static private var sequence:Int64=0
    let pid:pid_t
    let windowID:CGWindowID
    let tag:Int64
    let sourcePID=getpid()
    let eventSource:CGEventSource
    var tap:CFMachPort?
    var source:CFRunLoopSource?
    var posted=0
    var received=0
    var rewritten=0
    var disabled=false
    init(pid:pid_t,windowID:CGWindowID) throws {
        self.pid=pid;self.windowID=windowID
        Self.sequence=Self.sequence%0xffff+1
        // Use a positive 32-bit per-operation nonce. Assign user data exactly once:
        // on this macOS a second CGEvent field assignment retained the first.
        tag=0x43420000|Self.sequence
        guard let inputSource=CGEventSource(stateID:.privateState) else {throw BridgeError("EVENT_FAILED","Could not create an isolated pointer source")}
        inputSource.localEventsSuppressionInterval=0
        inputSource.setLocalEventsFilterDuringSuppressionState(CGEventFilterMask(rawValue:UInt32.max),state:.eventSuppressionStateSuppressionInterval)
        eventSource=inputSource
        let types:[CGEventType]=[.leftMouseDown,.leftMouseUp,.rightMouseDown,.rightMouseUp,.otherMouseDown,.otherMouseUp,.leftMouseDragged,.rightMouseDragged,.otherMouseDragged]
        let mask=types.reduce(CGEventMask(0)){$0|(CGEventMask(1)<<$1.rawValue)}
        tap=CGEvent.tapCreateForPid(pid:pid,place:.headInsertEventTap,options:.defaultTap,eventsOfInterest:mask,callback:{_,type,event,context in
            guard let context else{return Unmanaged.passUnretained(event)}
            return MainActor.assumeIsolated {
                let delivery=Unmanaged<BackgroundPointerDelivery>.fromOpaque(context).takeUnretainedValue()
                if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {delivery.disabled=true;return Unmanaged.passUnretained(event)}
                if event.getIntegerValueField(.eventSourceUnixProcessID)==Int64(delivery.sourcePID),
                   event.getIntegerValueField(.eventSourceUserData)==delivery.tag,
                   event.getIntegerValueField(.eventTargetUnixProcessID)==Int64(delivery.pid),
                   event.getIntegerValueField(CGEventField(rawValue:51)!)==Int64(delivery.windowID) {
                    if event.flags.contains(.maskCommand) {event.flags.remove(.maskCommand);delivery.rewritten += 1}
                    delivery.received += 1
                }
                return Unmanaged.passUnretained(event)
            }
        },userInfo:Unmanaged.passUnretained(self).toOpaque())
        guard let tap else{throw BridgeError("BACKGROUND_POINTER_TAP_UNAVAILABLE","Could not create an authorized per-process pointer delivery tap. No pointer event was posted.")}
        guard let source=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0) else{CFMachPortInvalidate(tap);self.tap=nil;throw BridgeError("BACKGROUND_POINTER_TAP_UNAVAILABLE","Could not attach pointer delivery tap. No pointer event was posted.")}
        self.source=source;CFRunLoopAddSource(CFRunLoopGetMain(),source,.commonModes);CGEvent.tapEnable(tap:tap,enable:true)
    }
    func prepare(_ event:CGEvent) throws {
        guard let tap,!disabled,CGEvent.tapIsEnabled(tap:tap) else {throw BridgeError("BACKGROUND_POINTER_TAP_DISABLED","Pointer delivery tap is disabled; no further pointer event was posted.")}
        event.setIntegerValueField(.eventSourceUserData,value:tag)
        event.flags.insert(.maskCommand)
        guard event.getIntegerValueField(.eventSourceUserData)==tag else {throw BridgeError("BACKGROUND_POINTER_TAG_FAILED","The pointer event did not retain its operation tag. No event was posted.")}
        posted += 1
    }
    func waitForDelivery() async throws {
        let deadline=ProcessInfo.processInfo.systemUptime+1
        while received<posted {
            guard let tap,!disabled,CGEvent.tapIsEnabled(tap:tap) else{throw BridgeError("BACKGROUND_POINTER_TAP_DISABLED","Pointer delivery tap stopped during input. The action may be partial; observe before retrying.")}
            guard ProcessInfo.processInfo.systemUptime<deadline else{throw BridgeError("BACKGROUND_POINTER_DELIVERY_TIMEOUT","Could not confirm every pointer event passed the target delivery tap. Input may be partial; no action was retried.")}
            try await Task.sleep(nanoseconds:2_000_000)
        }
        guard rewritten==posted else{throw BridgeError("BACKGROUND_POINTER_DELIVERY_MISMATCH","Not every routing flag was observed and removed. Isolation could not be confirmed; observe before retrying.")}
    }
    var json:[String:Any] {[
        "method":"Command routing flag removed at source-filtered target process tap",
        "sourcePID":sourcePID,"targetPID":pid,"windowID":windowID,"operationTag":tag,
        "postedEvents":posted,"observedEvents":received,"rewrittenEvents":rewritten,
        "globalModifierEvents":0,"activationNotificationsCreatedByPointerRouter":0]}
    func stop(){
        if let source{CFRunLoopRemoveSource(CFRunLoopGetMain(),source,.commonModes)}
        if let tap{CGEvent.tapEnable(tap:tap,enable:false);CFMachPortInvalidate(tap)}
        source=nil;tap=nil
    }
}
