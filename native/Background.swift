import AppKit
import ApplicationServices

// Observation is separate from prevention. AppKit can react asynchronously to
// AX and process-directed events. Samples expose what was actually observed;
// neither an unresolved query nor a polling gap is evidence of isolation.
@MainActor final class BackgroundFocusObservation {
    let targetPID:pid_t
    let scopedInput: ScopedAppKitInput?
    let before=SystemInputFocus.observe()
    let typingRawBefore: UInt32?
    var typingRawAfter:UInt32?
    var typingRouteChanged=false
    let started=ProcessInfo.processInfo.systemUptime
    var after:InputFocusObservation
    var samples=0
    var unresolved=0
    var targetGainedKeyboardFocus=false
    var unexpectedKeyboardRecipient=false
    var scopedInputInterrupted=false
    var maxSampleGap:Double=0
    var lastSampleTime:Double=0
    var transitions:[[String:Any]]=[]
    var timer:Timer?
    init(targetPID:pid_t, scopedInput: ScopedAppKitInput? = nil) throws {
        self.targetPID=targetPID;after=before
        self.scopedInput=scopedInput
        typingRawBefore=ExperimentalTypingFocus.read(forScopedInput: scopedInput != nil)
        guard !before.hasKeyboardFocusWithoutForeground(targetPID) else {
            throw BridgeError("BACKGROUND_KEYBOARD_FOCUS_ALREADY_TARGET", "The target already receives system keyboard input while another app is foreground. Background input was stopped before delivery. Observe the current state before continuing.")
        }
        if let scopedInput {
            guard let foreground=before.foregroundPID, foreground != targetPID, before.keyboardPID != nil,
                  let typingRawBefore, typingRawBefore > 0 else {
                throw BridgeError(scopedInput.code("FOCUS_UNAVAILABLE"), "The experimental \(scopedInput.rawValue) route requires an inactive target and resolved foreground, keyboard and typing routes. No input was sent.")
            }
        }
        sample()
        timer=Timer.scheduledTimer(withTimeInterval:0.005,repeats:true) { [weak self] _ in
            MainActor.assumeIsolated {self?.sample()}
        }
    }
    func sample() {
        let now=ProcessInfo.processInfo.systemUptime-started
        if samples>0 {maxSampleGap=max(maxSampleGap,now-lastSampleTime)}
        lastSampleTime=now;samples += 1
        let current=SystemInputFocus.observe()
        typingRawAfter=ExperimentalTypingFocus.read(forScopedInput: scopedInput != nil)
        if scopedInput != nil && (current.foregroundPID != before.foregroundPID || current.keyboardPID == nil || typingRawAfter == nil || typingRawAfter == 0) {
            scopedInputInterrupted=true
        }
        if let prior=typingRawBefore,let now=typingRawAfter,prior>0,now>0,prior != now,current.foregroundPID==before.foregroundPID {typingRouteChanged=true}
        if current.keyboardPID == nil {unresolved += 1}
        let change=current.change(from:before,targetPID:targetPID)
        if change == .targetGainedFocus {targetGainedKeyboardFocus=true}
        if change == .unexpectedRecipient {unexpectedKeyboardRecipient=true}
        if current.keyboardPID != after.keyboardPID || current.foregroundPID != after.foregroundPID || current.queryError != after.queryError {
            if transitions.count<128 {var row=current.json;row["t"]=now;transitions.append(row)}
        }
        after=current
    }
    func stop() {timer?.invalidate();timer=nil}
    func validate() throws {
        sample()
        if typingRouteChanged {throw BridgeError("BACKGROUND_TYPING_ROUTE_CHANGED","The experimental typing-focus reply changed while foreground stayed the same. Isolation could not be confirmed; no route restoration was attempted")}
        if targetGainedKeyboardFocus {throw BridgeError("BACKGROUND_KEYBOARD_FOCUS_CHANGED","The target obtained actual system keyboard focus during the operation. Background isolation failed; no foreground-restoration workaround was attempted.")}
        if unexpectedKeyboardRecipient {throw BridgeError("BACKGROUND_KEYBOARD_ROUTE_CHANGED","The actual keyboard recipient changed while the foreground app stayed the same. Isolation could not be confirmed; no focus restoration was attempted. This observation alone does not identify which process caused the change.")}
        if scopedInputInterrupted, let scopedInput {
            throw BridgeError(scopedInput.code("FOCUS_INTERRUPTED"), "A focus route changed or became unresolved during the scoped \(scopedInput.rawValue). Observe the target before retrying.")
        }
    }
    var json:[String:Any] {
        ["before":before.json,"after":after.json,"sampleCount":samples,
         "unresolvedSampleCount":unresolved,"keyboardFocusObserved":before.keyboardPID != nil && unresolved == 0,
         "targetGainedKeyboardFocus":targetGainedKeyboardFocus,"unexpectedKeyboardRecipient":unexpectedKeyboardRecipient,"maxSampleGapMs":maxSampleGap*1000,
         "experimentalTypingFocusRawBefore":typingRawBefore as Any? ?? NSNull(),"experimentalTypingFocusRawAfter":typingRawAfter as Any? ?? NSNull(),"experimentalTypingRouteChanged":typingRouteChanged,
         "transitions":transitions,"method":"read-only registry query, sampled; observation does not prevent focus stealing"]
    }
}

// Independent window routing; normal Accessibility authorization remains required.
// CGEventSetWindowLocation is an undocumented OS entrypoint. Resolve it at runtime,
// fail closed if absent, and never fall back to global HID input.
typealias WindowLocationSetter = @convention(c) (CGEvent, CGPoint) -> Void
let windowLocationSetter: WindowLocationSetter? = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation").map { unsafeBitCast($0, to: WindowLocationSetter.self) }

struct HeldBackgroundMouse {
    let pid: pid_t
    let windowID: CGWindowID
    let frame: CGRect
    let point: CGPoint
    let button: CGMouseButton
    let eventNumber:Int
    let source:CGEventSource
    let flags:CGEventFlags
}

