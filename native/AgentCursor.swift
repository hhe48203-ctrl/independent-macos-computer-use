// Independent visible cursor. No hardware cursor APIs or input event taps.
import AppKit
import ApplicationServices

final class AgentCursorPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

// Two visually distinct styles. `arrow` keeps the original translucent outline
// with a soft glow; `ring` is a compact amber reticle whose shape and color do
// not read as a pointer, so it cannot be mistaken for the Codex cursor.
enum AgentCursorStyle: String {
    case arrow, ring
    static var configured: AgentCursorStyle {
        AgentCursorStyle(rawValue:(ProcessInfo.processInfo.environment["CU_AGENT_CURSOR_STYLE"] ?? "").lowercased()) ?? .arrow
    }
    var summary: String {
        switch self {
        case .arrow: return "translucent light outline with soft glow"
        case .ring: return "amber reticle with crosshair ticks"
        }
    }
}

final class AgentCursorView: NSView {
    var pressed=false
    var activity="move"
    var style:AgentCursorStyle = .arrow
    override var isFlipped: Bool {true}
    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill(); bounds.fill(using:.copy)
        NSGraphicsContext.saveGraphicsState()
        switch style {
        case .arrow: drawArrow()
        case .ring: drawRing()
        }
        NSGraphicsContext.restoreGraphicsState()
    }
    private func drawArrow() {
        let arrow=NSBezierPath()
        arrow.move(to:NSPoint(x:25,y:24))
        arrow.curve(to:NSPoint(x:27,y:24),controlPoint1:NSPoint(x:25,y:23.5),controlPoint2:NSPoint(x:26,y:23.5))
        arrow.line(to:NSPoint(x:43,y:30))
        arrow.curve(to:NSPoint(x:43,y:33),controlPoint1:NSPoint(x:45,y:30.7),controlPoint2:NSPoint(x:45,y:32))
        arrow.line(to:NSPoint(x:35,y:35));arrow.line(to:NSPoint(x:31,y:43))
        arrow.curve(to:NSPoint(x:28,y:43),controlPoint1:NSPoint(x:30.2,y:45),controlPoint2:NSPoint(x:28.7,y:45))
        arrow.line(to:NSPoint(x:24,y:27))
        arrow.curve(to:NSPoint(x:25,y:24),controlPoint1:NSPoint(x:23.7,y:25.7),controlPoint2:NSPoint(x:23.8,y:24.5));arrow.close()
        let transform=AffineTransform(translationByX: -24,byY: -24)
        arrow.transform(using:transform)
        arrow.transform(using:AffineTransform(scale:pressed ? 0.68:0.76))
        arrow.transform(using:AffineTransform(translationByX:24,byY:24))
        let shadow=NSShadow();shadow.shadowColor=NSColor(calibratedRed:0.63,green:0.77,blue:0.96,alpha:0.55);shadow.shadowBlurRadius=12;shadow.shadowOffset = .zero;shadow.set()
        NSColor(calibratedRed:0.63,green:0.72,blue:0.85,alpha:pressed ? 0.48:0.22).setFill();arrow.fill()
        NSColor(calibratedWhite:1,alpha:pressed ? 1:0.85).setStroke();arrow.lineWidth=1.6;arrow.lineJoinStyle = .round;arrow.stroke()
    }
    private func drawRing() {
        // Same anchor as the arrow tip, so positioning math is unchanged.
        let center=NSPoint(x:24,y:24)
        let radius:CGFloat = pressed ? 8:11
        let ring=NSBezierPath(ovalIn:NSRect(x:center.x-radius,y:center.y-radius,width:radius*2,height:radius*2))
        NSColor(calibratedWhite:0,alpha:0.35).setStroke();ring.lineWidth=4.4;ring.stroke()
        NSColor(calibratedRed:0.98,green:0.72,blue:0.22,alpha:pressed ? 1:0.95).setStroke();ring.lineWidth=2.2;ring.stroke()
        let ticks=NSBezierPath(),inner=radius+2.5,outer=radius+6.5
        for (dx,dy) in [(1.0,0.0),(-1.0,0.0),(0.0,1.0),(0.0,-1.0)] {
            ticks.move(to:NSPoint(x:center.x+CGFloat(dx)*inner,y:center.y+CGFloat(dy)*inner))
            ticks.line(to:NSPoint(x:center.x+CGFloat(dx)*outer,y:center.y+CGFloat(dy)*outer))
        }
        ticks.lineWidth=2.2;ticks.lineCapStyle = .round;ticks.stroke()
        let dot=NSBezierPath(ovalIn:NSRect(x:center.x-2,y:center.y-2,width:4,height:4))
        NSColor(calibratedWhite:1,alpha:pressed ? 1:0.9).setFill();dot.fill()
    }
}

