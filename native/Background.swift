import AppKit
import ApplicationServices

// Observation is separate from prevention. AppKit can react asynchronously to
// AX and process-directed events. Samples expose what was actually observed;
// neither an unresolved query nor a polling gap is evidence of isolation.
@MainActor final class BackgroundFocusObservation {
    let targetPID:pid_t
    let before=SystemInputFocus.observe()
    let typingRawBefore=ExperimentalTypingFocus.read()
    var typingRawAfter:UInt32?
    var typingRouteChanged=false
    let started=ProcessInfo.processInfo.systemUptime
    var after:InputFocusObservation
    var samples=0
    var unresolved=0
    var targetGainedKeyboardFocus=false
    var unexpectedKeyboardRecipient=false
    var maxSampleGap:Double=0
    var lastSampleTime:Double=0
    var transitions:[[String:Any]]=[]
    var timer:Timer?
    init(targetPID:pid_t) {
        self.targetPID=targetPID;after=before
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
        typingRawAfter=ExperimentalTypingFocus.read()
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
    func backgroundMouse(_ kind: CGEventType, _ at: CGPoint, _ button: CGMouseButton, _ count: Int, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect,_ delivery:BackgroundPointerDelivery?=nil) throws {
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
        event.flags = []
        event.setIntegerValueField(.mouseEventButtonNumber, value: Int64(button.rawValue))
        // Observed subtype; the optional delivery guard removes its temporary
        // routing modifier at the target process before AppKit receives it.
        event.setIntegerValueField(.mouseEventSubtype, value: 3)
        try routeBackground(event, pid, wid, frame, at,delivery)
        if cursorTracksPointer {
            let down=[CGEventType.leftMouseDown,.rightMouseDown,.otherMouseDown,.leftMouseDragged].contains(kind)
            agentCursor.update(pid:pid,windowID:wid,frame:frame,point:at,pressed:down,activity:kind == .leftMouseDragged ? "drag":"click")
        }
        if [.leftMouseDown,.rightMouseDown,.otherMouseDown,.leftMouseDragged].contains(kind) { heldBackgroundMouse = HeldBackgroundMouse(pid: pid, windowID: wid, frame: frame, point: at, button: button,eventNumber:eventNumber,source:source) }
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
    func backgroundTextElement(_ p: Object, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect) throws -> AXUIElement {
        let window = try axWindow(pid, frame)
        let element: AXUIElement
        if p["snapshotId"] != nil || p["elementId"] != nil {
            let r = try ref(p)
            guard r.pid == pid, r.windowID == wid, r.scope == "window" else { throw BridgeError("TARGET_MISMATCH", "Text element is not in the requested window") }
            element = r.element
        } else {
            guard let value = attr(AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute), CFGetTypeID(value) == AXUIElementGetTypeID() else { throw BridgeError("BACKGROUND_TEXT_TARGET_REQUIRED", "Provide a snapshotId+elementId for an editable element or focus it with cu_ax_action first") }
            element = value as! AXUIElement
        }
        guard belongsToWindow(element, window) else { throw BridgeError("BACKGROUND_TEXT_TARGET_REQUIRED", "The application's internal text focus belongs to another window. Provide an exact observed text element.") }
        guard attr(element, kAXSubroleAttribute) as? String != kAXSecureTextFieldSubrole else { throw BridgeError("SECURE_INPUT", "Secure fields are excluded") }
        return element
    }
    func insertBackgroundText(_ p: Object, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect) async throws -> Object {
        let element = try backgroundTextElement(p, pid, wid, frame)
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
        let mechanism: String
        if selectedSettable.boolValue {
            mechanism = "AXSelectedText insertion"
            try axCheck(AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFString), "Background text insertion")
        } else {
            var valueSettable: DarwinBoolean = false
            _ = AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &valueSettable)
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
        throw BridgeError("TEXT_VERIFICATION_FAILED", "AX insertion did not produce the expected readable value. It may have partly completed; refresh state before retrying.")
    }
    func insertBackgroundEventText(_ p:Object,_ pid:pid_t,_ wid:CGWindowID,_ frame:CGRect,_ observation:BackgroundFocusObservation) async throws -> Object {
        let root=AXUIElementCreateApplication(pid)
        let window=try axWindow(pid,frame)
        guard let focusedWindow=attr(root,kAXFocusedWindowAttribute),CFGetTypeID(focusedWindow)==AXUIElementGetTypeID(),CFEqual(focusedWindow,window) else {
            throw BridgeError("BACKGROUND_KEY_WINDOW_MISMATCH","Raw text requires the application's existing internal key window. No focus or activation was performed.")
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
    func backgroundKey(_ p: Object, _ pid: pid_t, _ wid: CGWindowID, _ frame: CGRect) throws -> Object {
        let root = AXUIElementCreateApplication(pid); let window = try axWindow(pid, frame)
        guard let focused = attr(root, kAXFocusedWindowAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID(), CFEqual(focused, window) else { throw BridgeError("BACKGROUND_KEY_WINDOW_MISMATCH", "The target is not the application's internal key window. No focus or activation was performed.") }
        try ensureEditableNotSecure(pid)
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
        // AppKit key-equivalent dispatch in inactive apps is inconsistent. Select
        // all has an exact AX equivalent which we can verify without any key event.
        if p["strategy"] as? String != "event",flags == .maskCommand, last == "a" {
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
        for down in [true,false] {
            guard let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { throw BridgeError("EVENT_FAILED", "Could not create process keyboard event") }
            event.flags = flags
            event.setIntegerValueField(CGEventField(rawValue:51)!, value:Int64(wid))
            event.setIntegerValueField(.eventSourceUserData, value:0x43554247)
            event.postToPid(pid)
        }
        return ["ok":true,"mode":"background","method":"CGEvent.postToPid","AXActionsGenerated":false,"verificationRequired":true]
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
        let inputObservation=BackgroundFocusObservation(targetPID:pid)
        defer {inputObservation.stop()}
        var pointerDelivery:BackgroundPointerDelivery?
        var appKitSession:ScopedAppKitFocus?
        defer {
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
            if strategy != "event", button == .left, count == 1,
                let element = try backgroundPressTarget(p,pid,frame,point) {
                try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
                try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                try axCheck(AXUIElementPerformAction(element,kAXPressAction as CFString),"Background press")
                agentCursor.update(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
                result = ["ok":true,"mode":"background","method":"AXPress","verificationRequired":true]
                break
            }
            guard strategy != "ax" else {throw BridgeError("BACKGROUND_CLICK_UNSUPPORTED","No AXPress equivalent at this target; no event was sent")}
            try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:point,activity:"click")
            pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
            appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
            try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            cursorTracksPointer=true
            for i in 1...count {try inputObservation.validate();try backgroundMouse(down, point, button, i, pid, wid, frame,pointerDelivery);try await Task.sleep(nanoseconds:20_000_000);try backgroundMouse(up, point, button, i, pid, wid, frame,pointerDelivery)}
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
            pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
            appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
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
            if strategy == "event",ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1" {
                let element=try backgroundTextElement(p,pid,wid,frame)
                guard let focused=attr(AXUIElementCreateApplication(pid),kAXFocusedUIElementAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID(),CFEqual(focused,element) else{throw BridgeError("BACKGROUND_EVENT_TEXT_FOCUS_MISMATCH","Experimental raw text still requires its exact existing editable focus; no notice was sent")}
                let selectionBefore=attr(element,kAXSelectedTextRangeAttribute)
                pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
                appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
                try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
                if let selectionBefore,let after=attr(element,kAXSelectedTextRangeAttribute),!CFEqual(selectionBefore,after){throw BridgeError("STALE_SELECTION","App-local focus preparation changed the text selection; no text event was sent")}
            }
            let textElement=try backgroundTextElement(p,pid,wid,frame)
            if let at=axFrame(textElement){try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:"type")}
            try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            result=strategy == "event" ? try await insertBackgroundEventText(p,pid,wid,frame,inputObservation):try await insertBackgroundText(p,pid,wid,frame)
        case "key":
            let normalized=(p["key"] as? String ?? "").lowercased().replacingOccurrences(of:" ",with:"")
            let semanticSelectAll=p["strategy"] as? String != "event" && ["cmd+a","command+a","meta+a","super+a"].contains(normalized)
            if !semanticSelectAll,ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1" {
                pointerDelivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
                appKitSession=try await prepareScopedAppKitFocus(pid,wid,frame,pointerDelivery!,inputObservation)
                try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            }
            if let focused=attr(AXUIElementCreateApplication(pid),kAXFocusedUIElementAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID(),let at=axFrame(focused as! AXUIElement){try await agentCursor.move(pid:pid,windowID:wid,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:"key")}
            try inputObservation.validate();try assertBackgroundIsolation(pid,wid,orderBefore,foregroundBefore)
            result=try backgroundKey(p,pid,wid,frame)
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
