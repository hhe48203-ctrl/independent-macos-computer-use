// Test-only instrumentation, compiled solely into disposable owned fixtures.
// No injection, method replacement or text observation in Codex/other applications.
import AppKit
import Carbon
import ObjectiveC.runtime

enum FocusDiagnostics {
    static var output:URL?
    static var rows:[[String:Any]]=[]
    static var busy=false
    static var dropped=0
    static var lastSignature=""
    static func state()->[String:Any] {
        let mask:CGEventFlags=[.maskAlphaShift,.maskShift,.maskControl,.maskAlternate,.maskCommand,.maskSecondaryFn]
        var sourceID="unavailable"
        if let source=TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),let raw=TISGetInputSourceProperty(source,kTISPropertyInputSourceID){sourceID=Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String}
        return ["epoch":Date().timeIntervalSince1970,"pid":getpid(),"active":NSApp?.isActive ?? false,"keyWindow":NSApp?.keyWindow?.windowNumber ?? 0,"frontPID":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,"tsmDocument":String(describing:TSMGetActiveDocument()),"inputSource":sourceID,"hidFlags":CGEventSource.flagsState(.hidSystemState).intersection(mask).rawValue,"combinedFlags":CGEventSource.flagsState(.combinedSessionState).intersection(mask).rawValue]
    }
    static func record(_ name:String,stack:Bool=false,extra:[String:Any]=[:]){
        guard output != nil,!busy else{return};busy=true;defer{busy=false}
        var row=state();row["name"]=name;row.merge(extra){_,new in new}
        if stack{row["stack"]=Array(Thread.callStackSymbols.prefix(24))}
        if rows.count<15000{rows.append(row)}else{dropped += 1}
    }
    static func sample(){
        guard output != nil else{return}
        let s=state();let signature="\(s["active"]!):\(s["keyWindow"]!):\(s["tsmDocument"]!):\(s["inputSource"]!)"
        if signature != lastSignature{lastSignature=signature;record("state-change")}
    }
    static func event(_ event:NSEvent,phase:String){
        var data:[String:Any]=["eventType":event.type.rawValue,"eventWindow":event.windowNumber,"eventFlags":event.modifierFlags.rawValue,"eventTimestamp":event.timestamp]
        if [13,14,15,21].contains(event.type.rawValue){data["eventSubtype"]=event.subtype.rawValue}
        if let e=event.cgEvent {data["sourcePID"]=e.getIntegerValueField(.eventSourceUnixProcessID);data["tag"]=e.getIntegerValueField(.eventSourceUserData)}
        record(phase,extra:data)
    }
    static func install(_ path:String){
        output=URL(fileURLWithPath:path)
        for name in ["activate","deactivate"] {
            let selector=NSSelectorFromString(name)
            guard let method=class_getInstanceMethod(NSTextInputContext.self,selector),method_getNumberOfArguments(method)==2 else{record("missing-context-selector",extra:["selector":name]);continue}
            let original=method_getImplementation(method)
            typealias Original=@convention(c)(AnyObject,Selector)->Void
            let implementation=unsafeBitCast(original,to:Original.self)
            let block:@convention(block)(AnyObject)->Void={object in
                record("input-context-\(name)-before",stack:true)
                implementation(object,selector)
                record("input-context-\(name)-after")
            }
            method_setImplementation(method,imp_implementationWithBlock(block))
        }
        record("diagnostic-ready");save()
    }
    static func save(){guard let output,let data=try? JSONSerialization.data(withJSONObject:["events":rows,"dropped":dropped,"scope":"Only this disposable fixture; public input-context methods call the original implementation once; no keyboard text recorded"],options:[.sortedKeys]) else{return};try? data.write(to:output,options:.atomic)}
}
final class FocusDiagnosticWindow:NSWindow {
    override func accessibilityPerformRaise()->Bool {
        FocusDiagnostics.record("AXRaise-request",stack:true)
        if CommandLine.arguments.contains("--diagnostic-reject-raise"){FocusDiagnostics.record("AXRaise-rejected-by-owned-control");return false}
        return super.accessibilityPerformRaise()
    }
    override func order(_ place:NSWindow.OrderingMode,relativeTo other:Int){FocusDiagnostics.record("order",stack:true,extra:["mode":place.rawValue,"relativeTo":other,"window":windowNumber]);super.order(place,relativeTo:other)}
    override func orderFront(_ sender:Any?){FocusDiagnostics.record("orderFront",stack:true);super.orderFront(sender)}
    override func orderFrontRegardless(){FocusDiagnostics.record("orderFrontRegardless",stack:true);super.orderFrontRegardless()}
    override func makeKeyAndOrderFront(_ sender:Any?){FocusDiagnostics.record("makeKeyAndOrderFront",stack:true);super.makeKeyAndOrderFront(sender)}
    override func makeKey(){FocusDiagnostics.record("makeKey",stack:true);super.makeKey()}
    override func becomeKey(){FocusDiagnostics.record("becomeKey",stack:true);super.becomeKey()}
    override func resignKey(){FocusDiagnostics.record("resignKey",stack:true);super.resignKey()}
    override func becomeMain(){FocusDiagnostics.record("becomeMain",stack:true);super.becomeMain()}
    override func resignMain(){FocusDiagnostics.record("resignMain",stack:true);super.resignMain()}
}
