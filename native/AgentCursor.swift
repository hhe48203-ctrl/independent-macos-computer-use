// Independent visible cursor. No hardware cursor APIs or input event taps.
import AppKit
import ApplicationServices

final class AgentCursorPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

// Two visually distinct styles. `arrow` is the default: a standard macOS
// pointer (black fill, white outline, tip at the same anchor) with a small
// highlight while pressed. `ring` remains the amber reticle for anyone who
// wants a glyph that does not read as a pointer.
enum AgentCursorStyle: String {
    case arrow, ring
    static var configured: AgentCursorStyle {
        AgentCursorStyle(rawValue:(ProcessInfo.processInfo.environment["CU_AGENT_CURSOR_STYLE"] ?? "").lowercased()) ?? .arrow
    }
    var summary: String {
        switch self {
        case .arrow: return "standard macOS arrow pointer"
        case .ring: return "amber reticle with crosshair ticks"
        }
    }
}

enum AgentCursorVisibility: String {
    case target, always
    static var configured: AgentCursorVisibility {
        AgentCursorVisibility(rawValue:(ProcessInfo.processInfo.environment["CU_AGENT_CURSOR_VISIBILITY"] ?? "").lowercased()) ?? .target
    }
}

// WindowServer exposes bounds and z-order, not other processes' per-pixel
// shapes. Treat every nonzero-alpha window above the target as an occluder,
// including translucent windows and windows owned by the target's process.
// Subtract only inside the small cursor footprint, keeping the work bounded.
enum AgentCursorRegion {
    static func subtract(_ cover:CGRect,from rect:CGRect)->[CGRect] {
        let hit=rect.intersection(cover)
        guard !hit.isNull,!hit.isEmpty else{return [rect]}
        return [CGRect(x:rect.minX,y:rect.minY,width:rect.width,height:hit.minY-rect.minY),
                CGRect(x:rect.minX,y:hit.maxY,width:rect.width,height:rect.maxY-hit.maxY),
                CGRect(x:rect.minX,y:hit.minY,width:hit.minX-rect.minX,height:hit.height),
                CGRect(x:hit.maxX,y:hit.minY,width:rect.maxX-hit.maxX,height:hit.height)]
            .filter{!$0.isEmpty && !$0.isNull}
    }
    static func visible(footprint:CGRect,point:CGPoint,target:CGRect,covers:[CGRect],screens:[CGRect])->[CGRect] {
        guard target.contains(point),screens.contains(where:{$0.contains(point)}),!covers.contains(where:{$0.contains(point)}) else{return []}
        let area=footprint.intersection(target)
        guard !area.isNull,!area.isEmpty else{return []}
        var regions=screens.map{area.intersection($0)}.filter{!$0.isNull && !$0.isEmpty}
        for cover in covers where cover.intersects(area) {
            regions=regions.flatMap{subtract(cover,from:$0)}
            if regions.count>256{return []} // Fail closed on pathological geometry.
        }
        return regions
    }
}

