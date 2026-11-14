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
    var publicFocusChanged=false
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
        timer=Timer.scheduledTimer(withTimeInterval:SystemInputFocus.publicAPIOnly ? 0.025 : 0.005,repeats:true) { [weak self] _ in
            MainActor.assumeIsolated {self?.sample()}
        }
    }
    func sample() {
        let now=ProcessInfo.processInfo.systemUptime-started
        if samples>0 {maxSampleGap=max(maxSampleGap,now-lastSampleTime)}
        lastSampleTime=now;samples += 1
        let current=SystemInputFocus.observe()
        if SystemInputFocus.publicAPIOnly {
            publicFocusChanged = publicFocusChanged || current.foregroundPID != before.foregroundPID ||
                current.accessibilityPID != before.accessibilityPID
        }
        typingRawAfter=ExperimentalTypingFocus.read(forScopedInput: scopedInput != nil)
        if scopedInput != nil && (current.foregroundPID != before.foregroundPID || current.keyboardPID == nil || typingRawAfter == nil || typingRawAfter == 0) {
            scopedInputInterrupted=true
        }
        if let prior=typingRawBefore,let now=typingRawAfter,prior>0,now>0,prior != now,current.foregroundPID==before.foregroundPID {typingRouteChanged=true}
        if current.keyboardPID == nil {unresolved += 1}
        let change=current.change(from:before,targetPID:targetPID)
        if change == .targetGainedFocus {targetGainedKeyboardFocus=true}
        if change == .unexpectedRecipient {unexpectedKeyboardRecipient=true}
        if current.keyboardPID != after.keyboardPID || current.foregroundPID != after.foregroundPID ||
            current.accessibilityPID != after.accessibilityPID || current.queryError != after.queryError {
            if transitions.count<128 {var row=current.json;row["t"]=now;transitions.append(row)}
        }
        after=current
    }
    func stop() {timer?.invalidate();timer=nil}
    func validate() throws {
        sample()
        if SystemInputFocus.publicAPIOnly, (before.foregroundPID == nil || before.accessibilityPID == nil) {
            throw BridgeError("BACKGROUND_ACCESSIBILITY_FOCUS_UNAVAILABLE", "Could not establish foreground and system Accessibility focus before background input. No action was sent.")
        }
        if publicFocusChanged {
            throw BridgeError("BACKGROUND_ACCESSIBILITY_FOCUS_CHANGED", "Foreground or system Accessibility focus changed during background input. Observe before retrying.")
        }
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
         "transitions":transitions,"method":SystemInputFocus.publicAPIOnly ? "sampled NSWorkspace and system Accessibility focus" : "read-only registry query, sampled; observation does not prevent focus stealing"]
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
        let observed = p["replaceAll"] as? String
        if let observed {
            guard attr(element, kAXFocusedAttribute) as? Bool == true else {
                throw BridgeError("BACKGROUND_TEXT_TARGET_REQUIRED", "Focus the observed text target and confirm its focus before replacing its value.")
            }
            guard original.utf16.elementsEqual(observed.utf16) else {
                throw BridgeError("STALE_TEXT_VALUE", "The current text differs from the observed replacement value. No text was sent.")
            }
        }
        var selection = CFRange(location: ns.length, length: 0)
        if let value = attr(element, kAXSelectedTextRangeAttribute), CFGetTypeID(value) == AXValueGetTypeID() {
            guard AXValueGetValue(value as! AXValue, .cfRange, &selection) else { throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED", "Cannot read current text selection") }
        } else if !original.isEmpty { throw BridgeError("BACKGROUND_TEXT_UNSUPPORTED", "No AX text selection; refusing to guess insertion position") }
        guard selection.location >= 0, selection.length >= 0, selection.location <= ns.length, selection.length <= ns.length-selection.location else { throw BridgeError("STALE_SELECTION", "Text selection is no longer valid") }
        var selectedSettable: DarwinBoolean = false
        _ = AXUIElementIsAttributeSettable(element, kAXSelectedTextAttribute as CFString, &selectedSettable)
        var valueSettable: DarwinBoolean = false
        _ = AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &valueSettable)
        // Focused web inputs can advertise AXSelectedText and acknowledge its
        // setter without changing the page. Prefer writable AXValue there,
        // using the same observed UTF-16 range and exact readback.
        let useSelectedText = selectedSettable.boolValue && !(webField && valueSettable.boolValue)
        if observed != nil {
            if useSelectedText, selection.location != 0 || selection.length != ns.length {
                var all = CFRange(location: 0, length: ns.length)
                guard let encoded = AXValueCreate(.cfRange, &all) else { throw BridgeError("AX_ERROR", "Could not encode full selection") }
                try axCheck(AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, encoded), "Select full text")
                guard let current = attr(element, kAXSelectedTextRangeAttribute), CFGetTypeID(current) == AXValueGetTypeID(),
                      AXValueGetValue(current as! AXValue, .cfRange, &selection), selection.location == 0, selection.length == ns.length,
                      let value = attr(element, kAXValueAttribute) as? String, value.utf16.elementsEqual(original.utf16),
                      attr(element, kAXFocusedAttribute) as? Bool == true else {
                    throw BridgeError("STALE_SELECTION", "Could not verify the full selection and its current text. No text was sent.")
                }
            }
            selection = CFRange(location: 0, length: ns.length)
        }
        let expected = ns.replacingCharacters(in: NSRange(location: selection.location, length: selection.length), with: text)
        let mechanism: String
        if useSelectedText {
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
    func postBackgroundUnicode(_ units: [UniChar], source: CGEventSource, pid: pid_t, wid: CGWindowID) throws {
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else {
            throw BridgeError("EVENT_FAILED", "Could not create paired Unicode keyboard events")
        }
        for event in [down, up] {
            event.flags = []
            units.withUnsafeBufferPointer { event.keyboardSetUnicodeString(stringLength: $0.count, unicodeString: $0.baseAddress) }
            if !SystemInputFocus.publicAPIOnly { event.setIntegerValueField(CGEventField(rawValue: 51)!, value: Int64(wid)) }
            event.setIntegerValueField(.eventSourceUserData, value: 0x43554247)
            event.timestamp = DispatchTime.now().uptimeNanoseconds
            event.postToPid(pid)
        }
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
            try postBackgroundUnicode(units, source: source, pid: pid, wid: wid)
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
    func insertVisuallyCheckedText(_ p: Object, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect,
                                   _ observation: BackgroundFocusObservation, _ order: NormalWindowOrder, _ foreground: pid_t?) async throws -> Object {
        func singleLine(_ value: String) -> Bool {
            (1...160).contains(value.utf16.count) && value.unicodeScalars.allSatisfy {
                ![.control, .lineSeparator, .paragraphSeparator].contains($0.properties.generalCategory)
            }
        }
        guard let check = p["visualCheck"] as? Object, let before = check["before"] as? String,
              let text = p["text"] as? String, singleLine(before), singleLine(text), !before.utf16.elementsEqual(text.utf16),
              let bounds = check["region"] as? Object else {
            throw BridgeError("INVALID_ARGUMENT", "visualCheck requires distinct observed and requested single lines of 1–160 UTF-16 units")
        }
        let region = CGRect(x: number(bounds, "x", -1), y: number(bounds, "y", -1),
                            width: number(bounds, "width"), height: number(bounds, "height"))
        guard [region.minX, region.minY, region.width, region.height].allSatisfy(\.isFinite),
              number(bounds, "width") > 0, number(bounds, "height") > 0,
              CGRect(origin: .zero, size: frame.size).contains(region) else {
            throw BridgeError("INVALID_ARGUMENT", "Visual check region must fit inside the window in logical points")
        }
        let packets = text.map { Array(String($0).utf16) }
        guard packets.allSatisfy({ $0.count <= 16 }) else {
            throw BridgeError("INVALID_ARGUMENT", "Visual text input requires each character to fit in one Unicode event")
        }
        let root = AXUIElementCreateApplication(pid)
        let window = try axWindow(pid, frame)
        guard attr(window, kAXRoleAttribute) as? String == kAXWindowRole,
              attr(window, kAXSubroleAttribute) as? String == kAXStandardWindowSubrole else {
            throw BridgeError("BACKGROUND_EVENT_TEXT_FOCUS_MISMATCH", "Visual text input requires an exact standard window")
        }
        guard let foreground, foreground != pid, observation.before.keyboardPID != nil else {
            throw BridgeError("BACKGROUND_EVENT_TEXT_FOCUS_MISMATCH", "Visual text input requires a background target and an observed keyboard recipient")
        }
        func checkFocus() throws {
            try Task.checkCancellation()
            guard !shuttingDown else { throw BridgeError("CANCELLED", "Helper stopped during visual text input") }
            let (application, currentWindow, currentFrame) = try target(p)
            guard currentFrame == frame, currentWindow["onScreen"] as? Bool == true, !application.isHidden else {
                throw BridgeError("WINDOW_MOVED", "Window geometry or visibility changed during visual text input. Observe before retrying.")
            }
            try ensureEditableNotSecure(pid)
            guard let activeWindow = attr(root, kAXFocusedWindowAttribute), CFEqual(activeWindow, window),
                  let focused = attr(root, kAXFocusedUIElementAttribute), CFEqual(focused, window) else {
                throw BridgeError("BACKGROUND_EVENT_TEXT_FOCUS_MISMATCH", "Visual text input requires the same exact focused window without a distinct AX editor. Observe before retrying.")
            }
            try observation.validate()
            guard observation.unresolved == 0, observation.transitions.isEmpty else {
                throw BridgeError("BACKGROUND_KEYBOARD_ROUTE_CHANGED", "Focus changed or became unresolved during visual text input. Observe before retrying.")
            }
            try assertBackgroundIsolation(pid, wid, order, foreground)
        }
        func visibleLines() async throws -> [String] {
            try checkFocus()
            let result = try await ocr(p, languageCorrection: false)
            try checkFocus()
            return (result["lines"] as? [Object] ?? []).compactMap { line in
                guard let bounds = line["frame"] as? Object else { return nil }
                let rect = CGRect(x: number(bounds, "x"), y: number(bounds, "y"), width: number(bounds, "width"), height: number(bounds, "height"))
                return region.contains(rect) ? line["text"] as? String : nil
            }
        }
        func count(_ wanted: String, in lines: [String]) -> Int {
            lines.count(where: { $0.utf16.elementsEqual(wanted.utf16) })
        }
        let initial = try await visibleLines()
        guard count(before, in: initial) == 1, count(text, in: initial) == 0 else {
            throw BridgeError("STALE_VISUAL_TEXT", "The prior line is missing or ambiguous, or the requested line is already present. No text was sent.")
        }
        let source = try backgroundSource()
        for units in packets {
            try checkFocus()
            try postBackgroundUnicode(units, source: source, pid: pid, wid: wid)
            try await Task.sleep(nanoseconds: 12_000_000)
        }
        for _ in 0..<3 {
            let lines = try await visibleLines()
            if count(text, in: lines) == 1, count(before, in: lines) == 0 {
                return ["ok":true,"mode":"background","method":"Unicode CGEvent.postToPid with OCR","strategy":"event",
                        "visualVerified":true,"verificationRequired":true,"AXActionsGenerated":false,"characters":text.count]
            }
            try await Task.sleep(nanoseconds: 40_000_000)
        }
        throw BridgeError("TEXT_VERIFICATION_FAILED", "OCR did not confirm the complete new line in the same region. Input may be partial. Observe before retrying.")
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
            event.flags=flags
            if !SystemInputFocus.publicAPIOnly { event.setIntegerValueField(CGEventField(rawValue:51)!,value:Int64(wid)) }
            event.setIntegerValueField(.eventSourceUserData,value:0x43554247)
        }
        heldBackgroundKey=(pid,up);defer{releaseBackgroundKey()}
        down.postToPid(pid)
        let started=ProcessInfo.processInfo.systemUptime
        try await waitInputHold(p,frame,observation,number(p,"durationMs"))
        releaseBackgroundKey()
        return ["ok":true,"mode":"background","method":"CGEvent.postToPid","AXActionsGenerated":false,"verificationRequired":true,"heldDurationMs":(ProcessInfo.processInfo.systemUptime-started)*1000,"repeatEventsGenerated":0,"globalModifierEvents":0]
    }
    func backgroundPressTarget(_ p:Object,_ pid:pid_t,_ frame:CGRect,_ point:CGPoint, allowLabelParent: Bool = false) throws -> AXUIElement? {
        func pressable(_ element:AXUIElement)->Bool {
            guard attr(element,kAXSubroleAttribute) as? String != kAXSecureTextFieldSubrole else{return false}
            var actions:CFArray?
            return AXUIElementCopyActionNames(element,&actions) == .success && (actions as? [String] ?? []).contains(kAXPressAction)
        }
        if p["elementId"] != nil {
            let element=try ref(p).element
            if pressable(element) { return element }
            guard allowLabelParent, attr(element, kAXRoleAttribute) as? String == kAXStaticTextRole,
                  let value = attr(element, kAXParentAttribute), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
            let parent = value as! AXUIElement
            let role = attr(parent, kAXRoleAttribute) as? String
            guard role == kAXButtonRole || role == kAXCheckBoxRole,
                  let bounds = axFrame(parent), bounds.contains(point), pressable(parent) else { return nil }
            return parent
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

    func checkBackgroundPopup(_ element: AXUIElement, typeAhead: Bool = false) throws {
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
        if typeAhead {
            if nativePopup {
                throw BridgeError("BACKGROUND_POPUP_UNSUPPORTED", "The closed native popup does not support verified first-letter selection in background. No key was sent.")
            }
            return
        }
        guard nativePopup || webPopup else { return }
        let message = "This closed popup can open a native menu and take the user's keyboard focus. No input was sent."
        if webPopup {
            throw BridgeError("BACKGROUND_POPUP_UNSUPPORTED", message + " Try app-local AX focus and a printable key matching the option's prefix, then verify the selected value.")
        }
        throw BridgeError("BACKGROUND_POPUP_UNSUPPORTED", message)
    }

    func checkGnuCashToolbar(_ application: NSRunningApplication, _ p: Object, _ frame: CGRect, _ at: CGPoint) async throws {
        let point = CGPoint(x: at.x-frame.minX, y: at.y-frame.minY)
        guard application.bundleIdentifier == "org.gnucash.Gnucash", point.y <= 110 else { return }
        let observation = try await ocr(p, languageCorrection: false)
        let (_, window, currentFrame) = try target(p)
        guard currentFrame == frame, window["onScreen"] as? Bool == true else {
            throw BridgeError("WINDOW_MOVED", "GnuCash window moved during toolbar verification. No click was sent.")
        }
        let labels = (observation["lines"] as? [Object] ?? []).compactMap { line -> (String, CGRect)? in
            guard let text = line["text"] as? String, let bounds = line["frame"] as? Object else { return nil }
            let rect = CGRect(x: number(bounds,"x"), y: number(bounds,"y"), width: number(bounds,"width"), height: number(bounds,"height"))
            guard rect.midY < 110 else { return nil }
            return (text, rect)
        }
        let saveLabels = labels.filter { $0.0 == "Save" && $0.1.midX < 80 }
        guard saveLabels.count == 1 else {
            guard (window["title"] as? String)?.hasSuffix(" - GnuCash") == true else { return }
            throw BridgeError("BACKGROUND_GNUCASH_TOOLBAR_UNVERIFIED", "Could not verify the GnuCash toolbar in this area. No pointer input was sent.")
        }
        let toolbarLabel = saveLabels[0].1
        guard (toolbarLabel.minY - 4 * toolbarLabel.height...toolbarLabel.maxY + toolbarLabel.height).contains(point.y) else { return }
        // The unlabelled overflow chevron occupies the end of the toolbar.
        if point.x >= frame.width - 36 {
            throw BridgeError("BACKGROUND_GNUCASH_DIALOG_UNSUPPORTED", "GnuCash toolbar overflow can raise its window while opening the menu in background. No click was sent.")
        }
        let buttons = labels.filter { _, label in
            abs(label.midY - toolbarLabel.midY) <= toolbarLabel.height &&
                label.insetBy(dx: -20, dy: -4 * label.height).contains(point)
        }
        if buttons.contains(where: { $0.0.caseInsensitiveCompare("Reconcile") == .orderedSame }) {
            throw BridgeError("BACKGROUND_GNUCASH_DIALOG_UNSUPPORTED", "GnuCash Reconcile can raise its register and dialog in background. No click was sent.")
        }
        guard buttons.count == 1, ["Save", "Show Splits"].contains(buttons[0].0) else {
            throw BridgeError("BACKGROUND_GNUCASH_TOOLBAR_UNVERIFIED", "This GnuCash toolbar point does not match a verified background control. No pointer input was sent.")
        }
    }

    func checkGnuCashDialogAction(_ element: AXUIElement, pid: pid_t) throws {
        guard try app(pid).bundleIdentifier == "org.gnucash.Gnucash" else { return }
        let isReconcile = [kAXTitleAttribute, kAXDescriptionAttribute].contains {
            (attr(element, $0) as? String)?.caseInsensitiveCompare("Reconcile") == .orderedSame
        }
        if isReconcile || attr(element, kAXIdentifierAttribute) as? String == "ActionsReconcileAction" {
            throw BridgeError("BACKGROUND_GNUCASH_DIALOG_UNSUPPORTED", "GnuCash Reconcile can raise its register and dialog in background. No AX press was sent.")
        }
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
        // native drag. A bezel hit beside a row can also raise the window.
        let application = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(application, 1)
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(application, Float(start.x), Float(start.y), &hit) == .success,
              let hit else { return }
        var selection = backgroundTableRow(hit, passiveOnly: true)
        if selection == nil, attr(hit, kAXRoleAttribute) as? String == kAXScrollAreaRole {
            // A one-point scroll-view bezel sits outside the row frame. Keep
            // actual scrollbar and other control hits on their existing path.
            let tables = children(hit).filter { attr($0, kAXRoleAttribute) as? String == kAXTableRole }
            let rows = tables.flatMap { children($0, kAXVisibleRowsAttribute) }
            if let adjacent = rows.first(where: { row in
                guard let bounds = axFrame(row), !bounds.isEmpty else { return false }
                return bounds.insetBy(dx: -1, dy: 0).contains(start)
            }) {
                selection = backgroundTableRow(adjacent, passiveOnly: true)
            }
        }
        guard let selection,
              attr(selection.table, kAXRoleAttribute) as? String == kAXTableRole,
              !belongsToWebArea(selection.table),
              belongsToWindow(selection.table, try axWindow(pid, frame)) else { return }
        throw BridgeError("BACKGROUND_NATIVE_ROW_DRAG_UNSUPPORTED", "Dragging from this passive native table row or its adjacent border can raise the window or take keyboard focus. No pointer input was sent. Use a row-move control if the app exposes one.")
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

    func backgroundTabGroup(_ tab: AXUIElement) -> AXUIElement? {
        guard attr(tab, kAXRoleAttribute) as? String == kAXRadioButtonRole,
              (attr(tab, kAXEnabledAttribute) as? Bool) == true,
              let value = attr(tab, kAXParentAttribute), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        let group = value as! AXUIElement
        var writable = DarwinBoolean(false)
        guard attr(group, kAXRoleAttribute) as? String == kAXTabGroupRole,
              children(group, kAXTabsAttribute).contains(where: { CFEqual($0, tab) }),
              children(group).contains(where: { CFEqual($0, tab) }),
              AXUIElementIsAttributeSettable(group, kAXSelectedChildrenAttribute as CFString, &writable) == .success,
              writable.boolValue else { return nil }
        return group
    }

    func selectBackgroundTab(_ tab: AXUIElement, in group: AXUIElement,
                             observation: BackgroundFocusObservation) async throws -> Object {
        let selected = children(group, kAXSelectedChildrenAttribute)
        guard selected.count == 1, children(group, kAXTabsAttribute).contains(where: { CFEqual($0, selected[0]) }) else {
            throw BridgeError("BACKGROUND_TAB_SELECTION_UNSUPPORTED", "The tab group does not report a single selected child. No selection was sent.")
        }
        let result: Object = ["ok": true, "mode": "background", "method": "AXSelectedChildren", "verified": true]
        if CFEqual(selected[0], tab) { return result }
        try axCheck(AXUIElementSetAttributeValue(group, kAXSelectedChildrenAttribute as CFString, [tab] as CFArray),
                    "Background tab selection")
        for _ in 0..<15 {
            try await Task.sleep(nanoseconds: 20_000_000)
            try observation.validate()
            let current = children(group, kAXSelectedChildrenAttribute)
            if current.count == 1, CFEqual(current[0], tab) { return result }
        }
        throw BridgeError("TAB_SELECTION_UNVERIFIED", "The tab group did not report the requested selection. Observe the window before retrying.")
    }

    func backgroundWindowOrder() -> NormalWindowOrder {
        let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [Object] ?? []
        return rows.compactMap { row in
            guard number(row,kCGWindowLayer as String) == 0, let id=row[kCGWindowNumber as String] as? Int,let pid=row[kCGWindowOwnerPID as String] as? Int else{return nil}
            return (id:id,pid:pid_t(pid))
        }
    }
    func assertBackgroundIsolation(_ pid:pid_t,_ wid:CGWindowID,_ orderBefore:NormalWindowOrder,_ foregroundBefore:pid_t?) throws {
        if foregroundBefore != pid, NSWorkspace.shared.frontmostApplication?.processIdentifier == pid { throw BridgeError("BACKGROUND_APP_ACTIVATED","The target app activated itself in response to the action. Background isolation was not maintained; no activation-restoration workaround was attempted.") }
        let orderAfter = backgroundWindowOrder()
        switch backgroundWindowCrossing(pid: pid, windowId: Int(wid), before: orderBefore, after: orderAfter) {
        case .existingWindow:
            throw BridgeError("BACKGROUND_WINDOW_REORDERED", "An existing target window crossed another application's window. Observe before retrying.")
        case .newWindow:
            throw BridgeError("BACKGROUND_WINDOW_REORDERED", "A newly visible target window crossed an existing window above the action's target. Observe before retrying.")
        case nil:
            break
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
        if method == "click" {
            try await checkGnuCashToolbar(application, p, frame, try point(p, frame))
        }
        let scopedInput = p["strategy"] as? String == "appkit" ? ScopedAppKitInput(rawValue: method) : nil
        if SystemInputFocus.publicAPIOnly && (scopedInput != nil || method == "scroll" ||
            (method == "click" && p["strategy"] as? String == "event") ||
            (method == "type_text" && p["visualCheck"] != nil)) {
            throw BridgeError("BACKGROUND_PUBLIC_API_UNSUPPORTED", "This background input route is unavailable in public-API-only mode. No input was sent.")
        }
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
            let candidate = semantic || scopedInput == .click
                ? try backgroundPressTarget(p, pid, frame, point, allowLabelParent: semantic)
                : try? backgroundPressTarget(p, pid, frame, point)
            if let candidate { try checkBackgroundPopup(candidate) }
            if semantic, let element = candidate {
                try checkGnuCashDialogAction(element, pid: pid)
                try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
                try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                if p["elementId"] != nil {
                    guard let current = try backgroundPressTarget(p, pid, frame, point, allowLabelParent: true), CFEqual(current, element) else {
                        throw BridgeError("STALE_ELEMENT", "The press target changed during cursor approach. Observe it before clicking.")
                    }
                }
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
            if semantic, p["elementId"] != nil {
                let tab = try ref(p).element
                if let group = backgroundTabGroup(tab) {
                    try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
                    try inputObservation.validate()
                    try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                    let liveTab = try ref(p).element
                    guard CFEqual(liveTab, tab), let liveGroup = backgroundTabGroup(liveTab), CFEqual(liveGroup, group),
                          belongsToWindow(liveGroup, try axWindow(pid, frame)) else {
                        throw BridgeError("STALE_ELEMENT", "The tab group changed during cursor approach. Observe it before selecting a tab.")
                    }
                    result = try await selectBackgroundTab(liveTab, in: liveGroup, observation: inputObservation)
                    break
                }
            }
            guard strategy != "ax" else {throw BridgeError("BACKGROUND_CLICK_UNSUPPORTED","No semantic click equivalent at this target; no event was sent")}
            guard !SystemInputFocus.publicAPIOnly else {
                throw BridgeError("BACKGROUND_PUBLIC_API_UNSUPPORTED", "No semantic background click is available here. Public-API-only mode disables the raw pointer route. No input was sent.")
            }
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
                if i > 1 { try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore) }
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
            // A popup can enter native menu tracking on the initial mouse-down.
            if let candidate = try? backgroundPressTarget(p, pid, frame, from) { try checkBackgroundPopup(candidate) }
            if foregroundBefore != pid { try checkBackgroundRowDrag(pid, frame, from) }
            guard !SystemInputFocus.publicAPIOnly else {
                throw BridgeError("BACKGROUND_PUBLIC_API_UNSUPPORTED", "Window-routed background drag is unavailable in public-API-only mode. No pointer input was sent.")
            }
            try await checkGnuCashToolbar(application, p, frame, from)
            try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:from,activity:"drag")
            pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
            appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
            try inputObservation.validate()
            try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            cursorTracksPointer=true
            let dragSteps=max(6,Int(ceil(duration*60)))
            let interval=UInt64(duration/Double(dragSteps+1)*1e9)
            try backgroundMouse(.leftMouseDown,from,.left,1,pid,wid,frame,pointerDelivery)
            // AppKit can react to mouse-down before it receives any motion.
            // Give that response time to arrive and check stacking before
            // sending each motion. The existing cleanup releases on error.
            try await Task.sleep(nanoseconds:interval)
            var last=from
            for i in 1...dragSteps {
                try inputObservation.validate()
                try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                let (_,_,current) = try target(p)
                guard current == frame else { throw BridgeError("WINDOW_MOVED","Window moved during drag; stopped without following the global pointer") }
                last=CGPoint(x:from.x+(to.x-from.x)*Double(i)/Double(dragSteps),y:from.y+(to.y-from.y)*Double(i)/Double(dragSteps))
                try backgroundMouse(.leftMouseDragged,last,.left,1,pid,wid,frame,pointerDelivery)
                try await Task.sleep(nanoseconds:interval)
            }
            try backgroundMouse(.leftMouseUp,last,.left,1,pid,wid,frame,pointerDelivery)
            result=["ok":true,"mode":"background","method":"window-scoped CGEvent.postToPid","verificationRequired":true]
        case "type_text":
            let strategy=p["strategy"] as? String ?? "auto"
            guard ["auto","ax","event"].contains(strategy) else {throw BridgeError("INVALID_ARGUMENT","Unknown text strategy")}
            if p["replaceAll"] != nil, (strategy == "event" || p["elementId"] == nil || !(p["replaceAll"] is String)) {
                throw BridgeError("INVALID_ARGUMENT", "replaceAll requires an exact background AX text target and the observed text.")
            }
            if p["visualCheck"] != nil {
                result = try await insertVisuallyCheckedText(p, pid, wid, frame, inputObservation, orderBefore, foregroundBefore)
                break
            }
            let textElement=try backgroundTextElement(p,pid,wid,frame)
            if let at=axFrame(textElement){try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:"type")}
            if strategy == "event",!SystemInputFocus.publicAPIOnly,ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1" {
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
                let chord = try backgroundKeyChord(p)
                // AppKit can open a popup from a vertical arrow even when
                // the event carries modifiers such as Command.
                let verticalArrow = chord.name == "down" || chord.name == "up"
                let unmodifiedActivation = chord.flags.isEmpty && ["space", "enter", "return"].contains(chord.name)
                if verticalArrow || unmodifiedActivation {
                    try checkBackgroundPopup(element)
                }
                if chord.flags.isEmpty || chord.flags == .maskShift,
                   chord.name.utf8.count == 1, let key = chord.name.utf8.first, (97...122).contains(key) {
                    try checkBackgroundPopup(element, typeAhead: true)
                }
                if let at=axFrame(element) {try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:"key")}
            }
            if !SystemInputFocus.publicAPIOnly && (scopedInput == .key || (!semanticSelectAll && ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1")) {
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
                // Keep the same routing for a live press. A plain mouse-up
                // can be lost when AppKit has only received the mouse-down.
                if !Task.isCancelled,!shuttingDown,let pointerDelivery {
                    try? backgroundMouse(up,held.point,held.button,1,held.pid,held.windowID,held.frame,pointerDelivery)
                    if heldBackgroundMouse == nil { try? await pointerDelivery.waitForDelivery() }
                }
                if heldBackgroundMouse != nil {
                    try? backgroundMouse(up,held.point,held.button,1,held.pid,held.windowID,held.frame)
                }
            }
            appKitSession?.finish();activeAppKitSession=nil
            if appKitSession != nil {try? await Task.sleep(nanoseconds:80_000_000)}
            throw error
        }
    }
}