@MainActor extension Desktop {
    func backgroundSource() throws -> CGEventSource {
        guard let source = CGEventSource(stateID: .privateState) else { throw BridgeError("EVENT_FAILED", "Could not create isolated event source") }
        source.localEventsSuppressionInterval = 0
        source.setLocalEventsFilterDuringSuppressionState(CGEventFilterMask(rawValue: UInt32.max), state: .eventSuppressionStateSuppressionInterval)
        return source
    }
    func routeBackground(_ event: CGEvent, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect, _ point: CGPoint,_ delivery:BackgroundPointerDelivery?=nil) throws {
        guard let setter = windowLocationSetter else { throw BridgeError("BACKGROUND_ROUTING_UNAVAILABLE", "CGEventSetWindowLocation is unavailable on this macOS. No foreground fallback was attempted.") }
        _ = try app(pid)
        event.location = point
        event.setIntegerValueField(.mouseEventWindowUnderMousePointer, value: Int64(wid))
        event.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: Int64(wid))
        // AppKit's windowNumber carrier, confirmed against locally received events.
        event.setIntegerValueField(CGEventField(rawValue: 51)!, value: Int64(wid))
        setter(event, CGPoint(x: point.x-frame.minX, y: point.y-frame.minY))
        if let delivery {try delivery.prepare(event)}
        else {event.setIntegerValueField(.eventSourceUserData,value:0x43554247)}
        event.postToPid(pid)
    }
    func backgroundMouse(_ kind: CGEventType, _ at: CGPoint, _ button: CGMouseButton, _ count: Int, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect,_ delivery:BackgroundPointerDelivery?=nil,_ modifiers:CGEventFlags?=nil) throws {
        if shuttingDown,[.leftMouseDown,.rightMouseDown,.otherMouseDown,.leftMouseDragged].contains(kind){throw BridgeError("CANCELLED","Helper is stopping; no further pointer down/drag was posted")}
        let type: NSEvent.EventType
        switch kind {
        case .leftMouseDown: type = .leftMouseDown
        case .leftMouseUp: type = .leftMouseUp
        case .rightMouseDown: type = .rightMouseDown
        case .rightMouseUp: type = .rightMouseUp
        case .otherMouseDown: type = .otherMouseDown
        case .otherMouseUp: type = .otherMouseUp
        case .leftMouseDragged: type = .leftMouseDragged
        default: throw BridgeError("INVALID_ARGUMENT", "Unsupported background mouse event")
        }
        let local = NSPoint(x: at.x-frame.minX, y: frame.height-(at.y-frame.minY))
        let isDown=[CGEventType.leftMouseDown,.rightMouseDown,.otherMouseDown].contains(kind)
        if isDown {backgroundMouseSequence=backgroundMouseSequence%32767+1}
        let eventNumber=isDown ? backgroundMouseSequence:(heldBackgroundMouse?.eventNumber ?? backgroundMouseSequence)
        let source=try (delivery?.eventSource ?? heldBackgroundMouse?.source ?? backgroundSource())
        guard let event = NSEvent.mouseEvent(with: type, location: local, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: Int(wid), context: nil, eventNumber: eventNumber, clickCount: count, pressure: kind == .leftMouseUp || kind == .rightMouseUp || kind == .otherMouseUp ? 0 : 1)?.cgEvent else { throw BridgeError("EVENT_FAILED", "Could not create window mouse event") }
        event.setSource(source)
        let flags=modifiers ?? heldBackgroundMouse?.flags ?? []
        event.flags = flags
        event.setIntegerValueField(.mouseEventButtonNumber, value: Int64(button.rawValue))
        // Observed subtype; the optional delivery guard removes its temporary
        // routing modifier at the target process before AppKit receives it.
        event.setIntegerValueField(.mouseEventSubtype, value: 3)
        try routeBackground(event, pid, wid, frame, at,delivery)
        if cursorTracksPointer {
            let down=[CGEventType.leftMouseDown,.rightMouseDown,.otherMouseDown,.leftMouseDragged].contains(kind)
            agentCursor.update(pid:pid,windowID:wid,frame:frame,point:at,pressed:down,activity:kind == .leftMouseDragged ? "drag":"click")
        }
        if [.leftMouseDown,.rightMouseDown,.otherMouseDown,.leftMouseDragged].contains(kind) { heldBackgroundMouse = HeldBackgroundMouse(pid: pid, windowID: wid, frame: frame, point: at, button: button,eventNumber:eventNumber,source:source,flags:flags) }
        if [.leftMouseUp,.rightMouseUp,.otherMouseUp].contains(kind) { heldBackgroundMouse = nil }
    }
    func belongsToWindow(_ element: AXUIElement, _ window: AXUIElement) -> Bool {
        var node: AXUIElement? = element
        for _ in 0..<64 {
            guard let current = node else { return false }
            if CFEqual(current, window) { return true }
            node = attr(current, kAXParentAttribute).flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
        }
        return false
    }
    // Some WebKit windows expose DOM focus on the AX text node while the
    // inactive application reports no AXFocusedUIElement. Read the bound
    // window only and require a unique focused field in a complete search.
    func windowFocusedEditable(_ window: AXUIElement) -> AXUIElement? {
        let editableRoles = [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole]
        let deadline = ProcessInfo.processInfo.systemUptime + 0.75
        var pending = children(window)
        var visited: [CFHashCode: [AXUIElement]] = [:]
        var result: AXUIElement?
        var remaining = 1000
        while let current = pending.popLast() {
            guard remaining > 0, ProcessInfo.processInfo.systemUptime < deadline else { return nil }
            remaining -= 1
            let hash = CFHash(current)
            if visited[hash, default: []].contains(where: { CFEqual($0, current) }) { continue }
            visited[hash, default: []].append(current)
            let role = attr(current, kAXRoleAttribute) as? String
            if role == kAXWindowRole { continue }
            if let role, editableRoles.contains(role), attr(current, kAXFocusedAttribute) as? Bool == true {
                guard result == nil else { return nil }
                result = current
            }
            if attr(current, kAXSubroleAttribute) as? String != kAXSecureTextFieldSubrole {
                pending.append(contentsOf: children(current))
            }
        }
        return result
    }
    func belongsToWebArea(_ element: AXUIElement) -> Bool {
        var node: AXUIElement? = element
        for _ in 0..<64 {
            guard let current = node else { return false }
            let role = attr(current, kAXRoleAttribute) as? String
            if role == "AXWebArea" { return true }
            if role == kAXWindowRole { return false }
            node = attr(current, kAXParentAttribute).flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
        }
        return false
    }
    func backgroundTextElement(_ p: Object, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect) throws -> AXUIElement {
        let window = try axWindow(pid, frame)
        let element: AXUIElement
        if p["snapshotId"] != nil || p["elementId"] != nil {
            let r = try ref(p)
            guard r.pid == pid, r.windowID == wid, r.scope == "window" else { throw BridgeError("TARGET_MISMATCH", "Text element is not in the requested window") }
            element = r.element
        } else if let value = attr(AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute), CFGetTypeID(value) == AXUIElementGetTypeID() {
            element = value as! AXUIElement
        } else if p["strategy"] as? String != "event", let focused = windowFocusedEditable(window) {
            element = focused
        } else {
            throw BridgeError("BACKGROUND_TEXT_TARGET_REQUIRED", "No unique focused text field in the bound window. Observe the current tree and pass typeText(text,{target:index}) for the exact editable element. Event strategy still requires the application's existing input focus.")
        }
        guard belongsToWindow(element, window) else { throw BridgeError("BACKGROUND_TEXT_TARGET_REQUIRED", "The application's internal text focus belongs to another window. Provide an exact observed text element.") }
        guard attr(element, kAXSubroleAttribute) as? String != kAXSecureTextFieldSubrole else { throw BridgeError("SECURE_INPUT", "Secure fields are excluded") }
        return element
    }
    func insertBackgroundText(_ p: Object, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect, expectedElement: AXUIElement) async throws -> Object {
        let element = try backgroundTextElement(p, pid, wid, frame)
        guard CFEqual(element, expectedElement) else {
            throw BridgeError("STALE_TEXT_FOCUS", "Text focus changed during cursor approach. Observe the target before typing.")
        }
        let webField = belongsToWebArea(element)
        if webField, attr(element, kAXFocusedAttribute) as? Bool != true {
            throw BridgeError("BACKGROUND_WEB_TEXT_FOCUS_REQUIRED", "Click the current editable field and verify its AX node says focused:true, then re-observe and use typeText. If a dialog appears, handle it and refresh the field index. No text was sent.")
        }
        let text = p["text"] as? String ?? ""
        guard let original = attr(element, kAXValueAttribute) as? String else { throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED", "Element has no readable AX text value; no global input fallback was attempted") }
        let ns = original as NSString
        guard ns.length <= 1_000_000 else { throw BridgeError("TEXT_TOO_LARGE", "Background insertion is bounded to one million existing UTF-16 units") }
        var selection = CFRange(location: ns.length, length: 0)
        if let value = attr(element, kAXSelectedTextRangeAttribute), CFGetTypeID(value) == AXValueGetTypeID() {
            guard AXValueGetValue(value as! AXValue, .cfRange, &selection) else { throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED", "Cannot read current text selection") }
        } else if !original.isEmpty { throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED", "No AX text selection; refusing to guess insertion position") }
        guard selection.location >= 0, selection.length >= 0, selection.location <= ns.length, selection.length <= ns.length-selection.location else { throw BridgeError("STALE_SELECTION", "Text selection is no longer valid") }
        let expected = ns.replacingCharacters(in: NSRange(location: selection.location, length: selection.length), with: text)
        var selectedSettable: DarwinBoolean = false
        _ = AXUIElementIsAttributeSettable(element, kAXSelectedTextAttribute as CFString, &selectedSettable)
        var valueSettable: DarwinBoolean = false
        _ = AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &valueSettable)
        let mechanism: String
        // Focused web inputs can advertise AXSelectedText and acknowledge its
        // setter without changing the page. Prefer writable AXValue there,
        // using the same observed UTF-16 range and exact readback.
        if selectedSettable.boolValue && !(webField && valueSettable.boolValue) {
            mechanism = "AXSelectedText insertion"
            try axCheck(AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFString), "Background text insertion")
        } else {
            guard valueSettable.boolValue else { throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED", "Neither AXSelectedText nor AXValue is writable; use an app-specific integration. No foreground fallback was attempted.") }
            mechanism = "AXValue insertion"
            try axCheck(AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, expected as CFString), "Background text insertion")
        }
        for _ in 0..<10 {
            if attr(element, kAXValueAttribute) as? String == expected {
                var end = CFRange(location: selection.location+(text as NSString).length, length: 0)
                if let encoded = AXValueCreate(.cfRange, &end) { _ = AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, encoded) }
                return ["ok": true, "mode": "background", "method": mechanism, "verified": true, "characters": text.count]
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        throw BridgeError("TEXT_VERIFICATION_FAILED", "\(mechanism) did not produce the expected readable value. It may have partly completed; refresh state before retrying.")
    }
    func insertBackgroundEventText(_ p:Object,_ pid:pid_t,_ wid:CGWindowID,_ frame:CGRect,_ observation:BackgroundFocusObservation) async throws -> Object {
        let root=AXUIElementCreateApplication(pid)
        let window=try axWindow(pid,frame)
        guard let focusedWindow=attr(root,kAXFocusedWindowAttribute),CFGetTypeID(focusedWindow)==AXUIElementGetTypeID(),CFEqual(focusedWindow,window) else {
            throw BridgeError("BACKGROUND_KEY_WINDOW_MISMATCH","Raw text requires the application's AX focused window to match. No focus or activation was performed.")
        }
        let element=try backgroundTextElement(p,pid,wid,frame)
        func checkFocus() throws {
            guard !shuttingDown else{throw BridgeError("CANCELLED","Helper is stopping; no further text event was posted")}
            _=try app(pid);try ensureEditableNotSecure(pid)
            guard let focused=attr(root,kAXFocusedUIElementAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID(),CFEqual(focused,element) else {
                throw BridgeError("BACKGROUND_EVENT_TEXT_FOCUS_MISMATCH","Raw text can only reach the current internal text focus. The observed element must already be focused; no AX focus action was performed.")
            }
        }
        try checkFocus()
        guard let original=attr(element,kAXValueAttribute) as? String else {throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED","Raw text requires readable text so that its effect can be verified")}
        let ns=original as NSString
        guard ns.length<=1_000_000 else {throw BridgeError("TEXT_TOO_LARGE","Existing text exceeds the verification bound")}
        var selected=CFRange(location:0,length:0)
        if let encoded=attr(element,kAXSelectedTextRangeAttribute),CFGetTypeID(encoded)==AXValueGetTypeID() {
            guard AXValueGetValue(encoded as! AXValue,.cfRange,&selected) else {throw BridgeError("STALE_SELECTION","Cannot read insertion range")}
        } else if !original.isEmpty {throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED","Raw text requires an observed insertion range")}
        guard selected.location>=0,selected.length>=0,selected.location<=ns.length,selected.length<=ns.length-selected.location else {throw BridgeError("STALE_SELECTION","Insertion range is invalid")}
        let text=p["text"] as? String ?? ""
        let expected=ns.replacingCharacters(in:NSRange(location:selected.location,length:selected.length),with:text)
        let source=try backgroundSource()
        let packets=backgroundUnicodePackets(text)
        var deliveredText=""
        for units in packets {
            try observation.validate()
            try checkFocus()
            for down in [true,false] {
                guard let event=CGEvent(keyboardEventSource:source,virtualKey:0,keyDown:down) else {throw BridgeError("EVENT_FAILED","Could not create Unicode keyboard event")}
                event.flags=[]
                units.withUnsafeBufferPointer{event.keyboardSetUnicodeString(stringLength:units.count,unicodeString:$0.baseAddress)}
                event.setIntegerValueField(CGEventField(rawValue:51)!,value:Int64(wid))
                event.setIntegerValueField(.eventSourceUserData,value:0x43554247)
                event.timestamp=DispatchTime.now().uptimeNanoseconds
                event.postToPid(pid)
            }
            deliveredText += String(utf16CodeUnits:units,count:units.count)
            let partial=ns.replacingCharacters(in:NSRange(location:selected.location,length:selected.length),with:deliveredText)
            var acknowledged=false
            // AppKit can drop bursts while laying out long or multiline input.
            // Readback is an acknowledgement barrier, never an action retry.
            for _ in 0..<25 {
                try await Task.sleep(nanoseconds:10_000_000)
                try observation.validate()
                if let actual=attr(element,kAXValueAttribute) as? String,Array(actual.utf16)==Array(partial.utf16) {acknowledged=true;break}
            }
            guard acknowledged else{throw BridgeError("TEXT_VERIFICATION_FAILED","A Unicode packet did not produce its exact expected text. Input may be partial; no packet was resent and no AX or foreground fallback was attempted. Observe before retrying.")}
        }
        for _ in 0..<15 {
            if let actual=attr(element,kAXValueAttribute) as? String,Array(actual.utf16)==Array(expected.utf16) {
                return ["ok":true,"mode":"background","method":"Unicode CGEvent.postToPid","strategy":"event","verified":true,"AXActionsGenerated":false,"characters":text.count,"packets":packets.count]
            }
            try await Task.sleep(nanoseconds:20_000_000)
        }
        throw BridgeError("TEXT_VERIFICATION_FAILED","Raw Unicode events did not produce the exact expected text. The application may ignore or transform them; the operation may be partial. No AX or foreground fallback was attempted. Observe before retrying.")
    }
    func modifierFlags(_ text:String) throws -> CGEventFlags {
        var flags:CGEventFlags=[]
        for part in text.lowercased().split(separator:"+",omittingEmptySubsequences:false) {
            switch part {
            case "cmd","command","meta","super":flags.insert(.maskCommand)
            case "ctrl","control":flags.insert(.maskControl)
            case "alt","option":flags.insert(.maskAlternate)
            case "shift":flags.insert(.maskShift)
            default:throw BridgeError("UNKNOWN_MODIFIER","Unknown click modifier \(part)")
            }
        }
        return flags
    }
    func releaseBackgroundKey() {
        guard let held=heldBackgroundKey else{return};heldBackgroundKey=nil;held.up.timestamp=DispatchTime.now().uptimeNanoseconds;held.up.postToPid(held.pid)
    }
    func waitInputHold(_ p:Object,_ frame:CGRect,_ observation:BackgroundFocusObservation,_ milliseconds:Double) async throws {
        guard milliseconds.isFinite,milliseconds>=0,milliseconds<=5000 else{throw BridgeError("INVALID_ARGUMENT","durationMs must be from 0 to 5000")}
        let deadline=ProcessInfo.processInfo.systemUptime+milliseconds/1000
        repeat {
            if shuttingDown {throw BridgeError("CANCELLED","Helper stopped during hold")}
            try Task.checkCancellation();try observation.validate()
            guard (try target(p)).2==frame else{throw BridgeError("WINDOW_MOVED","Window geometry changed during hold; input was released")}
            let remaining=deadline-ProcessInfo.processInfo.systemUptime
            if remaining<=0 {break}
            try await Task.sleep(nanoseconds:UInt64(min(0.02,remaining)*1e9))
        }while true
    }
    func requireBackgroundFocusedTarget(_ pid: pid_t, _ frame: CGRect, mismatchCode: String = "BACKGROUND_KEY_WINDOW_MISMATCH") throws {
        let root = AXUIElementCreateApplication(pid); let window = try axWindow(pid, frame)
        guard let focused = attr(root, kAXFocusedWindowAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID(), CFEqual(focused, window) else { throw BridgeError(mismatchCode, "The target does not match the application's AX focused window. This does not assert NSApp key-window or text-input-context activation.") }
        try ensureEditableNotSecure(pid)
    }
    func backgroundKeyChord(_ p: Object) throws -> (name: String, flags: CGEventFlags) {
        let parts = try string(p, "key").lowercased().split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces) }
        guard let last = parts.last else { throw BridgeError("UNKNOWN_KEY", "Empty key") }
        var flags: CGEventFlags = []
        for modifier in parts.dropLast() {
            switch modifier {
            case "cmd","command","meta","super": flags.insert(.maskCommand)
            case "ctrl","control": flags.insert(.maskControl)
            case "alt","option": flags.insert(.maskAlternate)
            case "shift": flags.insert(.maskShift)
            default: throw BridgeError("UNKNOWN_KEY", "Unknown modifier \(modifier)")
            }
        }
        return (last, flags)
    }
    func backgroundKey(_ p: Object, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect,_ observation:BackgroundFocusObservation) async throws -> Object {
        try requireBackgroundFocusedTarget(pid, frame)
        let (last, flags) = try backgroundKeyChord(p)
        // AppKit key-equivalent dispatch in inactive apps is inconsistent. Select
        // all has an exact AX equivalent which we can verify without any key event.
        if p["durationMs"] == nil, (p["strategy"] as? String ?? "auto") == "auto", flags == .maskCommand, last == "a" {
            let element = try backgroundTextElement(p, pid, wid, frame)
            if let value = attr(element, kAXValueAttribute) as? String {
                var settable: DarwinBoolean = false
                _ = AXUIElementIsAttributeSettable(element, kAXSelectedTextRangeAttribute as CFString, &settable)
                if settable.boolValue {
                    var all = CFRange(location:0,length:(value as NSString).length)
                    try axCheck(AXUIElementSetAttributeValue(element,kAXSelectedTextRangeAttribute as CFString,AXValueCreate(.cfRange,&all)!),"Background select all")
                    if let encoded = attr(element,kAXSelectedTextRangeAttribute), CFGetTypeID(encoded) == AXValueGetTypeID() {
                        var actual = CFRange()
                        if AXValueGetValue(encoded as! AXValue,.cfRange,&actual), actual.location == 0, actual.length == all.length {
                            return ["ok":true,"mode":"background","method":"AXSelectedTextRange select all","verified":true]
                        }
                    }
                    throw BridgeError("TEXT_VERIFICATION_FAILED","Select-all range could not be verified; observe before retrying")
                }
            }
        }
        let code = try keyCode(last); let source = try backgroundSource()
        guard let down=CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:true),let up=CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:false) else{throw BridgeError("EVENT_FAILED","Could not create paired keyboard events")}
        for event in [down,up] {
            event.flags=flags;event.setIntegerValueField(CGEventField(rawValue:51)!,value:Int64(wid))
            event.setIntegerValueField(.eventSourceUserData,value:0x43554247)
        }
        heldBackgroundKey=(pid,up);defer{releaseBackgroundKey()}
        down.postToPid(pid)
        let started=ProcessInfo.processInfo.systemUptime
        try await waitInputHold(p,frame,observation,number(p,"durationMs"))
        releaseBackgroundKey()
        return ["ok":true,"mode":"background","method":"CGEvent.postToPid","AXActionsGenerated":false,"verificationRequired":true,"heldDurationMs":(ProcessInfo.processInfo.systemUptime-started)*1000,"repeatEventsGenerated":0,"globalModifierEvents":0]
    }
    func backgroundPressTarget(_ p:Object,_ pid:pid_t,_ frame:CGRect,_ point:CGPoint) throws -> AXUIElement? {
        func pressable(_ element:AXUIElement)->Bool {
            guard attr(element,kAXSubroleAttribute) as? String != kAXSecureTextFieldSubrole else{return false}
            var actions:CFArray?
            return AXUIElementCopyActionNames(element,&actions) == .success && (actions as? [String] ?? []).contains(kAXPressAction)
        }
        if p["elementId"] != nil {
            let element=try ref(p).element
            return pressable(element) ? element : nil
        }
        // Scope hit-testing to this window's own AX hierarchy. Global AX hit-test
        // would resolve the foreground cover instead of the occluded target.
        let window=try axWindow(pid,frame);var remaining=1000
        let deadline=Date().addingTimeInterval(2)
        func search(_ element:AXUIElement,_ depth:Int)->AXUIElement? {
            guard remaining>0,depth<30,Date()<deadline else{return nil};remaining-=1
            guard let bounds=axFrame(element),bounds.contains(point) else{return nil}
            for child in children(element) {if let found=search(child,depth+1){return found}}
            return pressable(element) ? element : nil
        }
        return search(window,0)
    }

    func checkBackgroundPopup(_ element: AXUIElement) throws {
        // AppKit and Chromium can present a native menu even for an AX press.
        guard attr(element, kAXRoleAttribute) as? String == kAXPopUpButtonRole else { return }
        var actions: CFArray?
        guard AXUIElementCopyActionNames(element, &actions) == .success, let names = actions as? [String] else { return }
        let actionSet = Set(names)
        let items = children(element)
        var writable = DarwinBoolean(false)
        let nativePopup = actionSet == [kAXPressAction, kAXShowMenuAction] && items.isEmpty &&
            AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &writable) == .success && !writable.boolValue
        let webPopup = actionSet == [kAXPressAction, kAXShowMenuAction, "AXScrollToVisible"] &&
            items.count <= 1 && items.allSatisfy { attr($0, kAXRoleAttribute) as? String == kAXMenuItemRole } &&
            belongsToWebArea(element)
        guard nativePopup || webPopup else { return }
        let message = "This closed popup can open a native menu and take the user's keyboard focus. No input was sent."
        if webPopup {
            throw BridgeError("BACKGROUND_POPUP_UNSUPPORTED", message + " Try app-local AX focus and a printable key matching the option's prefix, then verify the selected value.")
        }
        throw BridgeError("BACKGROUND_POPUP_UNSUPPORTED", message)
    }

    // A row label is often exposed as AXStaticText with no AXPress. Use the
    // containing table's declared selection attribute for a single row click.
    func backgroundTableRow(_ element: AXUIElement, passiveOnly: Bool = false) -> (table: AXUIElement, row: AXUIElement)? {
        let rowRoles = [kAXRowRole, kAXCellRole, kAXStaticTextRole]
        guard let role = attr(element, kAXRoleAttribute) as? String, rowRoles.contains(role) else { return nil }
        var node: AXUIElement? = element
        var row: AXUIElement?
        for _ in 0..<32 {
            guard let current = node, let role = attr(current, kAXRoleAttribute) as? String else { return nil }
            if role == kAXWindowRole || role == kAXSheetRole { return nil }
            if passiveOnly, row == nil {
                var actions: CFArray?
                guard rowRoles.contains(role), AXUIElementCopyActionNames(current, &actions) == .success,
                      (actions as? [String])?.isEmpty == true else { return nil }
            }
            if role == kAXRowRole, row == nil { row = current }
            if role == kAXTableRole || role == kAXOutlineRole {
                guard let row, children(current, kAXRowsAttribute).contains(where: { CFEqual($0, row) }) else { return nil }
                var writable = DarwinBoolean(false)
                guard AXUIElementIsAttributeSettable(current, kAXSelectedRowsAttribute as CFString, &writable) == .success,
                      writable.boolValue else { return nil }
                return (current, row)
            }
            node = attr(current, kAXParentAttribute).flatMap {
                CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil
            }
        }
        return nil
    }

    func checkBackgroundRowDrag(_ pid: pid_t, _ frame: CGRect, _ start: CGPoint) throws {
        // AppKit can take system key focus when a passive table row starts a
        // native drag. The drag image can appear after the focus change.
        let application = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(application, 1)
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(application, Float(start.x), Float(start.y), &hit) == .success,
              let hit, let selection = backgroundTableRow(hit, passiveOnly: true),
              attr(selection.table, kAXRoleAttribute) as? String == kAXTableRole,
              !belongsToWebArea(selection.table),
              belongsToWindow(selection.table, try axWindow(pid, frame)) else { return }
        throw BridgeError("BACKGROUND_NATIVE_ROW_DRAG_UNSUPPORTED", "Dragging this passive native table row can start macOS drag tracking and take keyboard focus. No pointer input was sent. Use a row-move control if the app exposes one.")
    }

    func selectBackgroundTableRow(_ selection: (table: AXUIElement, row: AXUIElement), window: AXUIElement,
                                  observation: BackgroundFocusObservation) async throws -> Object {
        func attachedSheet() -> Bool {
            children(window).contains { attr($0, kAXRoleAttribute) as? String == kAXSheetRole }
        }
        guard !attachedSheet() else {
            throw BridgeError("BACKGROUND_SHEET_PRESENT", "Handle the attached dialog before selecting a table row. No selection was sent.")
        }
        try axCheck(AXUIElementSetAttributeValue(selection.table, kAXSelectedRowsAttribute as CFString, [selection.row] as CFArray),
                    "Background table row selection")
        for _ in 0..<15 {
            try await Task.sleep(nanoseconds: 20_000_000)
            try observation.validate()
            if attachedSheet() {
                return ["ok": true, "mode": "background", "method": "AXSelectedRows", "selectionOutcome": "dialogOpened", "verificationRequired": true]
            }
            let rows = children(selection.table, kAXSelectedRowsAttribute)
            if rows.count == 1, CFEqual(rows[0], selection.row) {
                return ["ok": true, "mode": "background", "method": "AXSelectedRows", "selectionOutcome": "rowSelected", "verificationRequired": true]
            }
        }
        throw BridgeError("TABLE_SELECTION_UNVERIFIED", "The table did not report the requested selection or a dialog. Observe the window before retrying.")
    }

    func backgroundWindowOrder() -> [(id:Int,pid:pid_t)] {
        let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [Object] ?? []
        return rows.compactMap { row in
            guard number(row,kCGWindowLayer as String) == 0, let id=row[kCGWindowNumber as String] as? Int,let pid=row[kCGWindowOwnerPID as String] as? Int else{return nil}
            return (id:id,pid:pid_t(pid))
        }
    }
    func assertBackgroundIsolation(_ pid:pid_t,_ wid:CGWindowID,_ orderBefore:[(id:Int,pid:pid_t)],_ foregroundBefore:pid_t?) throws {
        if foregroundBefore != pid, NSWorkspace.shared.frontmostApplication?.processIdentifier == pid { throw BridgeError("BACKGROUND_APP_ACTIVATED","The target app activated itself in response to the action. Background isolation was not maintained; no activation-restoration workaround was attempted.") }
        let orderAfter = backgroundWindowOrder()
        if let beforeIndex=orderBefore.firstIndex(where:{$0.id==Int(wid)}),let afterIndex=orderAfter.firstIndex(where:{$0.id==Int(wid)}) {
            let previouslyAbove=Set(orderBefore.prefix(beforeIndex).filter{$0.pid != pid}.map{$0.id})
            if orderAfter.dropFirst(afterIndex+1).contains(where:{previouslyAbove.contains($0.id)}) {
                throw BridgeError("BACKGROUND_WINDOW_REORDERED","Window stacking changed during the operation. Isolation could not be confirmed; no window-order restoration was attempted. Observe before retrying.")
            }
        }
    }
    func background(_ method: String, _ input: Object) async throws -> Object {
        try requireAX()
        cursorTracksPointer=false
        var cursorSucceeded=false
        defer {cursorTracksPointer=false;if !cursorSucceeded {agentCursor.hide()}}
        var p = input
        if let value=p["durationMs"] {
            guard let duration=value as? NSNumber,duration.doubleValue.isFinite,duration.doubleValue>=0,duration.doubleValue<=5000 else{throw BridgeError("INVALID_ARGUMENT","durationMs must be from 0 to 5000")}
        }
        if method == "click", p["elementId"] != nil {
            let r = try ref(p)
            guard r.scope == "window" else { throw BridgeError("BACKGROUND_MENU_UNSUPPORTED", "Global app menu interaction is not part of background pointer routing") }
            p["pid"] = Int(r.pid); p["windowId"] = Int(r.windowID)
            let (_,_,frame) = try target(p)
            guard let rect = axFrame(r.element) else { throw BridgeError("NO_ELEMENT_FRAME", "Use a supported AX action") }
            p["x"] = rect.midX-frame.minX; p["y"] = rect.midY-frame.minY
        }
        let (application, _, frame) = try target(p)
        let pid = application.processIdentifier; let wid = CGWindowID(number(p,"windowId"))
        guard application.isHidden == false, (try target(p)).1["onScreen"] as? Bool == true else {
            throw BridgeError("WINDOW_NOT_VISIBLE","Background input requires a non-minimized window on the active desktop; full occlusion is supported")
        }
        let orderBefore = backgroundWindowOrder()
        let foregroundBefore = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let scopedInput = p["strategy"] as? String == "appkit" ? ScopedAppKitInput(rawValue: method) : nil
        if let scopedInput {
            guard scopedInput.bundleIDs.contains(application.bundleIdentifier ?? "") else {
                throw BridgeError(scopedInput.code("NOT_ENABLED"), "This application is not enabled for the experimental AppKit \(method) strategy. No input was sent.")
            }
            if scopedInput == .key { _ = try keyCode(backgroundKeyChord(p).name) }
            try requireBackgroundFocusedTarget(pid, frame, mismatchCode: scopedInput == .key ? "BACKGROUND_KEY_WINDOW_MISMATCH" : "SCOPED_CLICK_WINDOW_MISMATCH")
        }
        let inputObservation=try BackgroundFocusObservation(targetPID:pid, scopedInput:scopedInput)
        defer {inputObservation.stop()}
        var pointerDelivery:BackgroundPointerDelivery?
        var appKitSession:ScopedAppKitFocus?
        defer {
            releaseBackgroundKey()
            // Cleanup is a plain target-only mouse-up; it does not depend on
            // a modifier-rewriting tap being enabled during cancellation.
            if let held=heldBackgroundMouse,held.pid==pid,held.windowID==wid {
                let up:CGEventType=held.button == .left ? .leftMouseUp:held.button == .right ? .rightMouseUp:.otherMouseUp
                try? backgroundMouse(up,held.point,held.button,1,held.pid,held.windowID,held.frame)
            }
            appKitSession?.finish();activeAppKitSession=nil
            pointerDelivery?.stop()
        }
        var result: Object
        do {
        switch method {
        case "click":
            let point = try point(p, frame)
            let name = p["button"] as? String ?? "left"
            let button: CGMouseButton = name == "right" ? .right : name == "middle" ? .center : .left
            let down: CGEventType = button == .left ? .leftMouseDown : button == .right ? .rightMouseDown : .otherMouseDown
            let up: CGEventType = button == .left ? .leftMouseUp : button == .right ? .rightMouseUp : .otherMouseUp
            let count = min(3,max(1,Int(number(p,"count",1))))
            let strategy = p["strategy"] as? String ?? "auto"
            let modifiers=try (p["modifiers"] as? String).map{try modifierFlags($0)} ?? []
            let extended=p["modifiers"] != nil || p["durationMs"] != nil
            if extended,strategy == "ax"{throw BridgeError("INVALID_ARGUMENT","Modifier/hold clicks require event delivery")}
            let semantic = !extended && strategy != "event" && scopedInput == nil && button == .left && count == 1
            let candidate = semantic || scopedInput == .click ? try backgroundPressTarget(p,pid,frame,point) : try? backgroundPressTarget(p,pid,frame,point)
            if let candidate { try checkBackgroundPopup(candidate) }
            if semantic, let element = candidate {
                try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
                try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                try axCheck(AXUIElementPerformAction(element,kAXPressAction as CFString),"Background press")
                agentCursor.update(pid:pid,windowID:wid,frame:frame,point:point,activity:"click",activate:true)
                result = ["ok":true,"mode":"background","method":"AXPress","verificationRequired":true]
                break
            }
            if semantic, p["elementId"] != nil,
               let selection = backgroundTableRow(try ref(p).element) {
                try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
                try inputObservation.validate()
                try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                guard let current = backgroundTableRow(try ref(p).element),
                      CFEqual(current.table, selection.table), CFEqual(current.row, selection.row) else {
                    throw BridgeError("STALE_ELEMENT", "The table row changed during cursor approach. Observe it before selecting.")
                }
                result = try await selectBackgroundTableRow(current, window: try axWindow(pid, frame), observation: inputObservation)
                break
            }
            guard strategy != "ax" else {throw BridgeError("BACKGROUND_CLICK_UNSUPPORTED","No semantic click equivalent at this target; no event was sent")}
            try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
            pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
            appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
            if scopedInput == .click {
                guard appKitSession != nil else {
                    throw BridgeError("SCOPED_CLICK_FOCUS_INTERRUPTED", "The app is no longer eligible for scoped focus preparation. No click at the requested point was sent.")
                }
                guard (try target(p)).2 == frame else {
                    throw BridgeError("WINDOW_MOVED", "The target moved during scoped focus preparation. Observe it before clicking.")
                }
                try requireBackgroundFocusedTarget(pid, frame, mismatchCode: "SCOPED_CLICK_WINDOW_MISMATCH")
                if let candidate = try backgroundPressTarget(p, pid, frame, point) { try checkBackgroundPopup(candidate) }
            }
            try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            cursorTracksPointer=true
            for i in 1...count {
                try inputObservation.validate();try backgroundMouse(down,point,button,i,pid,wid,frame,pointerDelivery,modifiers)
                try await waitInputHold(p,frame,inputObservation,number(p,"durationMs",20))
                try backgroundMouse(up,point,button,i,pid,wid,frame,pointerDelivery,modifiers)
            }
            result = ["ok":true,"mode":"background","method":"window-scoped CGEvent.postToPid","verificationRequired":true]
        case "scroll":
            let at = try point(["x":p["x"] ?? frame.width/2,"y":p["y"] ?? frame.height/2],frame)
            try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:at,activity:"scroll")
            try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            guard let event = CGEvent(scrollWheelEvent2Source:try backgroundSource(),units:.pixel,wheelCount:2,wheel1:Int32(number(p,"deltaY")),wheel2:Int32(number(p,"deltaX")),wheel3:0) else { throw BridgeError("EVENT_FAILED","Could not create scroll event") }
            event.flags=[]; try routeBackground(event,pid,wid,frame,at)
            agentCursor.update(pid:pid,windowID:wid,frame:frame,point:at,activity:"scroll")
            result = ["ok":true,"mode":"background","method":"window-scoped CGEvent.postToPid","verificationRequired":true]
        case "drag":
            let from = try point(p,frame,"fromX","fromY"); let to = try point(p,frame,"toX","toY")
            let duration = min(2,max(0.1,number(p,"duration",0.4)))
            try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:from,activity:"drag")
            if foregroundBefore != pid { try checkBackgroundRowDrag(pid, frame, from) }
            pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
            appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
            try inputObservation.validate()
            try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            cursorTracksPointer=true
            try backgroundMouse(.leftMouseDown,from,.left,1,pid,wid,frame,pointerDelivery)
            var last=from
            let dragSteps=max(6,Int(ceil(duration*60)))
            for i in 1...dragSteps {
                try inputObservation.validate()
                let (_,_,current) = try target(p)
                guard current == frame else { throw BridgeError("WINDOW_MOVED","Window moved during drag; stopped without following the global pointer") }
                last=CGPoint(x:from.x+(to.x-from.x)*Double(i)/Double(dragSteps),y:from.y+(to.y-from.y)*Double(i)/Double(dragSteps))
                try backgroundMouse(.leftMouseDragged,last,.left,1,pid,wid,frame,pointerDelivery)
                try await Task.sleep(nanoseconds:UInt64(duration/Double(dragSteps)*1e9))
            }
            try backgroundMouse(.leftMouseUp,last,.left,1,pid,wid,frame,pointerDelivery)
            result=["ok":true,"mode":"background","method":"window-scoped CGEvent.postToPid","verificationRequired":true]
        case "type_text":
            let strategy=p["strategy"] as? String ?? "auto"
            guard ["auto","ax","event"].contains(strategy) else {throw BridgeError("INVALID_ARGUMENT","Unknown text strategy")}
            let textElement=try backgroundTextElement(p,pid,wid,frame)
            if let at=axFrame(textElement){try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:"type")}
            if strategy == "event",ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1" {
                let element=try backgroundTextElement(p,pid,wid,frame)
                guard let focused=attr(AXUIElementCreateApplication(pid),kAXFocusedUIElementAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID(),CFEqual(focused,element) else{throw BridgeError("BACKGROUND_EVENT_TEXT_FOCUS_MISMATCH","Experimental raw text still requires its exact existing editable focus; no notice was sent")}
                let selectionBefore=attr(element,kAXSelectedTextRangeAttribute)
                pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
                appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
                try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                if let selectionBefore,let after=attr(element,kAXSelectedTextRangeAttribute),!CFEqual(selectionBefore,after){throw BridgeError("STALE_SELECTION","App-local focus preparation changed the text selection; no text event was sent")}
            }
            try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            result=strategy == "event" ? try await insertBackgroundEventText(p,pid,wid,frame,inputObservation):try await insertBackgroundText(p,pid,wid,frame,expectedElement:textElement)
        case "key":
            let normalized=(p["key"] as? String ?? "").lowercased().replacingOccurrences(of:" ",with:"")
            let semanticSelectAll=p["durationMs"] == nil && (p["strategy"] as? String ?? "auto") == "auto" && ["cmd+a","command+a","meta+a","super+a"].contains(normalized)
            if let focused=attr(AXUIElementCreateApplication(pid),kAXFocusedUIElementAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID() {
                let element = focused as! AXUIElement
                if ["down", "up", "space", "enter", "return", "alt+down", "option+down", "alt+up", "option+up"].contains(normalized) {
                    try checkBackgroundPopup(element)
                }
                if let at=axFrame(element) {try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:"key")}
            }
            if scopedInput == .key || (!semanticSelectAll && ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1") {
                pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
                appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
                if scopedInput == .key && appKitSession == nil {
                    throw BridgeError("SCOPED_KEY_FOCUS_INTERRUPTED", "The app is no longer eligible for scoped focus preparation. No key was sent.")
                }
                try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            }
            try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            result=try await backgroundKey(p,pid,wid,frame,inputObservation)
        default: throw BridgeError("METHOD_NOT_FOUND","Unsupported background method")
        }
        if let pointerDelivery {try await pointerDelivery.waitForDelivery();result["pointerDelivery"]=pointerDelivery.json}
        appKitSession?.finish()
        if let appKitSession {result["appKitFocusSession"]=appKitSession.json}
        try await Task.sleep(nanoseconds:80_000_000)
        try inputObservation.validate()
        try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
        result["inputFocusObservation"]=inputObservation.json
        cursorSucceeded=true
        return result
        } catch {
            if let held=heldBackgroundMouse,held.pid==pid,held.windowID==wid {
                let up:CGEventType=held.button == .left ? .leftMouseUp:held.button == .right ? .rightMouseUp:.otherMouseUp
                try? backgroundMouse(up,held.point,held.button,1,held.pid,held.windowID,held.frame)
            }
            appKitSession?.finish();activeAppKitSession=nil
            if appKitSession != nil {try? await Task.sleep(nanoseconds:80_000_000)}
            throw error
        }
    }
}
