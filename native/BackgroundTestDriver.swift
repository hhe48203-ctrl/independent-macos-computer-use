// Test-only executable: arrange owned test windows and generate guarded foreground traffic.
import AppKit
import ApplicationServices
let args=CommandLine.arguments
let mode=args[1]
let pid=pid_t(args[2])!
func attr(_ e:AXUIElement,_ k:String)->CFTypeRef?{var v:CFTypeRef?;_ = AXUIElementCopyAttributeValue(e,k as CFString,&v);return v}
func window(_ id:Int)->AXUIElement?{
    let root=AXUIElementCreateApplication(pid)
    let rows=CGWindowListCopyWindowInfo(.optionAll,kCGNullWindowID) as? [[String:Any]] ?? []
    guard let row=rows.first(where:{ ($0[kCGWindowNumber as String] as? Int)==id && ($0[kCGWindowOwnerPID as String] as? Int)==Int(pid) }),let raw=row[kCGWindowBounds as String] as? [String:Any],let target=CGRect(dictionaryRepresentation:raw as CFDictionary) else{return nil}
    return (attr(root,kAXWindowsAttribute) as? [AXUIElement] ?? []).first{ e in
        guard let p=attr(e,kAXPositionAttribute),let s=attr(e,kAXSizeAttribute) else{return false}
        var pos=CGPoint.zero;var size=CGSize.zero
        AXValueGetValue(p as! AXValue,.cgPoint,&pos);AXValueGetValue(s as! AXValue,.cgSize,&size)
        return abs(pos.x-target.minX)<3 && abs(pos.y-target.minY)<3 && abs(size.width-target.width)<3 && abs(size.height-target.height)<3
    }
}
if mode=="restore-setup-foreground" {
    // Interactive test setup only. This is never linked into the MCP helper.
    guard ProcessInfo.processInfo.environment["CU_TEST_ALLOW_FOREGROUND_SETUP"] == "1",
          args.count==5,let ownedPID=pid_t(args[4]),
          let application=NSRunningApplication(processIdentifier:pid),application.bundleIdentifier=="com.openai.codex",
          let original=window(Int(args[3])!) else{fputs("Explicit setup and the exact original Codex window are required\n",stderr);exit(2)}
    let front=NSWorkspace.shared.frontmostApplication?.processIdentifier
    guard front==pid || front==ownedPID else{fputs("User switched to another app; setup will not restore foreground\n",stderr);exit(2)}
    let activationRequested=front != pid
    if activationRequested {guard application.activate(options:[]) else{fputs("Normal application activation was refused\n",stderr);exit(2)}}
    let raised=AXUIElementPerformAction(original,kAXRaiseAction as CFString)
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:["setupOnly":true,"activationRequested":activationRequested,"raiseStatus":raised.rawValue,"originalPID":pid,"originalWindow":Int(args[3])!]))
}else if mode=="ready" {
    let root=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(root,0.2)
    let id=Int(args[3])!;let w=window(id)
    let bundle=NSRunningApplication(processIdentifier:pid)?.bundleIdentifier ?? ""
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:["ready":w != nil && !bundle.isEmpty,"bundleId":bundle]))
}else if mode=="layout" {
    guard let w=window(Int(args[3])!) else{fputs("Owned test window not yet available in AX\n",stderr);exit(2)}
    var position=CGPoint(x:Double(args[4])!,y:Double(args[5])!);var size=CGSize(width:Double(args[6])!,height:Double(args[7])!)
    let s=AXUIElementSetAttributeValue(w,kAXSizeAttribute as CFString,AXValueCreate(.cgSize,&size)!)
    let p=AXUIElementSetAttributeValue(w,kAXPositionAttribute as CFString,AXValueCreate(.cgPoint,&position)!)
    print("layout",s.rawValue,p.rawValue)
}else if mode=="traffic" {
    let seconds=Double(args[3])!;let x=Double(args[4])!;let y=Double(args[5])!
    let report=args[6];let started=Date();var expected="";var points:[[String:Any]]=[];var aborted=false
    let source=CGEventSource(stateID:.privateState)!
    source.localEventsSuppressionInterval=0
    var index=0
    while Date().timeIntervalSince(started)<seconds {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{aborted=true;break}
        let p=CGPoint(x:x+Double(index%7)*2,y:y+Double(index%5)*2)
        let move=CGEvent(mouseEventSource:source,mouseType:.mouseMoved,mouseCursorPosition:p,mouseButton:.left)!
        move.flags=[];move.setIntegerValueField(.eventSourceUserData,value:0x55495352);move.post(tap:.cghidEventTap)
        points.append(["t":Date().timeIntervalSince1970,"x":p.x,"y":p.y])
        let text=String(UnicodeScalar(97+index%26)!)
        for down in [true,false]{
            guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{aborted=true;break}
            let event=CGEvent(keyboardEventSource:source,virtualKey:0,keyDown:down)!
            event.flags=[];let u=Array(text.utf16);u.withUnsafeBufferPointer{event.keyboardSetUnicodeString(stringLength:u.count,unicodeString:$0.baseAddress)}
            event.setIntegerValueField(.eventSourceUserData,value:0x55495352);event.post(tap:.cghidEventTap)
        }
        if aborted{break};expected+=text;index+=1;usleep(40000)
    }
    let result:[String:Any]=["expected":expected,"points":points,"aborted":aborted,"pid":pid,"epoch":started.timeIntervalSince1970,"duration":Date().timeIntervalSince(started)]
    try JSONSerialization.data(withJSONObject:result).write(to:URL(fileURLWithPath:report),options:.atomic)
}else if mode=="cursor-order"{
    let targetId=Int(args[3])!,coverId=Int(args[4])!,cursorId=Int(args[5])!
    let rows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
    func index(_ id:Int)->Int{rows.firstIndex{($0[kCGWindowNumber as String] as? Int)==id} ?? -1}
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:["target":index(targetId),"cover":index(coverId),"cursor":index(cursorId),"foregroundPID":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0]))
}else if mode=="covers"{
    let targetId=Int(args[3])!
    let rows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
    func rect(_ row:[String:Any])->CGRect?{guard let raw=row[kCGWindowBounds as String] as? [String:Any] else{return nil};return CGRect(dictionaryRepresentation:raw as CFDictionary)}
    var candidates:[[String:Int]]=[]
    if let index=rows.firstIndex(where:{($0[kCGWindowNumber as String] as? Int)==targetId}),let target=rect(rows[index]){
        for row in rows.prefix(index){if let bounds=rect(row),bounds.contains(target),(row[kCGWindowAlpha as String] as? Double ?? 0)>=0.999,let id=row[kCGWindowNumber as String] as? Int,let owner=row[kCGWindowOwnerPID as String] as? Int,owner != Int(pid){candidates.append(["windowId":id,"pid":owner])}}
    }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:["candidates":candidates]))
}else if mode=="occlusion"{
    let targetId=Int(args[3])!;let coverId=Int(args[4])!
    let rows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
    func rect(_ row:[String:Any])->CGRect?{guard let raw=row[kCGWindowBounds as String] as? [String:Any] else{return nil};return CGRect(dictionaryRepresentation:raw as CFDictionary)}
    let ti=rows.firstIndex{($0[kCGWindowNumber as String] as? Int)==targetId};let ci=rows.firstIndex{($0[kCGWindowNumber as String] as? Int)==coverId}
    var output:[String:Any]=["targetId":targetId,"coverId":coverId,"frontPid":NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,"pointerX":CGEvent(source:nil)!.location.x,"pointerY":CGEvent(source:nil)!.location.y]
    if let ti,let ci,let target=rect(rows[ti]),let cover=rect(rows[ci]){output["fullyCovered"]=ci<ti && cover.contains(target) && (rows[ci][kCGWindowAlpha as String] as? Double ?? 0)>=0.999;output["targetIndex"]=ti;output["coverIndex"]=ci;output["targetFrame"]=[target.minX,target.minY,target.width,target.height];output["coverFrame"]=[cover.minX,cover.minY,cover.width,cover.height]}else{output["fullyCovered"]=false}
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:output))
}