final class AgentCursorView: NSView {
    var pressed=false
    var activity="move"
    var style:AgentCursorStyle = .arrow
    var clipRects:[CGRect]? // nil is the explicit always-visible mode.
    override var isFlipped: Bool {true}
    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill(); bounds.fill(using:.copy)
        // AppKit treats an empty NSBezierPath clip as a no-op.
        if clipRects?.isEmpty == true {return}
        NSGraphicsContext.saveGraphicsState()
        if let clipRects {
            let clip=NSBezierPath()
            for rect in clipRects {clip.appendRect(rect)}
            clip.addClip() // Includes the arrow shadow, not just the glyph.
        }
        switch style {
        case .arrow: drawArrow()
        case .ring: drawRing()
        }
        NSGraphicsContext.restoreGraphicsState()
    }
    private func drawArrow() {
        // Hotspot stays at (24, 24), matching the ring center and panel math.
        if pressed {
            let mark=NSBezierPath(ovalIn:NSRect(x:12,y:12,width:24,height:24))
            NSColor(calibratedRed:0.42,green:0.28,blue:0.95,alpha:0.42).setFill();mark.fill()
        }
        let arrow=NSBezierPath()
        let tip=NSPoint(x:24,y:24),scale:CGFloat=1.35
        let raw=[NSPoint(x:0,y:0),NSPoint(x:0,y:16.5),NSPoint(x:4.6,y:12.6),NSPoint(x:7.4,y:19.8),NSPoint(x:10.2,y:18.5),NSPoint(x:7.3,y:11.6),NSPoint(x:12.6,y:11.6)]
        arrow.move(to:NSPoint(x:tip.x+raw[0].x*scale,y:tip.y+raw[0].y*scale))
        for point in raw.dropFirst() {arrow.line(to:NSPoint(x:tip.x+point.x*scale,y:tip.y+point.y*scale))}
        arrow.close()
        arrow.lineWidth=3.2;arrow.lineJoinStyle = .round;arrow.lineCapStyle = .round
        NSColor.white.setStroke();arrow.stroke()
        NSColor.black.setFill();arrow.fill()
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
    private var visibleRects:[CGRect]=[]
    private var visibilityReason="inactive"
    private var occluderCount=0
    static func motionDuration(distance:Double)->Double {min(0.55,max(0.16,0.16+distance/1600))}
    static func interpolate(from:CGPoint,to:CGPoint,progress:Double)->CGPoint {
        let t=min(1,max(0,progress));let eased=t*t*(3-2*t)
        return CGPoint(x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased)
    }
    static func needsOrdering(visible:Bool,panelIndex:Int?,targetIndex:Int)->Bool {
        // A user may bring the target itself in front of an existing panel.
        // Restore only our own panel in that case; do not repeatedly reorder
        // it when a different foreground window moves in front.
        !visible || panelIndex.map{$0>targetIndex} == true
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
    private let visibility=AgentCursorVisibility.configured
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
            p.ignoresMouseEvents=true;p.hidesOnDeactivate=false;p.isFloatingPanel=visibility == .always;p.becomesKeyOnlyIfNeeded=true
            p.level = visibility == .always ? .statusBar:.normal;p.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.stationary,.ignoresCycle]
            p.isExcludedFromWindowsMenu=true;p.setAccessibilityElement(false)
            let v=AgentCursorView(frame:NSRect(x:0,y:0,width:80,height:80));v.setAccessibilityElement(false);v.style=style;p.contentView=v
            panel=p;view=v
        }
        position(frame)
        if timer==nil {timer=Timer.scheduledTimer(withTimeInterval:1.0/60,repeats:true){[weak self] _ in MainActor.assumeIsolated{self?.track()}}}
        history.append(["sequence":sequence,"motion":motionGeneration,"moving":moving,"time":Date().timeIntervalSince1970,"pid":Int(pid),"windowId":Int(windowID),"x":relative.x,"y":relative.y,"globalX":global.x,"globalY":global.y,"pressed":pressed,"activity":activity,"panelFrame":rectJSON(panel?.frame ?? .zero),"visible":panel?.isVisible ?? false,"visibilityReason":visibilityReason])
        if history.count>256 {history.removeFirst(history.count-256)}
    }
    private func position(_ frame:CGRect) {
        global=CGPoint(x:frame.minX+relative.x,y:frame.minY+relative.y)
        let top=NSScreen.screens.first?.frame.maxY ?? CGDisplayBounds(CGMainDisplayID()).height
        // Clear the old mask before moving the panel: an old, less restrictive
        // mask must not be reused at a new screen position.
        let origin=Self.appKitOrigin(global:global,primaryTop:top)
        if panel?.frame.origin != origin {
            if visibility == .target {view?.clipRects=[];view?.needsDisplay=true;panel?.displayIfNeeded()}
            panel?.setFrameOrigin(origin)
        }
        view?.pressed=pressed || Date()<pulseUntil;view?.activity=activity;view?.needsDisplay=true
        refreshVisibility(primaryTop:top)
        panel?.displayIfNeeded()
    }
    private func refreshVisibility(primaryTop:Double) {
        guard let panel,let view else{return}
        let footprint=CGRect(x:global.x-24,y:global.y-24,width:80,height:80)
        if visibility == .always {
            visibleRects=[footprint];view.clipRects=nil;visibilityReason="always";occluderCount=0
            if !panel.isVisible {panel.orderFrontRegardless()};return
        }
        guard let rows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [Object],
              let index=rows.firstIndex(where:{($0[kCGWindowNumber as String] as? Int)==Int(windowID) && ($0[kCGWindowOwnerPID as String] as? Int)==Int(pid)}),
              let raw=rows[index][kCGWindowBounds as String] as? Object,
              let target=CGRect(dictionaryRepresentation:raw as CFDictionary),
              (rows[index][kCGWindowAlpha as String] as? Double ?? 1)>0 else {
            visibleRects=[];view.clipRects=[];visibilityReason="target-unavailable";panel.orderOut(nil);return
        }
        let covers=rows.prefix(index).compactMap{row -> CGRect? in
            // Exclude exactly this panel, never all windows of a process.
            guard (row[kCGWindowNumber as String] as? Int) != panel.windowNumber,
                  (row[kCGWindowAlpha as String] as? Double ?? 1)>0,
                  let raw=row[kCGWindowBounds as String] as? Object else{return nil}
            return CGRect(dictionaryRepresentation:raw as CFDictionary)
        }
        occluderCount=covers.filter{$0.intersects(footprint)}.count
        let screens=NSScreen.screens.map{CGRect(x:$0.frame.minX,y:primaryTop-$0.frame.maxY,width:$0.frame.width,height:$0.frame.height)}
        visibleRects=AgentCursorRegion.visible(footprint:footprint,point:global,target:target,covers:covers,screens:screens)
        // Round inward in view-local backing pixels, so antialiased glyphs and
        // glow cannot cross the conservative visibility boundary on Retina.
        let scale=panel.backingScaleFactor
        let local=visibleRects.map{r -> CGRect in
            let x=ceil((r.minX-footprint.minX)*scale)/scale,y=ceil((r.minY-footprint.minY)*scale)/scale
            return CGRect(x:x,y:y,width:max(0,floor((r.maxX-footprint.minX)*scale)/scale-x),height:max(0,floor((r.maxY-footprint.minY)*scale)/scale-y))
        }.filter{!$0.isEmpty}
        view.clipRects=local
        visibleRects=local.map{$0.offsetBy(dx:footprint.minX,dy:footprint.minY)}
        guard !local.isEmpty else{visibilityReason="occluded-or-outside";panel.orderOut(nil);return}
        visibilityReason=visibleRects.reduce(0){$0+$1.width*$1.height}<footprint.width*footprint.height ? "clipped":"visible"
        // Order only our own panel when becoming visible or overtaken by the
        // target itself. Never
        // order relative to another process, change a target level, or reorder
        // an already-visible panel on each tick. New front windows can cover
        // the normal-level panel immediately, before the next mask sample.
        let panelIndex=rows.firstIndex{($0[kCGWindowNumber as String] as? Int)==panel.windowNumber}
        if Self.needsOrdering(visible:panel.isVisible,panelIndex:panelIndex,targetIndex:index) {panel.orderFrontRegardless()}
    }
    private func track() {
        guard Date().timeIntervalSince(touched)<30,let frame=currentFrame(pid:pid,windowID:windowID) else {hide();return}
        if moving {return}
        // Keep the logical target point when a window moves. On resize, hide
        // instead of inventing a new element location; a fresh operation shows it.
        guard frame.size==dimensions,relative.x>=0,relative.y>=0,relative.x<frame.width,relative.y<frame.height else{hide();return}
        position(frame)
    }
    func hide() {motionGeneration+=1;panel?.orderOut(nil);timer?.invalidate();timer=nil;pressed=false;pulseUntil = .distantPast;visibleRects=[];visibilityReason="inactive"}
    var state:Object {
        ["enabled":enabled,"moving":moving,"style":style.rawValue,"styleDescription":style.summary,"visibilityMode":visibility.rawValue,"visibilityReason":visibilityReason,"clipRects":visibleRects.map{rectJSON($0)},"occluderCount":occluderCount,"occlusionGeometry":"conservative-window-bounds","visible":panel?.isVisible ?? false,"windowId":Int(panel?.windowNumber ?? 0),"targetPID":Int(pid),"targetWindowId":Int(windowID),"relative":["x":relative.x,"y":relative.y],"global":["x":global.x,"y":global.y],"panelFrame":rectJSON(panel?.frame ?? .zero),"backingScale":panel?.backingScaleFactor ?? 1,"pressed":pressed,"activity":activity,"sequence":sequence,"ignoresMouseEvents":panel?.ignoresMouseEvents ?? true,"canBecomeKey":panel?.canBecomeKey ?? false,"canBecomeMain":panel?.canBecomeMain ?? false,"history":history]
    }
}