@MainActor final class AgentCursor {
    private(set) var panel:AgentCursorPanel?
    private var view:AgentCursorView?
    private var timer:Timer?
    private var pid:pid_t=0
    private var windowID:CGWindowID=0
    private var relative=CGPoint.zero
    private var global=CGPoint.zero
    private var dimensions=CGSize.zero
    private var touched=Date.distantPast
    private var pressed=false
    private var activity="move"
    private var sequence=0
    private var history:[Object]=[]
    private var moving=false
    private var motionGeneration=0
    private var hasPosition=false
    private var pulseUntil=Date.distantPast
    static func motionDuration(distance:Double)->Double {min(0.55,max(0.16,0.16+distance/1600))}
    static func interpolate(from:CGPoint,to:CGPoint,progress:Double)->CGPoint {
        let t=min(1,max(0,progress));let eased=t*t*(3-2*t)
        return CGPoint(x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased)
    }
    private func currentFrame(pid:pid_t,windowID:CGWindowID)->CGRect? {
        guard NSRunningApplication(processIdentifier:pid)?.isHidden == false,
              let rows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [Object],
              let row=rows.first(where:{($0[kCGWindowNumber as String] as? Int)==Int(windowID)&&($0[kCGWindowOwnerPID as String] as? Int)==Int(pid)}),
              let bounds=row[kCGWindowBounds as String] as? Object else{return nil}
        return CGRect(dictionaryRepresentation:bounds as CFDictionary)
    }
    func move(pid:pid_t,windowID:CGWindowID,frame:CGRect,point:CGPoint,activity:String="move") async throws {
        guard enabled else{return}
        motionGeneration+=1;let generation=motionGeneration
        let from=hasPosition ? global:point
        let distance=hypot(point.x-from.x,point.y-from.y)
        let duration=distance<0.5 ? 0:Self.motionDuration(distance:distance)
        let steps=duration>0 ? max(2,Int(ceil(duration*60))):1
        moving=true
        defer {moving=false}
        for step in 0...steps {
            guard generation==motionGeneration else{throw BridgeError("CANCELLED","Agent cursor motion was cancelled; no target action was sent")}
            guard let current=currentFrame(pid:pid,windowID:windowID),current==frame else{hide();throw BridgeError("WINDOW_MOVED","Target moved, resized or disappeared during cursor motion; observe before acting")}
            let at=Self.interpolate(from:from,to:point,progress:Double(step)/Double(steps))
            update(pid:pid,windowID:windowID,frame:frame,point:at,activity:activity)
            if step<steps {try await Task.sleep(nanoseconds:UInt64((duration>0 ? duration/Double(steps):1.0/60)*1e9))}
        }
    }
    private let enabled=ProcessInfo.processInfo.environment["CU_AGENT_CURSOR"] != "0"
    private let style=AgentCursorStyle.configured
    static func appKitOrigin(global:CGPoint, primaryTop:Double, size:Double=80)->CGPoint {
        // The pointer tip is (24,24) from the panel's top-left. Cocoa uses
        // bottom-left coordinates; CG uses primary-display top-left coordinates.
        CGPoint(x:global.x-24,y:primaryTop-global.y-(size-24))
    }
    func pulse(){pulseUntil=Date().addingTimeInterval(0.16);view?.pressed=true;view?.needsDisplay=true;panel?.displayIfNeeded()}
    func update(pid:pid_t,windowID:CGWindowID,frame:CGRect,point:CGPoint,pressed:Bool=false,activity:String="move",activate:Bool=false) {
        guard enabled else{return}
        if activate || (pressed && !self.pressed) {pulseUntil=Date().addingTimeInterval(0.16)}
        self.pid=pid;self.windowID=windowID;relative=CGPoint(x:point.x-frame.minX,y:point.y-frame.minY)
        hasPosition=true
        dimensions=frame.size;self.pressed=pressed;self.activity=activity;touched=Date();sequence+=1
        if panel==nil {
            let p=AgentCursorPanel(contentRect:NSRect(x:0,y:0,width:80,height:80),styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
            p.title="Local Computer Use — Agent Cursor";p.isOpaque=false;p.backgroundColor = .clear;p.hasShadow=false
            p.ignoresMouseEvents=true;p.hidesOnDeactivate=false;p.isFloatingPanel=true;p.becomesKeyOnlyIfNeeded=true
            p.level = .statusBar;p.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.stationary,.ignoresCycle]
            p.isExcludedFromWindowsMenu=true;p.setAccessibilityElement(false)
            let v=AgentCursorView(frame:NSRect(x:0,y:0,width:80,height:80));v.setAccessibilityElement(false);v.style=style;p.contentView=v
            panel=p;view=v
        }
        position(frame)
        panel?.orderFrontRegardless() // Nonactivating, click-through, never key/main.
        if timer==nil {timer=Timer.scheduledTimer(withTimeInterval:1.0/30,repeats:true){[weak self] _ in MainActor.assumeIsolated{self?.track()}}}
        history.append(["sequence":sequence,"motion":motionGeneration,"moving":moving,"time":Date().timeIntervalSince1970,"pid":Int(pid),"windowId":Int(windowID),"x":relative.x,"y":relative.y,"globalX":global.x,"globalY":global.y,"pressed":pressed,"activity":activity,"panelFrame":rectJSON(panel?.frame ?? .zero)])
        if history.count>256 {history.removeFirst(history.count-256)}
    }
    private func position(_ frame:CGRect) {
        global=CGPoint(x:frame.minX+relative.x,y:frame.minY+relative.y)
        let top=NSScreen.screens.first?.frame.maxY ?? CGDisplayBounds(CGMainDisplayID()).height
        panel?.setFrameOrigin(Self.appKitOrigin(global:global,primaryTop:top))
        view?.pressed=pressed || Date()<pulseUntil;view?.activity=activity;view?.needsDisplay=true
        panel?.displayIfNeeded()
    }
    private func track() {
        guard Date().timeIntervalSince(touched)<30,let frame=currentFrame(pid:pid,windowID:windowID) else {hide();return}
        if moving {return}
        // Keep the logical target point when a window moves. On resize, hide
        // instead of inventing a new element location; a fresh operation shows it.
        guard frame.size==dimensions,relative.x>=0,relative.y>=0,relative.x<frame.width,relative.y<frame.height else{hide();return}
        position(frame)
    }
    func hide() {motionGeneration+=1;panel?.orderOut(nil);timer?.invalidate();timer=nil;pressed=false;pulseUntil = .distantPast}
    var state:Object {
        ["enabled":enabled,"moving":moving,"style":style.rawValue,"styleDescription":style.summary,"visible":panel?.isVisible ?? false,"windowId":Int(panel?.windowNumber ?? 0),"targetPID":Int(pid),"targetWindowId":Int(windowID),"relative":["x":relative.x,"y":relative.y],"global":["x":global.x,"y":global.y],"panelFrame":rectJSON(panel?.frame ?? .zero),"backingScale":panel?.backingScaleFactor ?? 1,"pressed":pressed,"activity":activity,"sequence":sequence,"ignoresMouseEvents":panel?.ignoresMouseEvents ?? true,"canBecomeKey":panel?.canBecomeKey ?? false,"canBecomeMain":panel?.canBecomeMain ?? false,"history":history]
    }
}
