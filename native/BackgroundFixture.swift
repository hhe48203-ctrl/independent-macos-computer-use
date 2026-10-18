// Real AppKit test applications. Each instance owns only its own state and logs.
import AppKit
import ApplicationServices

final class FixtureApplication:NSApplication {
    override func nextEvent(matching mask:NSEvent.EventTypeMask,until expiration:Date?,inMode mode:RunLoop.Mode,dequeue flag:Bool)->NSEvent? {
        let event=super.nextEvent(matching:mask,until:expiration,inMode:mode,dequeue:flag)
        if let event,[10,11,21].contains(event.type.rawValue),flag {
            (delegate as? BackgroundFixture)?.recordQueueEvent(event)
        }
        return event
    }
}

final class EventPad: NSView {
    var changed: (() -> Void)?
    var clicks = 0; var scrolls = 0; var drags = 0; var releases = 0
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.systemBlue.withAlphaComponent(0.2).setFill(); bounds.fill()
        ("Event pad: clicks \(clicks), scrolls \(scrolls), drags \(drags)" as NSString).draw(at: NSPoint(x: 15, y: 60), withAttributes: [.font: NSFont.systemFont(ofSize: 16), .foregroundColor: NSColor.labelColor])
    }
    override func mouseDown(with event: NSEvent) { clicks += 1; changed?(); needsDisplay = true }
    override func mouseUp(with event: NSEvent) { releases += 1; changed?() }
    override func mouseDragged(with event: NSEvent) { drags += 1; changed?(); needsDisplay = true }
    override func scrollWheel(with event: NSEvent) { scrolls += 1; changed?(); needsDisplay = true }
}
final class BackgroundFixture: NSObject, NSApplicationDelegate, NSTextFieldDelegate {
    let role = CommandLine.arguments[1]
    let directory = URL(fileURLWithPath: CommandLine.arguments[2])
    var window: NSWindow!; var text = NSTextField(string: "")
    let result = NSTextField(labelWithString: "Result: waiting")
    let pad = EventPad(); var count = 0
    var timer: Timer?; var started = Date(); var samples: [[String: Any]] = []; var events: [[String: Any]] = []
    var monitor: Any?
    var notifications: [NSObjectProtocol] = []
    var activations: [[String:Any]] = []
    func recordQueueEvent(_ event:NSEvent) {
        var row:[String:Any]=["phase":"application-queue","t":Date().timeIntervalSince(started),"type":event.type.rawValue,"window":event.windowNumber,"flags":event.modifierFlags.rawValue]
        if event.type == .keyDown || event.type == .keyUp {row["characters"]=event.characters ?? "";row["keyCode"]=event.keyCode}
        if event.type.rawValue == 21 {row["subtype"]=event.subtype.rawValue}
        events.append(row)
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu(); let item = NSMenuItem(); let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        item.submenu = edit; menu.addItem(item); NSApp.mainMenu = menu
        let cover = role == "cover"
        let rect = cover ? NSRect(x: 80, y: 70, width: 1300, height: 800) : NSRect(x: 260, y: 230, width: 640, height: 460)
        window = NSWindow(contentRect: rect, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = cover ? "Background Automation — Foreground Workspace" : "Background Automation — Target"
        window.isOpaque = true; window.backgroundColor = cover ? .windowBackgroundColor : .controlBackgroundColor
        window.isReleasedWhenClosed = false
        let content = window.contentView!; let height = rect.height
        let title = NSTextField(labelWithString: cover ? "Foreground workspace — user input must stay here" : "Covered background target")
        title.frame = NSRect(x: 20, y: height-60, width: rect.width-40, height: 30); title.font = .boldSystemFont(ofSize: 18); content.addSubview(title)
        text.frame = NSRect(x: 20, y: height-110, width: 400, height: 30); text.delegate = self
        text.setAccessibilityIdentifier("message-input"); text.setAccessibilityLabel("Message input"); content.addSubview(text)
        let button = NSButton(title: "Apply message", target: self, action: #selector(apply))
        button.frame = NSRect(x: 440, y: height-112, width: 170, height: 34); button.setAccessibilityIdentifier("apply-message"); content.addSubview(button)
        result.frame = NSRect(x: 20, y: height-160, width: rect.width-40, height: 30); result.setAccessibilityIdentifier("result-label"); content.addSubview(result)
        pad.frame = NSRect(x: 20, y: height-330, width: 580, height: 140); pad.setAccessibilityIdentifier("event-pad"); pad.setAccessibilityElement(true); pad.setAccessibilityRole(.group)
        pad.changed = { [weak self] in self?.save() }; content.addSubview(pad)
        let scroll = NSScrollView(frame: NSRect(x: cover ? 650 : 20, y: 20, width: cover ? 600 : 580, height: cover ? 600 : 100))
        scroll.hasVerticalScroller = true; scroll.setAccessibilityIdentifier("scroll-area")
        let document = NSTextView(frame: NSRect(x: 0, y: 0, width: scroll.frame.width, height: 2400))
        document.string = (1...100).map { "Scrollable row \($0) — background text" }.joined(separator: "\n")
        document.isEditable = false; document.font = .systemFont(ofSize: 16); document.setAccessibilityIdentifier("scroll-document")
        scroll.documentView = document; content.addSubview(scroll)
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown,.leftMouseUp,.mouseMoved,.scrollWheel,.keyDown,.keyUp,.appKitDefined,.applicationDefined]) { [weak self] event in
            guard let self else { return event }
            var row:[String:Any]=["t": Date().timeIntervalSince(self.started), "type": event.type.rawValue, "subtype": event.subtype.rawValue, "window": event.windowNumber, "x": event.locationInWindow.x, "y": event.locationInWindow.y, "flags": event.modifierFlags.rawValue]
            // This monitor runs inside our disposable fixture, never another app.
            if event.type == .keyDown || event.type == .keyUp {row["characters"]=event.characters ?? "";row["keyCode"]=event.keyCode}
            self.events.append(row)
            return event
        }
        window.makeFirstResponder(text)
        if CommandLine.arguments.contains("--background") {
            window.orderBack(nil)
            if cover, let id=Int(CommandLine.arguments.last ?? "") { window.order(.above,relativeTo:id) }
        } else {
            window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
        }
        notifications.append(NSWorkspace.shared.notificationCenter.addObserver(forName:NSWorkspace.didActivateApplicationNotification,object:nil,queue:.main) { [weak self] notification in
            guard let self,let a=notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else{return}
            self.activations.append(["t":Date().timeIntervalSince(self.started),"pid":a.processIdentifier,"bundleId":a.bundleIdentifier ?? ""])
        })
        timer = Timer.scheduledTimer(withTimeInterval: 0.005, repeats: true) { [weak self] _ in self?.sample() }
        save()
    }
    func sample() {
        let cursor = CGEvent(source: nil)?.location ?? .zero
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
        let nativePointer=NSEvent.mouseLocation
        samples.append(["t": Date().timeIntervalSince(started), "frontPid": front, "x": cursor.x, "y": cursor.y, "active": NSApp.isActive, "key": window.isKeyWindow, "input": text.stringValue, "nativeX":nativePointer.x, "nativeY":CGDisplayBounds(CGMainDisplayID()).height-nativePointer.y])
        if samples.count > 20000 { samples.removeFirst(1000) }
        if events.count > 10000 { events.removeFirst(1000) }
        if samples.count % 40 == 0 { save() }
    }
    @objc func apply() { count += 1; result.stringValue = "Result: \(text.stringValue) [\(count)]"; save() }
    func controlTextDidChange(_ obj: Notification) { save() }
    func save() {
        let state: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier, "windowId": window.windowNumber, "role": role, "input": text.stringValue, "result": result.stringValue, "count": count, "clicks": pad.clicks, "scrolls": pad.scrolls, "drags": pad.drags, "releases":pad.releases, "active": NSApp.isActive, "key": window.isKeyWindow, "epoch":started.timeIntervalSince1970,
            "firstResponderClass":window.firstResponder.map{String(describing:type(of:$0))} ?? "none","textEditorPresent":text.currentEditor() != nil,"applicationClass":String(describing:type(of:NSApp!))]
        func write(_ value: Any, _ name: String) { if let data = try? JSONSerialization.data(withJSONObject: value) { try? data.write(to: directory.appendingPathComponent(name), options: .atomic) } }
        write(state, "\(role)-state.json"); write(samples, "\(role)-samples.json"); write(events, "\(role)-events.json")
        write(activations,"\(role)-activations.json")
    }
    func applicationWillTerminate(_ notification: Notification) { save() }
}
if CommandLine.arguments.contains("--regular-background"),!CommandLine.arguments.contains("--launch-services-background"),ProcessInfo.processInfo.environment["CU_TEST_ALLOW_FOREGROUND_SETUP"] != "1" {fputs("Direct regular launch may activate the application; explicit foreground setup is required.\n",stderr);exit(2)}
let app = FixtureApplication.shared; let delegate = BackgroundFixture()
app.setActivationPolicy(CommandLine.arguments.contains("--background") && !CommandLine.arguments.contains("--regular-background") ? .accessory : .regular); app.delegate = delegate; app.run()
