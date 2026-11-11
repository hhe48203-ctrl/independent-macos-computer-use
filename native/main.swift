// Independent macOS implementation. Window-scoped input SPI is isolated in Background.swift.
import AppKit
import ApplicationServices
import ScreenCaptureKit
import Vision
import Carbon.HIToolbox

struct BridgeError: Error {
    let code: String
    let message: String
    init(_ code: String, _ message: String) { self.code = code; self.message = message }
}
typealias Object = [String: Any]
func number(_ p: Object, _ k: String, _ fallback: Double = 0) -> Double { (p[k] as? NSNumber)?.doubleValue ?? fallback }
func string(_ p: Object, _ k: String) throws -> String {
    guard let v = p[k] as? String, !v.isEmpty else { throw BridgeError("INVALID_ARGUMENT", "Missing \(k)") }
    return v
}
func rectJSON(_ r: CGRect) -> Object { ["x": r.minX, "y": r.minY, "width": r.width, "height": r.height] }
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(e, name as CFString, &value) == .success ? value : nil
}
func children(_ e: AXUIElement, _ name: String = kAXChildrenAttribute) -> [AXUIElement] { attr(e, name) as? [AXUIElement] ?? [] }
func axFrame(_ e: AXUIElement) -> CGRect? {
    guard let p = attr(e, kAXPositionAttribute), let s = attr(e, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero; var size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
    return CGRect(origin: point, size: size)
}
func axCheck(_ result: AXError, _ operation: String) throws {
    guard result == .success else { throw BridgeError("AX_ERROR", "\(operation): AXError \(result.rawValue). Refresh the snapshot if the target changed.") }
}

struct ElementRef {
    let element: AXUIElement
    let pid: pid_t
    let windowID: CGWindowID
    let role: String
    let identifier: String?
    let scope: String
}
struct Snapshot {
    let created: Date
    let refs: [String: ElementRef]
}

@MainActor final class Desktop {
    var snapshots: [String: Snapshot] = [:]
    var heldMouse: (CGMouseButton, CGPoint)?
    var heldBackgroundMouse: HeldBackgroundMouse?
    var heldBackgroundKey:(pid:pid_t,up:CGEvent)?
    var backgroundMouseSequence=0
    var activeAppKitSession:ScopedAppKitFocus?
    let agentCursor=AgentCursor()
    var cursorTracksPointer=false
    var shuttingDown=false
    let allowed: Set<String>?
    let clipboardEnabled: Bool
    let foregroundEnabled: Bool
    init() {
        let env = ProcessInfo.processInfo.environment
        if let raw = env["CU_ALLOWED_BUNDLE_IDS"] {
            allowed = Set(raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
        } else { allowed = nil }
        clipboardEnabled = env["CU_ENABLE_CLIPBOARD"] == "1"
        foregroundEnabled = env["CU_ENABLE_FOREGROUND"] == "1"
    }
    func requireAX() throws {
        guard AXIsProcessTrusted() else { throw BridgeError("ACCESSIBILITY_DENIED", "Grant Accessibility to Local Computer Use or the launching terminal/agent in System Settings > Privacy & Security, then restart the MCP client.") }
    }
    func requireScreen() throws {
        guard CGPreflightScreenCaptureAccess() else { throw BridgeError("SCREEN_RECORDING_DENIED", "Grant Screen & System Audio Recording to Local Computer Use or the launching terminal/agent, then restart the MCP client.") }
    }
    func app(_ pid: pid_t) throws -> NSRunningApplication {
        guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else { throw BridgeError("APP_GONE", "Application is no longer running") }
        if let allowed, !allowed.contains(app.bundleIdentifier ?? "") { throw BridgeError("APP_NOT_ALLOWED", "Bundle identifier is outside CU_ALLOWED_BUNDLE_IDS") }
        return app
    }
    func appJSON(_ a: NSRunningApplication) -> Object {
        ["pid": Int(a.processIdentifier), "name": a.localizedName ?? "", "bundleId": a.bundleIdentifier ?? "", "path":a.bundleURL?.path ?? "", "active": a.isActive, "hidden": a.isHidden]
    }
    func windows(pid requestedPID: Int? = nil, windowID: Int? = nil) -> [Object] {
        let rows = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [Object] ?? []
        let floating = Int(CGWindowLevelForKey(.floatingWindow))
        return rows.compactMap { row in
            guard let pid = row[kCGWindowOwnerPID as String] as? Int,
                  let id = row[kCGWindowNumber as String] as? Int,
                  requestedPID == nil || requestedPID == pid,
                  windowID == nil || windowID == id,
                  let layer = row[kCGWindowLayer as String] as? Int,
                  layer == 0 || (layer == floating && row[kCGWindowIsOnscreen as String] as? Bool == true),
                  let bounds = row[kCGWindowBounds as String] as? [String: Any],
                  let r = CGRect(dictionaryRepresentation: bounds as CFDictionary),
                  r.width > 1, r.height > 1,
                  let a = try? app(pid_t(pid)) else { return nil }
            let onScreen = row[kCGWindowIsOnscreen as String] as? Bool ?? false
            var title = row[kCGWindowName as String] as? String ?? ""
            if layer != 0 {
                // Menus and arbitrary overlay windows are not AX dialog targets.
                guard let dialog = try? axWindow(pid_t(pid), r, messagingTimeout: 0.25),
                      attr(dialog, kAXRoleAttribute) as? String == kAXWindowRole,
                      let subrole = attr(dialog, kAXSubroleAttribute) as? String,
                      [kAXDialogSubrole, kAXSystemDialogSubrole].contains(subrole),
                      let axBounds = axFrame(dialog) else { return nil }
                let peers = rows.filter { other in
                    guard other[kCGWindowOwnerPID as String] as? Int == pid,
                          other[kCGWindowIsOnscreen as String] as? Bool == true,
                          let otherLayer = other[kCGWindowLayer as String] as? Int,
                          otherLayer == 0 || otherLayer == floating,
                          let bounds = other[kCGWindowBounds as String] as? Object,
                          let frame = CGRect(dictionaryRepresentation: bounds as CFDictionary) else { return false }
                    return matchesAXWindowFrame(frame, axBounds)
                }
                guard peers.count == 1, peers[0][kCGWindowNumber as String] as? Int == id else { return nil }
                if let axTitle = attr(dialog, kAXTitleAttribute) as? String, !axTitle.isEmpty { title = axTitle }
            }
            return ["windowId": id, "pid": pid, "bundleId": a.bundleIdentifier ?? "", "app": a.localizedName ?? "", "path":a.bundleURL?.path ?? "", "title": title, "layer": layer, "frame": rectJSON(r), "onScreen": onScreen]
        }
    }
    func target(_ p: Object) throws -> (NSRunningApplication, Object, CGRect) {
        let pid = pid_t(number(p, "pid")); let wid = Int(number(p, "windowId"))
        let a = try app(pid)
        guard let w = windows(pid: Int(pid), windowID: wid).first,
              let f = w["frame"] as? Object else { throw BridgeError("WINDOW_GONE", "No window with this windowId and pid. Call cu_windows again.") }
        return (a, w, CGRect(x: number(f, "x"), y: number(f, "y"), width: number(f, "width"), height: number(f, "height")))
    }
    func matchesAXWindowFrame(_ a: CGRect, _ b: CGRect) -> Bool {
        abs(a.minX-b.minX) < 3 && abs(a.minY-b.minY) < 3 && abs(a.width-b.width) < 3 && abs(a.height-b.height) < 3
    }
    func axWindow(_ pid: pid_t, _ frame: CGRect, messagingTimeout: Float = 1) throws -> AXUIElement {
        try requireAX()
        let root = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(root, messagingTimeout)
        // Public AX has no documented CGWindowID attribute. Match geometry, reject ambiguity.
        var windowsValue:CFTypeRef?
        try axCheck(AXUIElementCopyAttributeValue(root,kAXWindowsAttribute as CFString,&windowsValue),"Read target AX windows")
        var observedWindows=windowsValue as? [AXUIElement] ?? []
        // Attached sheets have their own CG window but can appear only below
        // the parent in AX, rather than in the application's AXWindows list.
        let sheetLimit = observedWindows.count + 64
        var index = 0
        while index < observedWindows.count {
            let current = observedWindows[index]
            let sheets = children(current).filter {
                attr($0, kAXRoleAttribute) as? String == kAXSheetRole
            }
            for sheet in sheets where !observedWindows.contains(where: { CFEqual($0, sheet) }) {
                guard observedWindows.count < sheetLimit else {
                    throw BridgeError("AX_WINDOW_UNRESOLVED", "Too many attached AX sheets to match safely. Refresh observation.")
                }
                observedWindows.append(sheet)
            }
            index += 1
        }
        let candidates = observedWindows.filter {
            guard let r = axFrame($0) else { return false }
            return matchesAXWindowFrame(r, frame)
        }
        guard candidates.count == 1 else {
            let diagnostic=observedWindows.prefix(3).map{element->String in
                var pointValue:CFTypeRef?;var sizeValue:CFTypeRef?
                let pe=AXUIElementCopyAttributeValue(element,kAXPositionAttribute as CFString,&pointValue)
                let se=AXUIElementCopyAttributeValue(element,kAXSizeAttribute as CFString,&sizeValue)
                var point=CGPoint.zero;var size=CGSize.zero
                let pOK=pointValue.map{CFGetTypeID($0)==AXValueGetTypeID() && AXValueGetValue($0 as! AXValue,.cgPoint,&point)} ?? false
                let sOK=sizeValue.map{CFGetTypeID($0)==AXValueGetTypeID() && AXValueGetValue($0 as! AXValue,.cgSize,&size)} ?? false
                return "pError=\(pe.rawValue),sError=\(se.rawValue),decoded=\(pOK && sOK),rect=\(point.x),\(point.y),\(size.width),\(size.height)"
            }.joined(separator:" | ")
            throw BridgeError("AX_WINDOW_UNRESOLVED", "CG rect=\(frame.minX),\(frame.minY),\(frame.width),\(frame.height); \(candidates.count) matches from \(observedWindows.count) AX windows: \(diagnostic). Refresh observation.")
        }
        return candidates[0]
    }
    func focus(_ p: Object) async throws -> (NSRunningApplication, Object, CGRect) {
        try requireAX()
        var t = try target(p)
        guard t.1["onScreen"] as? Bool == true else { throw BridgeError("WINDOW_NOT_VISIBLE", "Restore the window on the active desktop before input") }
        let ax = try axWindow(t.0.processIdentifier, t.2)
        _ = AXUIElementPerformAction(ax, kAXRaiseAction as CFString)
        _ = AXUIElementSetAttributeValue(ax, kAXMainAttribute as CFString, kCFBooleanTrue)
        t.0.activate(options: [])
        for _ in 0..<20 {
            if NSWorkspace.shared.frontmostApplication?.processIdentifier == t.0.processIdentifier { break }
            try await Task.sleep(nanoseconds: 25_000_000)
        }
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == t.0.processIdentifier else { throw BridgeError("FOCUS_FAILED", "Target app did not become frontmost; no input posted") }
        let root = AXUIElementCreateApplication(t.0.processIdentifier)
        guard let focused = attr(root, kAXFocusedWindowAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID(), CFEqual(focused, ax) else { throw BridgeError("FOCUS_FAILED", "Target window did not become focused; no input posted") }
        t = try target(p)
        return t
    }
    func assertFocus(_ pid: pid_t) throws {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { throw BridgeError("FOCUS_CHANGED", "Foreground app changed during input; stopped") }
    }
    func assertHitTarget(_ pid: pid_t, _ frame: CGRect, _ point: CGPoint) throws {
        var hit: AXUIElement?
        try axCheck(AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(point.x), Float(point.y), &hit), "Hit-test input point")
        guard let hit else { throw BridgeError("HIT_TEST_FAILED", "No accessible element at input point") }
        var owner: pid_t = 0
        try axCheck(AXUIElementGetPid(hit, &owner), "Hit-test owner")
        guard owner == pid else { throw BridgeError("POINT_OCCLUDED", "Another application covers the input point; no event posted") }
        let window = try axWindow(pid, frame)
        var element: AXUIElement? = hit
        for _ in 0..<64 {
            guard let current = element else { break }
            if CFEqual(current, window) { return }
            element = attr(current, kAXParentAttribute).flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
        }
        throw BridgeError("POINT_OCCLUDED", "Input point does not belong to the target window")
    }
    func point(_ p: Object, _ frame: CGRect, _ xKey: String = "x", _ yKey: String = "y") throws -> CGPoint {
        let x = number(p, xKey, -1); let y = number(p, yKey, -1)
        guard x.isFinite, y.isFinite, x >= 0, y >= 0, x < frame.width, y < frame.height else { throw BridgeError("POINT_OUTSIDE_WINDOW", "Coordinates must be window-relative points inside the latest window frame") }
        return CGPoint(x: frame.minX+x, y: frame.minY+y)
    }
    func ref(_ p: Object) throws -> ElementRef {
        try requireAX()
        let sid = try string(p, "snapshotId"); let eid = try string(p, "elementId")
        guard let s = snapshots[sid], Date().timeIntervalSince(s.created) < 120, let r = s.refs[eid] else { throw BridgeError("STALE_ELEMENT", "Snapshot expired or element ID is unknown. Take a fresh cu_snapshot.") }
        _ = try app(r.pid)
        let (_, _, frame) = try target(["pid": Int(r.pid), "windowId": Int(r.windowID)])
        let window = r.scope == "menu" ? AXUIElementCreateApplication(r.pid) : try axWindow(r.pid, frame)
        guard let role = attr(r.element, kAXRoleAttribute) as? String, role == r.role,
              (attr(r.element, kAXIdentifierAttribute) as? String) == r.identifier else { throw BridgeError("STALE_ELEMENT", "Element identity changed") }
        var ancestor: AXUIElement? = r.element
        var belongs = false
        for _ in 0..<64 {
            guard let e = ancestor else { break }
            if CFEqual(e, window) { belongs = true; break }
            ancestor = attr(e, kAXParentAttribute).flatMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
        }
        guard belongs else { throw BridgeError("STALE_ELEMENT", "Element no longer belongs to the observed window") }
        if attr(r.element, kAXSubroleAttribute) as? String == kAXSecureTextFieldSubrole { throw BridgeError("SECURE_INPUT", "Secure text fields are excluded") }
        return r
    }
    func snapshot(_ p: Object) async throws -> Object {
        try requireAX()
        let (a, w, frame) = try target(p)
        let win = try axWindow(a.processIdentifier, frame)
        let sid = UUID().uuidString
        let maxNodes = min(2000, max(1, Int(number(p, "maxNodes", 500))))
        let maxDepth = min(30, max(1, Int(number(p, "maxDepth", 16))))
        var nodes: [Object] = []; var refs: [String: ElementRef] = [:]; var visited: [CFHashCode: [AXUIElement]] = [:]
        var truncated = false
        let start = Date()
        func visit(_ e: AXUIElement, _ parent: String?, _ depth: Int, _ scope: String = "window") {
            if nodes.count >= maxNodes || depth > maxDepth || Date().timeIntervalSince(start) > 5 { truncated = true; return }
            let hash = CFHash(e)
            guard !(visited[hash] ?? []).contains(where: { CFEqual($0, e) }) else { return }
            visited[hash, default: []].append(e)
            let id = "e\(nodes.count)"
            let role = attr(e, kAXRoleAttribute) as? String ?? "unknown"
            let identifier = attr(e, kAXIdentifierAttribute) as? String
            let secure = attr(e, kAXSubroleAttribute) as? String == kAXSecureTextFieldSubrole
            var node: Object = ["id": id, "role": role, "depth": depth, "scope": scope]
            if let parent { node["parent"] = parent }
            for (key, name) in [("title", kAXTitleAttribute), ("label", kAXDescriptionAttribute), ("identifier", kAXIdentifierAttribute), ("subrole", kAXSubroleAttribute)] {
                if let v = attr(e, name) as? String, !v.isEmpty { node[key] = String(v.prefix(2000)) }
            }
            if secure { node["secure"] = true } else if let value = attr(e, kAXValueAttribute) {
                if let v = value as? String { node["value"] = String(v.prefix(4000)) }
                else if let v = value as? NSNumber { node["value"] = v }
            }
            if let enabled = attr(e, kAXEnabledAttribute) as? Bool { node["enabled"] = enabled }
            if let focused = attr(e, kAXFocusedAttribute) as? Bool { node["focused"] = focused }
            if !secure, let selection = attr(e, kAXSelectedTextAttribute) as? String, !selection.isEmpty { node["selectedText"] = String(selection.prefix(4000)) }
            if !secure, let encoded = attr(e, kAXSelectedTextRangeAttribute), CFGetTypeID(encoded) == AXValueGetTypeID() {
                var range = CFRange()
                if AXValueGetValue(encoded as! AXValue, .cfRange, &range) { node["selectedRange"] = ["location":range.location,"length":range.length] }
            }
            if let r = axFrame(e) {
                node["frame"] = rectJSON(r.offsetBy(dx: -frame.minX, dy: -frame.minY))
            }
            var actions: CFArray?
            if AXUIElementCopyActionNames(e, &actions) == .success { node["actions"] = actions as? [String] ?? [] }
            nodes.append(node)
            refs[id] = ElementRef(element: e, pid: a.processIdentifier, windowID: CGWindowID(number(w, "windowId")), role: role, identifier: identifier, scope: scope)
            if !secure {
                // The first menu-bar item is the global Apple menu, including
                // unrelated recent documents and system actions. Exclude it.
                let next = scope == "menu" && role == kAXMenuBarRole ? Array(children(e).dropFirst()) : children(e)
                for child in next { visit(child, id, depth+1, scope) }
            }
        }
        visit(win, nil, 0)
        if p["includeMenuBar"] as? Bool == true, let menu = attr(AXUIElementCreateApplication(a.processIdentifier), kAXMenuBarAttribute), CFGetTypeID(menu) == AXUIElementGetTypeID() {
            visit(menu as! AXUIElement, nil, 0, "menu")
        }
        snapshots = snapshots.filter { Date().timeIntervalSince($0.value.created) < 120 }
        if snapshots.count >= 16, let oldest = snapshots.min(by: { $0.value.created < $1.value.created })?.key { snapshots.removeValue(forKey: oldest) }
        snapshots[sid] = Snapshot(created: Date(), refs: refs)
        var result: Object = ["snapshotId": sid, "app": appJSON(a), "window": w, "nodes": nodes, "truncated": truncated, "coordinateSpace": "window-relative logical points; top-left origin", "expiresInSeconds": 120]
        if p["screenshot"] as? Bool ?? true {
            do { result["screenshot"] = try await screenshot(p) }
            catch let e as BridgeError { result["screenshotError"] = ["code": e.code, "message": e.message] }
            catch { result["screenshotError"] = ["code": "CAPTURE_FAILED", "message": error.localizedDescription] }
        }
        return result
    }
    func capture(_ p: Object, includeOwnedTransients: Bool = false) async throws -> (CGImage, CGRect, String) {
        try requireScreen()
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: includeOwnedTransients)
        let filter: SCContentFilter; let frame: CGRect; let kind: String
        var ownedCrop: CGRect?
        if p["windowId"] != nil {
            let (_, _, f) = try target(p)
            guard let window = content.windows.first(where: { $0.windowID == CGWindowID(number(p, "windowId")) && $0.owningApplication?.processID == pid_t(number(p, "pid")) }) else { throw BridgeError("CAPTURE_WINDOW_GONE", "Window is not capturable") }
            if includeOwnedTransients {
                guard let display = content.displays.first(where: { CGDisplayBounds($0.displayID).contains(f) }) else {
                    throw BridgeError("CAPTURE_VIEWPORT_UNAVAILABLE", "Hover screenshot requires the target window to fit within one display")
                }
                let pid = pid_t(number(p, "pid"))
                let transients = content.windows.filter {
                    $0.windowID != window.windowID && $0.owningApplication?.processID == pid &&
                    $0.windowLayer > 0 && $0.isOnScreen && $0.frame.intersects(f)
                }
                filter = SCContentFilter(display: display, including: [window] + transients)
                let bounds = CGDisplayBounds(display.displayID)
                ownedCrop = f.offsetBy(dx: -bounds.minX, dy: -bounds.minY)
            } else {
                filter = SCContentFilter(desktopIndependentWindow: window)
            }
            frame = f; kind = "window"
        } else {
            guard allowed == nil else { throw BridgeError("DESKTOP_CAPTURE_DISABLED", "Full-display capture is disabled when CU_ALLOWED_BUNDLE_IDS is set. Capture an allowed window.") }
            let id = CGDirectDisplayID(number(p, "displayId", Double(CGMainDisplayID())))
            guard let display = content.displays.first(where: { $0.displayID == id }) else { throw BridgeError("DISPLAY_GONE", "Display is unavailable") }
            let ownCursor=content.windows.filter{p["includeAgentCursor"] as? Bool != true && $0.windowID==CGWindowID(agentCursor.panel?.windowNumber ?? 0) && $0.owningApplication?.processID==getpid()}
            filter = SCContentFilter(display: display, excludingWindows: ownCursor); frame = CGDisplayBounds(id); kind = "display"
        }
        let maxDim = max(320, min(4096, number(p, "maxDimension", 1600)))
        let scale = min(2, maxDim / max(frame.width, frame.height))
        let config = SCStreamConfiguration()
        var capturedFrame=frame
        if let ownedCrop { config.sourceRect = ownedCrop }
        if let region=p["region"] as? Object {
            guard kind=="display" else{throw BridgeError("INVALID_ARGUMENT","Region capture is supported only for displays")}
            let crop=CGRect(x:number(region,"x"),y:number(region,"y"),width:number(region,"width"),height:number(region,"height"))
            guard crop.width>=1,crop.height>=1,CGRect(origin:.zero,size:frame.size).contains(crop) else{throw BridgeError("INVALID_ARGUMENT","Region must be contained in the display's logical-point bounds")}
            config.sourceRect=crop;capturedFrame=crop.offsetBy(dx:frame.minX,dy:frame.minY)
        }
        config.width = max(1, Int((capturedFrame.width*scale).rounded()))
        config.height = max(1, Int((capturedFrame.height*scale).rounded()))
        config.showsCursor = p["showCursor"] as? Bool ?? false
        config.ignoreShadowsSingleWindow = true
        // Child windows can extend the image's bounds and invalidate the bound window's scale.
        if kind == "window" { config.includeChildWindows = false }
        config.captureResolution = .best
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        return (image, capturedFrame, kind)
    }
    func screenshot(_ p: Object, includeOwnedTransients: Bool = false) async throws -> Object {
        let (image, frame, kind) = try await capture(p, includeOwnedTransients: includeOwnedTransients)
        let rep = NSBitmapImageRep(cgImage: image)
        guard let data = rep.representation(using: .png, properties: [:]) else { throw BridgeError("PNG_FAILED", "PNG encoding failed") }
        return ["data": data.base64EncodedString(), "mimeType": "image/png", "width": image.width, "height": image.height, "frame": rectJSON(frame), "scaleX": Double(image.width)/frame.width, "scaleY": Double(image.height)/frame.height, "kind": kind, "coordinateSpace": "image pixels; divide by scaleX/scaleY for window-relative input points"]
    }
    func ocr(_ p: Object) async throws -> Object {
        let (image, frame, _) = try await capture(p)
        let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage: image).perform([request])
        let lines: [Object] = (request.results ?? []).compactMap { observation in
            guard let text = observation.topCandidates(1).first else { return nil }
            let r = observation.boundingBox
            return ["text": text.string, "confidence": text.confidence, "frame": rectJSON(CGRect(x: r.minX*frame.width, y: (1-r.maxY)*frame.height, width: r.width*frame.width, height: r.height*frame.height))]
        }
        return ["lines": lines, "frame": rectJSON(frame), "coordinateSpace": "window/display-relative logical points; top-left origin"]
    }
    func mouse(_ kind: CGEventType, _ at: CGPoint, _ button: CGMouseButton = .left, _ count: Int = 1) throws {
        guard let event = CGEvent(mouseEventSource: nil, mouseType: kind, mouseCursorPosition: at, mouseButton: button) else { throw BridgeError("EVENT_FAILED", "Could not create mouse event") }
        event.setIntegerValueField(.mouseEventClickState, value: Int64(count)); event.post(tap: .cghidEventTap)
        if [.leftMouseDown, .rightMouseDown, .otherMouseDown, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged].contains(kind) { heldMouse = (button, at) }
        if [.leftMouseUp, .rightMouseUp, .otherMouseUp].contains(kind) { heldMouse = nil }
    }
    func foregroundHover(_ p: Object) async throws -> Object {
        guard p["mode"] as? String == "foreground" else {
            throw BridgeError("FOREGROUND_REQUIRED", "Real hover requires explicit foreground mode. Use app.move for the independent cursor.")
        }
        let (_, _, beforeFrame) = try target(p)
        let at = try point(p, beforeFrame)
        let duration = number(p, "durationMs", 1000)
        guard duration.isFinite, (0...5000).contains(duration) else {
            throw BridgeError("INVALID_ARGUMENT", "Hover duration must be from 0 to 5000 milliseconds")
        }
        let captureAfter = p["screenshot"] as? Bool == true
        if captureAfter { try requireScreen() }
        guard CGPreflightPostEventAccess(), let source = CGEventSource(stateID: .privateState),
              let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: at, mouseButton: .left) else {
            throw BridgeError("EVENT_FAILED", "Could not prepare the authorized foreground mouse move")
        }
        let (app, _, frame) = try await focus(p)
        guard frame == beforeFrame else { throw BridgeError("WINDOW_MOVED", "Target window changed during focus. Observe it before hovering.") }
        try assertFocus(app.processIdentifier)
        try assertHitTarget(app.processIdentifier, frame, at)
        agentCursor.hide()
        guard CGWarpMouseCursorPosition(at) == .success else {
            throw BridgeError("POINTER_MOVE_FAILED", "macOS refused the foreground pointer move")
        }
        move.flags = []
        move.post(tap: .cgSessionEventTap)
        let deadline = ProcessInfo.processInfo.systemUptime + duration / 1000
        repeat {
            try await Task.sleep(nanoseconds: 20_000_000)
            guard !shuttingDown else { throw BridgeError("CANCELLED", "Helper is stopping") }
            try assertFocus(app.processIdentifier)
            guard let position = CGEvent(source: nil)?.location, hypot(position.x-at.x, position.y-at.y) <= 1 else {
                throw BridgeError("POINTER_CHANGED", "The real pointer left the hover point. No further move was sent.")
            }
        } while ProcessInfo.processInfo.systemUptime < deadline
        let (_, _, currentFrame) = try target(p)
        guard currentFrame == frame else { throw BridgeError("WINDOW_MOVED", "Target window changed during hover") }
        var result: Object = ["ok": true, "mode": "foreground", "method": "real pointer hover", "durationMs": duration,
                              "point": ["x": at.x-frame.minX, "y": at.y-frame.minY]]
        if captureAfter {
            do { result["screenshot"] = try await screenshot(p, includeOwnedTransients: true) }
            catch let e as BridgeError { result["screenshotError"] = ["code": e.code, "message": e.message] }
            catch { result["screenshotError"] = ["code": "CAPTURE_FAILED", "message": error.localizedDescription] }
        }
        return result
    }
    func releaseInput() {
        defer {activeAppKitSession?.finish();activeAppKitSession=nil;agentCursor.hide()}
        releaseBackgroundKey()
        if let held = heldBackgroundMouse {
            let kind: CGEventType = held.button == .left ? .leftMouseUp : held.button == .right ? .rightMouseUp : .otherMouseUp
            try? backgroundMouse(kind,held.point,held.button,1,held.pid,held.windowID,held.frame)
        }
        if let (button, at) = heldMouse {
            let kind: CGEventType = button == .left ? .leftMouseUp : button == .right ? .rightMouseUp : .otherMouseUp
            try? mouse(kind, at, button)
        }
    }
    func ensureEditableNotSecure(_ pid: pid_t) throws {
        let root = AXUIElementCreateApplication(pid)
        if let e = attr(root, kAXFocusedUIElementAttribute), CFGetTypeID(e) == AXUIElementGetTypeID(), attr(e as! AXUIElement, kAXSubroleAttribute) as? String == kAXSecureTextFieldSubrole { throw BridgeError("SECURE_INPUT", "Typing into secure text fields is excluded") }
        guard !IsSecureEventInputEnabled() else { throw BridgeError("SECURE_INPUT", "macOS Secure Event Input is enabled") }
    }
    func keyCode(_ name: String) throws -> CGKeyCode {
        let codes: [String: Int] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,"b":11,"q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"1":18,"2":19,"3":20,"4":21,"6":22,"5":23,"=":24,"9":25,"7":26,"-":27,"8":28,"0":29,"]":30,"o":31,"u":32,"[":33,"i":34,"p":35,"enter":36,"return":36,"l":37,"j":38,"'":39,"k":40,";":41,"\\":42,",":43,"/":44,"n":45,"m":46,".":47,"tab":48,"space":49,"`":50,"backspace":51,"delete":51,"escape":53,"esc":53,"cmd":55,"shift":56,"alt":58,"ctrl":59,"f1":122,"f2":120,"f3":99,"f4":118,"f5":96,"f6":97,"f7":98,"f8":100,"f9":101,"f10":109,"f11":103,"f12":111,"home":115,"end":119,"pageup":116,"pagedown":121,"forwarddelete":117,"left":123,"right":124,"down":125,"up":126]
        guard let code = codes[name.lowercased()] else { throw BridgeError("UNKNOWN_KEY", "Unknown key \(name); use cu_type_text for Unicode") }
        return CGKeyCode(code)
    }
    func pressKey(_ key: String, _ pid: pid_t) async throws {
        let parts = key.lowercased().split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces) }
        guard let last = parts.last else { throw BridgeError("UNKNOWN_KEY", "Empty key") }
        var flags: CGEventFlags = []; var modifiers: [CGKeyCode] = []
        for part in parts.dropLast() {
            switch part {
            case "cmd", "command", "meta", "super": flags.insert(.maskCommand); modifiers.append(55)
            case "shift": flags.insert(.maskShift); modifiers.append(56)
            case "alt", "option": flags.insert(.maskAlternate); modifiers.append(58)
            case "ctrl", "control": flags.insert(.maskControl); modifiers.append(59)
            default: throw BridgeError("UNKNOWN_KEY", "Unknown modifier \(part)")
            }
        }
        let code = try keyCode(last)
        try assertFocus(pid)
        func event(_ c: CGKeyCode, _ down: Bool, _ f: CGEventFlags) {
            let e = CGEvent(keyboardEventSource: nil, virtualKey: c, keyDown: down); e?.flags = f; e?.post(tap: .cghidEventTap)
        }
        for m in modifiers { event(m, true, flags) }
        defer { for m in modifiers.reversed() { event(m, false, []) } }
        event(code, true, flags); event(code, false, flags)
    }
    func handle(_ method: String, _ p: Object) async throws -> Object {
        guard !shuttingDown else{throw BridgeError("CANCELLED","Helper is stopping")}
        let mode = p["mode"] as? String ?? "background"
        guard ["background","foreground"].contains(mode) else { throw BridgeError("INVALID_ARGUMENT","mode must be background or foreground") }
        guard foregroundEnabled || (method != "focus" && mode != "foreground") else {
            throw BridgeError("FOREGROUND_DISABLED","Foreground control is disabled. Only an explicitly configured CU_ENABLE_FOREGROUND=1 server permits cu_focus or mode:foreground. No action was performed.")
        }
        let backgroundMode = mode == "background"
        if method == "type_text" {
            let strategy=p["strategy"] as? String ?? "auto"
            guard ["auto","ax","event"].contains(strategy),backgroundMode || strategy == "auto" else {throw BridgeError("INVALID_ARGUMENT","Text strategy must be auto, ax or event in background mode; foreground accepts auto only")}
        }
        if method == "key" {
            let strategy = p["strategy"] as? String ?? "auto"
            guard ["auto", "event", "appkit"].contains(strategy), backgroundMode || strategy == "auto" else {
                throw BridgeError("INVALID_ARGUMENT", "Key strategy must be auto, event or appkit in background; foreground accepts auto only")
            }
            if strategy == "appkit", p["durationMs"] != nil {
                throw BridgeError("INVALID_ARGUMENT", "The experimental AppKit key strategy supports a single press without a hold.")
            }
        }
        if method == "click", p["strategy"] as? String == "appkit" {
            guard backgroundMode, p["elementId"] == nil, p["snapshotId"] == nil,
                  (p["button"] as? String ?? "left") == "left", number(p, "count", 1) == 1,
                  p["modifiers"] == nil, p["durationMs"] == nil else {
                throw BridgeError("INVALID_ARGUMENT", "The experimental AppKit click strategy requires a single background left coordinate click without modifiers or a hold.")
            }
        }
        if backgroundMode && ["click","type_text","key","scroll","drag"].contains(method) { return try await background(method,p) }
        switch method {
        case "cursor_state": return agentCursor.state
        case "cursor_hide": agentCursor.hide();return ["ok":true]
        case "hover": return try await foregroundHover(p)
        case "cursor":
            try requireAX()
            let (application,window,frame)=try target(p)
            guard !application.isHidden,window["onScreen"] as? Bool == true else{throw BridgeError("WINDOW_NOT_VISIBLE","Agent cursor requires a window on the active desktop")}
            try await agentCursor.move(pid:application.processIdentifier,windowID:CGWindowID(number(p,"windowId")),frame:frame,point:try point(p,frame))
            return agentCursor.state
        case "status":
            let displays = NSScreen.screens.map { screen -> Object in
                let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
                return ["displayId": id, "name": screen.localizedName, "frame": rectJSON(CGDisplayBounds(id)), "backingScale": screen.backingScaleFactor]
            }
            return ["platform": "macOS", "osVersion": ProcessInfo.processInfo.operatingSystemVersionString, "bridgeVersion": bridgeVersion, "permissions": ["accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess()], "displays": displays, "allowedBundleIds": allowed.map { Array($0).sorted() } as Any? ?? NSNull(), "clipboardEnabled": clipboardEnabled, "foregroundEnabled":foregroundEnabled, "inputFocus":SystemInputFocus.observe().json, "backend": "independent-macos-apis", "background": ["default":true,"experimentalAppKitFocus":ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1","appKitFocusPolicy":ProcessInfo.processInfo.environment["CU_EXPERIMENTAL_APPKIT_FOCUS"] == "1" ? "experimental activation; may activate target text input context":"no synthetic activation; prefer semantic shortcuts", "AXRaiseRequestsInBackground":false,"windowLocationSPIAvailable":windowLocationSetter != nil,"click":"AXPress preferred; optional window-scoped postToPid","pointer":"window-scoped postToPid with source-filtered routing-flag removal and packet acknowledgements; apps can still reorder","text":"verified AX by default; strategy:event verifies process-directed Unicode keyboard events","keys":"CMD+A verified AX; others process-directed, observe result","foregroundFallback":false], "pid": ProcessInfo.processInfo.processIdentifier]
        case "request_permissions":
            if p["accessibility"] as? Bool == true { _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) }
            if p["screenRecording"] as? Bool == true { _ = CGRequestScreenCaptureAccess() }
            return try await handle("status", [:])
        case "apps":
            return ["apps": NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular && (allowed == nil || allowed!.contains($0.bundleIdentifier ?? "")) }.map(appJSON)]
        case "windows":
            return ["windows": windows(pid: p["pid"].map { _ in Int(number(p, "pid")) })]
        case "launch":
            let bundle = try string(p, "bundleId")
            if let allowed, !allowed.contains(bundle) { throw BridgeError("APP_NOT_ALLOWED", "Bundle identifier is outside CU_ALLOWED_BUNDLE_IDS") }
            if backgroundMode {
                let running=NSRunningApplication.runningApplications(withBundleIdentifier:bundle).filter{!$0.isTerminated}
                if running.count==1 {return ["app":appJSON(running[0]),"alreadyRunning":true,"launchRequested":false]}
                guard running.count<2 else{throw BridgeError("MULTIPLE_APP_INSTANCES","Multiple instances already exist; choose an exact PID with cu_apps/cu_windows. No launch request was made.")}
                guard p["allowVisibleWindows"] as? Bool == true else{throw BridgeError("VISIBLE_LAUNCH_REQUIRED","Launching a new app can raise windows even with activates=false. Set allowVisibleWindows:true only when visible setup is acceptable. No launch request was made.")}
            }
            guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) else { throw BridgeError("APP_NOT_FOUND", "No installed application with bundle identifier \(bundle)") }
            let config = NSWorkspace.OpenConfiguration(); config.activates = !backgroundMode
            let a = try await NSWorkspace.shared.openApplication(at: url, configuration: config)
            return ["app": appJSON(a),"launchRequested":true,"visibleSetupAllowed":true,"mode":mode]
        case "snapshot": return try await snapshot(p)
        case "screenshot": return ["screenshot": try await screenshot(p)]
        case "ocr": return try await ocr(p)
        case "focus":
            let t = try await focus(p); return ["app": appJSON(t.0), "window": t.1]
        case "select_text":
            let semanticOrder = backgroundMode ? backgroundWindowOrder() : []
            let semanticFront = NSWorkspace.shared.frontmostApplication?.processIdentifier
            let r = try ref(p)
            let inputObservation=backgroundMode ? try BackgroundFocusObservation(targetPID:r.pid):nil
            defer {inputObservation?.stop()}
            guard r.scope == "window", let value = attr(r.element, kAXValueAttribute) as? String else { throw BridgeError("NOT_TEXT", "Element has no editable text value") }
            let text = try string(p, "text")
            let full = value as NSString; var matches: [NSRange] = []; var start = 0
            while start < full.length {
                let range = full.range(of: text, options: [.literal], range: NSRange(location: start, length: full.length-start))
                if range.location == NSNotFound { break }
                let before = full.substring(to: range.location); let after = full.substring(from: range.location+range.length)
                if (p["prefix"] as? String).map({ before.hasSuffix($0) }) ?? true,
                   (p["suffix"] as? String).map({ after.hasPrefix($0) }) ?? true { matches.append(range) }
                start = range.location+max(1,range.length)
            }
            guard matches.count == 1 else { throw BridgeError(matches.isEmpty ? "TEXT_NOT_FOUND" : "AMBIGUOUS_TEXT", "Expected one matching text range; found \(matches.count). Use prefix/suffix to disambiguate.") }
            let selected = matches[0]; let mode = p["selection"] as? String ?? "text"
            var range = CFRange(location: selected.location, length: selected.length)
            if mode == "cursor_before" { range.length = 0 }
            if mode == "cursor_after" { range.location += range.length; range.length = 0 }
            if !backgroundMode { _ = try await focus(["pid": Int(r.pid), "windowId": Int(r.windowID)]) }
            if backgroundMode,let at=axFrame(r.element) {
                let (_,_,frame)=try target(["pid":Int(r.pid),"windowId":Int(r.windowID)])
                try await agentCursor.move(pid:r.pid,windowID:r.windowID,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:"select")
            }
            if let inputObservation {
                try inputObservation.validate()
                try assertBackgroundIsolation(r.pid,r.windowID,semanticOrder,semanticFront)
            }
            try axCheck(AXUIElementSetAttributeValue(r.element, kAXFocusedAttribute as CFString, kCFBooleanTrue), "Focus text element")
            guard let encoded = AXValueCreate(.cfRange, &range) else { throw BridgeError("AX_ERROR", "Could not encode text range") }
            try axCheck(AXUIElementSetAttributeValue(r.element, kAXSelectedTextRangeAttribute as CFString, encoded), "Select text")
            if backgroundMode {
                try await Task.sleep(nanoseconds:80_000_000)
                try inputObservation?.validate()
                try assertBackgroundIsolation(r.pid,r.windowID,semanticOrder,semanticFront)
            }
            var result:Object=["ok": true, "utf16Range": ["location": range.location, "length": range.length], "mode":backgroundMode ? "background" : "foreground"]
            if let inputObservation {result["inputFocusObservation"]=inputObservation.json}
            return result
        case "ax_action":
            let semanticOrder = backgroundMode ? backgroundWindowOrder() : []
            let semanticFront = NSWorkspace.shared.frontmostApplication?.processIdentifier
            let r = try ref(p); let action = try string(p, "action")
            let inputObservation=backgroundMode ? try BackgroundFocusObservation(targetPID:r.pid):nil
            var valueWrite: (before: String, requested: String)?
            defer {inputObservation?.stop()}
            if r.scope == "menu", backgroundMode { throw BridgeError("BACKGROUND_MENU_UNSUPPORTED", "Global application menus can interfere with the foreground session. Use explicit foreground mode only when authorized.") }
            if backgroundMode, action == "press" || action == "showMenu" { try checkBackgroundPopup(r.element) }
            if r.scope == "menu" { _ = try await focus(["pid": Int(r.pid), "windowId": Int(r.windowID)]) }
            if backgroundMode,let at=axFrame(r.element) {
                let (_,_,frame)=try target(["pid":Int(r.pid),"windowId":Int(r.windowID)])
                try await agentCursor.move(pid:r.pid,windowID:r.windowID,frame:frame,point:CGPoint(x:at.midX,y:at.midY),activity:action)
            }
            if let inputObservation {
                try inputObservation.validate()
                try assertBackgroundIsolation(r.pid,r.windowID,semanticOrder,semanticFront)
            }
            if action == "setValue" {
                guard let value = p["value"] as? String else { throw BridgeError("INVALID_ARGUMENT", "setValue requires value") }
                var settable: DarwinBoolean = false
                try axCheck(AXUIElementIsAttributeSettable(r.element, kAXValueAttribute as CFString, &settable), "Check value")
                guard settable.boolValue else { throw BridgeError("AX_NOT_SETTABLE", "AXValue is not settable") }
                if backgroundMode, let before = attr(r.element, kAXValueAttribute) as? String {
                    valueWrite = (before, value)
                }
                try axCheck(AXUIElementSetAttributeValue(r.element, kAXValueAttribute as CFString, value as CFString), "Set value")
            } else if action == "focus" {
                if !backgroundMode { _ = try await focus(["pid": Int(r.pid), "windowId": Int(r.windowID)]) }
                try axCheck(AXUIElementSetAttributeValue(r.element, kAXFocusedAttribute as CFString, kCFBooleanTrue), "Focus element")
            } else {
                let actions = ["press": kAXPressAction, "showMenu": kAXShowMenuAction, "increment": kAXIncrementAction, "decrement": kAXDecrementAction, "confirm": kAXConfirmAction]
                guard let name = actions[action] else { throw BridgeError("INVALID_ARGUMENT", "Unsupported AX action") }
                try axCheck(AXUIElementPerformAction(r.element, name as CFString), action)
                if action == "press" {agentCursor.pulse()}
            }
            var result:Object=["ok": true, "mode":backgroundMode ? "background" : "foreground", "verificationRequired":true]
            if backgroundMode {
                try await Task.sleep(nanoseconds:80_000_000)
                var unchanged = false
                if let write = valueWrite {
                    var actual = attr(r.element, kAXValueAttribute) as? String
                    if actual == write.before, write.requested != write.before {
                        try await Task.sleep(nanoseconds:120_000_000)
                        actual = attr(r.element, kAXValueAttribute) as? String
                    }
                    result["valueVerified"] = actual == write.requested
                    unchanged = actual == write.before && write.requested != write.before
                }
                try inputObservation?.validate()
                try assertBackgroundIsolation(r.pid,r.windowID,semanticOrder,semanticFront)
                if unchanged {
                    throw BridgeError("AX_VALUE_UNCHANGED", "AX accepted the write, but the element still reports its previous value. Observe the control before choosing another action.")
                }
            }
            if let inputObservation {result["inputFocusObservation"]=inputObservation.json}
            return result
        case "click":
            var params = p
            if p["elementId"] != nil {
                let r = try ref(p); params["pid"] = Int(r.pid); params["windowId"] = Int(r.windowID)
                guard let f = axFrame(r.element) else { throw BridgeError("NO_ELEMENT_FRAME", "Use cu_ax_action on this element") }
                let (_, _, wf) = try target(params)
                params["x"] = f.midX-wf.minX; params["y"] = f.midY-wf.minY
            }
            let (a, _, f) = try await focus(params)
            if p["elementId"] != nil {
                let r = try ref(p)
                guard let current = axFrame(r.element) else { throw BridgeError("STALE_ELEMENT", "Element frame disappeared during focus") }
                params["x"] = current.midX-f.minX; params["y"] = current.midY-f.minY
            }
            let at = try point(params, f)
            try assertHitTarget(a.processIdentifier, f, at)
            let buttonName = p["button"] as? String ?? "left"
            let button: CGMouseButton = buttonName == "right" ? .right : buttonName == "middle" ? .center : .left
            let down: CGEventType = button == .left ? .leftMouseDown : button == .right ? .rightMouseDown : .otherMouseDown
            let up: CGEventType = button == .left ? .leftMouseUp : button == .right ? .rightMouseUp : .otherMouseUp
            let count = min(3, max(1, Int(number(p, "count", 1))))
            for i in 1...count { try assertFocus(a.processIdentifier); try mouse(down, at, button, i); try mouse(up, at, button, i) }
            return ["ok": true, "point": ["x": at.x-f.minX, "y": at.y-f.minY]]
        case "type_text":
            let (a, _, _) = try await focus(p); try ensureEditableNotSecure(a.processIdentifier)
            let text = p["text"] as? String ?? ""
            // Chunk on Character boundaries to keep composed Unicode sequences intact.
            var chunk = ""
            func post(_ text: String) throws {
                try assertFocus(a.processIdentifier); try ensureEditableNotSecure(a.processIdentifier)
                let utf16 = Array(text.utf16)
                for down in [true, false] {
                    guard let e = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down) else { throw BridgeError("EVENT_FAILED", "Could not create keyboard event") }
                    utf16.withUnsafeBufferPointer { e.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: $0.baseAddress) }
                    e.post(tap: .cghidEventTap)
                }
            }
            for char in text {
                if chunk.utf16.count + String(char).utf16.count > 20 && !chunk.isEmpty { try post(chunk); chunk = ""; try await Task.sleep(nanoseconds: 4_000_000) }
                chunk.append(char)
            }
            if !chunk.isEmpty { try post(chunk) }
            return ["ok": true, "characters": text.count, "method": "CGEvent Unicode; clipboard untouched"]
        case "key":
            let (a, _, _) = try await focus(p); try ensureEditableNotSecure(a.processIdentifier); try await pressKey(string(p, "key"), a.processIdentifier)
            return ["ok": true]
        case "scroll":
            let (a, _, f) = try await focus(p)
            let at = try point(["x": p["x"] ?? f.width/2, "y": p["y"] ?? f.height/2], f)
            try assertHitTarget(a.processIdentifier, f, at)
            try assertFocus(a.processIdentifier); try mouse(.mouseMoved, at)
            guard let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: Int32(number(p, "deltaY")), wheel2: Int32(number(p, "deltaX")), wheel3: 0) else { throw BridgeError("EVENT_FAILED", "Could not create scroll event") }
            e.location = at; e.post(tap: .cghidEventTap); return ["ok": true]
        case "drag":
            let (a, _, f) = try await focus(p); let from = try point(p, f, "fromX", "fromY"); let to = try point(p, f, "toX", "toY")
            let duration = min(2, max(0.1, number(p, "duration", 0.4)))
            try assertHitTarget(a.processIdentifier, f, from)
            try assertFocus(a.processIdentifier); try mouse(.leftMouseDown, from)
            var last = from
            defer { try? mouse(.leftMouseUp, last) }
            for i in 1...30 {
                try assertFocus(a.processIdentifier)
                last = CGPoint(x: from.x+(to.x-from.x)*Double(i)/30, y: from.y+(to.y-from.y)*Double(i)/30)
                try mouse(.leftMouseDragged, last); try await Task.sleep(nanoseconds: UInt64(duration/30*1_000_000_000))
            }
            return ["ok": true]
        case "clipboard":
            guard clipboardEnabled else { throw BridgeError("CLIPBOARD_DISABLED", "Set CU_ENABLE_CLIPBOARD=1 explicitly to expose clipboard access") }
            guard allowed == nil else { throw BridgeError("CLIPBOARD_DISABLED", "Global clipboard access is unavailable in app-allowlist mode") }
            if p["text"] != nil {
                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(p["text"] as? String ?? "", forType: .string)
                return ["ok": true]
            }
            return ["text": NSPasteboard.general.string(forType: .string) ?? ""]
        default: throw BridgeError("METHOD_NOT_FOUND", "Unknown method \(method)")
        }
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let desktop = MainActor.assumeIsolated { Desktop() }
var terminationSignals: [DispatchSourceSignal] = []
for signo in [SIGTERM, SIGINT] {
    signal(signo, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: signo, queue: .main)
    source.setEventHandler {
        Task { @MainActor in
            desktop.shuttingDown=true;desktop.releaseInput()
            try? await Task.sleep(nanoseconds:100_000_000)
            exit(0)
        }
    }
    source.resume(); terminationSignals.append(source)
}
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        let semaphore = DispatchSemaphore(value: 0)
        Task { @MainActor in
            var response: Object = [:]
            do {
                guard let data = line.data(using: .utf8), let request = try JSONSerialization.jsonObject(with: data) as? Object else { throw BridgeError("INVALID_REQUEST", "Expected a JSON object") }
                response["id"] = request["id"] ?? NSNull()
                let method = try string(request, "method")
                let result = try await desktop.handle(method, request["params"] as? Object ?? [:])
                // Allow the receiving app's event loop to consume ordinary input.
                // This is bounded delivery grace, not a claim that async UI/network work settled.
                if ["click", "key", "type_text", "scroll", "drag", "ax_action", "select_text", "focus"].contains(method) {
                    try await Task.sleep(nanoseconds: 80_000_000)
                }
                response["result"] = result
            } catch let e as BridgeError { response["error"] = ["code": e.code, "message": e.message] }
            catch { response["error"] = ["code": "NATIVE_ERROR", "message": error.localizedDescription] }
            do {
                let data = try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys])
                FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
            } catch { FileHandle.standardError.write(Data("Failed to encode response: \(error)\n".utf8)) }
            semaphore.signal()
        }
        semaphore.wait()
    }
    DispatchQueue.main.async { application.terminate(nil) }
}
application.run()
