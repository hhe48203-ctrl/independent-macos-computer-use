// Disposable, network-free AppKit / WebKit applications for scroll measurements.
// File commands affect only this process's own test window and content.
import AppKit
import WebKit
final class Grid:NSView {
    override var isFlipped:Bool{true}
    override func draw(_ dirtyRect:NSRect){
        NSColor.white.setFill();dirtyRect.fill()
        for row in max(0,Int(dirtyRect.minY/24))...Int(dirtyRect.maxY/24) {
            ("Calibration row \(row) " as NSString).draw(at:NSPoint(x:10,y:Double(row)*24),withAttributes:[.foregroundColor:NSColor.black,.font:NSFont.systemFont(ofSize:14)])
        }
    }
}
final class Calibration:NSObject,NSApplicationDelegate,WKNavigationDelegate {
    let flavor=CommandLine.arguments[1],directory=URL(fileURLWithPath:CommandLine.arguments[2])
    var window:NSWindow!;var scroll:NSScrollView?;var web:WKWebView?;var timer:Timer?;var seq=0;var ready=false;var writing=false;var commands:[[String:Any]]=[]
    func applicationDidFinishLaunching(_ note:Notification){
        window=NSWindow(contentRect:NSRect(x:260,y:200,width:420,height:328),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
        window.collectionBehavior=[.canJoinAllSpaces,.stationary]
        window.title="Scroll Calibration — \(flavor)";window.isReleasedWhenClosed=false
        if flavor == "appkit" {
            let view=NSScrollView(frame:window.contentView!.bounds);view.autoresizingMask=[.width,.height];view.hasVerticalScroller=true;view.hasHorizontalScroller=true
            view.documentView=Grid(frame:NSRect(x:0,y:0,width:5000,height:20000));window.contentView!.addSubview(view);scroll=view;ready=true
        } else {
            let view=WKWebView(frame:window.contentView!.bounds);view.autoresizingMask=[.width,.height];view.navigationDelegate=self;window.contentView!.addSubview(view);web=view
            view.loadHTMLString("<html><meta name='viewport' content='width=device-width, initial-scale=1'><style>html,body{margin:0;height:100%;overflow:hidden}#s{height:100%;overflow:scroll}#g{width:5000px;height:20000px;background:repeating-linear-gradient(white 0px,white 23px,#bbb 24px);font:14px sans-serif}</style><div id='s'><div id='g'>WebKit scroll calibration (local fixture)</div></div></html>",baseURL:nil)
        }
        window.orderBack(nil)
        timer=Timer.scheduledTimer(withTimeInterval:0.05,repeats:true){[weak self] _ in self?.tick()};tick()
    }
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){ready=true;tick()}
    func tick(){
        if let data=try? Data(contentsOf:directory.appendingPathComponent(flavor+"-command.json")),let command=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let n=command["seq"] as? Int,n>seq {
            seq=n;commands.append(command)
            if let width=command["width"] as? Double,let height=command["height"] as? Double {
                var frame=window.frame;frame.size=NSSize(width:width,height:height);window.setFrame(frame,display:true)
            }
            let x=command["x"] as? Double ?? 2000,y=command["y"] as? Double ?? 2000
            if let scroll {scroll.contentView.scroll(to:NSPoint(x:x,y:y));scroll.reflectScrolledClipView(scroll.contentView)}
            if let web {web.evaluateJavaScript("var s=document.getElementById('s');s.scrollTo(\(x),\(y));")}
        }
        guard !writing else{return};writing=true
        if let scroll,let document=scroll.documentView {
            save(["x":scroll.contentView.bounds.minX,"y":scroll.contentView.bounds.minY,"viewportWidth":scroll.contentView.bounds.width,"viewportHeight":scroll.contentView.bounds.height,"contentWidth":document.bounds.width,"contentHeight":document.bounds.height])
        } else if let web,ready {
            web.evaluateJavaScript("(()=>{let s=document.getElementById('s');return {x:s.scrollLeft,y:s.scrollTop,viewportWidth:s.clientWidth,viewportHeight:s.clientHeight,contentWidth:s.scrollWidth,contentHeight:s.scrollHeight}})()") {[weak self] value,error in self?.save(value as? [String:Any] ?? ["error":error?.localizedDescription ?? "not ready"])}
        } else {save([:])}
    }
    func save(_ offset:[String:Any]){
        defer{writing=false}
        let frame=window.frame
        let state:[String:Any]=["pid":getpid(),"windowId":window.windowNumber,"flavor":flavor,"ready":ready,"seq":seq,"offset":offset,"frame":["x":frame.minX,"y":frame.minY,"width":frame.width,"height":frame.height],"active":NSApp.isActive,"key":window.isKeyWindow,"epoch":Date().timeIntervalSince1970]
        if let data=try? JSONSerialization.data(withJSONObject:state){try? data.write(to:directory.appendingPathComponent(flavor+"-state.json"),options:.atomic)}
    }
}
@main struct Main {
 static func main(){let app=NSApplication.shared;let delegate=Calibration();app.setActivationPolicy(.accessory);app.delegate=delegate;withExtendedLifetime(delegate){app.run()}}
}
