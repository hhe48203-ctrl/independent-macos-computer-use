// Controlled test surface. No network, no access to other apps or user documents.
import AppKit

final class DragPad: NSView {
    var changed: (() -> Void)?
    var drags = 0
    var scrolls = 0
    var releases = 0
    override func draw(_ dirtyRect: NSRect) {
        NSColor.systemTeal.withAlphaComponent(0.15).setFill(); bounds.fill()
        ("Drag / scroll test pad" as NSString).draw(at: NSPoint(x: 12, y: 35), withAttributes: [.font: NSFont.systemFont(ofSize: 15)])
    }
    override func mouseDown(with event: NSEvent) {}
    override func mouseDragged(with event: NSEvent) { drags += 1; changed?() }
    override func mouseUp(with event: NSEvent) { releases += 1; changed?() }
    override func scrollWheel(with event: NSEvent) { scrolls += 1; changed?() }
}

final class Fixture: NSObject, NSApplicationDelegate, NSTextFieldDelegate {
    var window: NSWindow!
    let input = NSTextField(string: "")
    let result = NSTextField(labelWithString: "Result: waiting")
    let secure = NSSecureTextField(string: "fixture-secret")
    let pad = DragPad()
    var count = 0
    var statePath = ""
    func applicationDidFinishLaunching(_ notification: Notification) {
        statePath = CommandLine.arguments.dropFirst().first ?? "/tmp/local-computer-use-fixture.json"
        let menu = NSMenu()
        let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editItem.submenu = edit; menu.addItem(editItem); NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 200, y: 180, width: 640, height: 460), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Computer Use Test Fixture"
        window.isReleasedWhenClosed = false
        let content = window.contentView!
        let title = NSTextField(labelWithString: "Independent Computer Use — 本地测试")
        title.font = .boldSystemFont(ofSize: 19); title.frame = NSRect(x: 24, y: 402, width: 590, height: 30); content.addSubview(title)
        input.frame = NSRect(x: 24, y: 345, width: 410, height: 30); input.placeholderString = "Type your test message"; input.delegate = self
        input.setAccessibilityIdentifier("message-input"); input.setAccessibilityLabel("Message input"); content.addSubview(input)
        let button = NSButton(title: "Apply message", target: self, action: #selector(apply))
        button.frame = NSRect(x: 450, y: 344, width: 165, height: 34); button.setAccessibilityIdentifier("apply-message"); content.addSubview(button)
        result.frame = NSRect(x: 24, y: 292, width: 590, height: 35); result.setAccessibilityIdentifier("result-label"); content.addSubview(result)
        let label = NSTextField(labelWithString: "Secure field (must be redacted):")
        label.frame = NSRect(x: 24, y: 245, width: 260, height: 24); content.addSubview(label)
        secure.frame = NSRect(x: 300, y: 242, width: 280, height: 28); secure.setAccessibilityIdentifier("secure-input"); content.addSubview(secure)
        pad.frame = NSRect(x: 24, y: 120, width: 590, height: 90); pad.changed = { [weak self] in self?.save() }; content.addSubview(pad)
        let check = NSButton(checkboxWithTitle: "Fixture option", target: nil, action: nil)
        check.frame = NSRect(x: 24, y: 62, width: 200, height: 30); check.setAccessibilityIdentifier("fixture-option"); content.addSubview(check)
        let slider = NSSlider(value: 50, minValue: 0, maxValue: 100, target: nil, action: nil)
        slider.frame = NSRect(x: 300, y: 60, width: 280, height: 30); slider.setAccessibilityIdentifier("fixture-slider"); content.addSubview(slider)
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        save()
    }
    @objc func apply() { count += 1; result.stringValue = "Result: \(input.stringValue) [\(count)]"; save() }
    func controlTextDidChange(_ obj: Notification) { save() }
    func save() {
        let data: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier, "input": input.stringValue, "result": result.stringValue, "count": count, "drags": pad.drags, "scrolls": pad.scrolls, "releases": pad.releases]
        if let json = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]) { try? json.write(to: URL(fileURLWithPath: statePath), options: .atomic) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
let fixture = Fixture()
app.setActivationPolicy(.regular)
app.delegate = fixture
app.run()
