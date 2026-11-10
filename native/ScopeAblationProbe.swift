// Test-only first-party focus-stage ablation. Never linked into the MCP helper.
import AppKit
import ApplicationServices
@main struct ScopeAblationProbe {
 @MainActor static func main(){
  let args=CommandLine.arguments
  guard args.count==5,let pid=Int32(args[1]),let wid=UInt32(args[2]),let mask=Int(args[3]),(0...7).contains(mask),
        NSRunningApplication(processIdentifier:pid)?.bundleIdentifier=="io.local.computeruse.document-target" else{fputs("Owned document fixture PID/window and mask 0..7 required\n",stderr);exit(2)}
  let application=NSApplication.shared;application.setActivationPolicy(.accessory)
  let desktop=Desktop();let params:Object=["pid":Int(pid),"windowId":Int(wid)]
  Task{@MainActor in
   var result:Object=["mask":mask,"status":"observed","startedEpoch":Date().timeIntervalSince1970]
   var session:ScopedAppKitFocus?;var delivery:BackgroundPointerDelivery?;var focusObservation:BackgroundFocusObservation?
   do{
    let observation=try BackgroundFocusObservation(targetPID:pid)
    focusObservation=observation
    let (_,_,frame)=try desktop.target(params)
    guard SystemInputFocus.observe().foregroundPID != pid else{throw BridgeError("TARGET_FOREGROUND","Owned target must be in background")}
    let window=try desktop.axWindow(pid,frame)
    let value=attr(window,NSAccessibility.Attribute.activationPoint.rawValue) as! AXValue
    var point=CGPoint.zero;guard AXValueGetValue(value,.cgPoint,&point),frame.contains(point) else{throw BridgeError("INVALID_ACTIVATION_POINT","Owned window activation point unavailable")}
    if mask&5 != 0 {session=ScopedAppKitFocus(pid:pid,windowID:wid)}
    if mask&1 != 0 {try session!.send(.appKitDefined,1,[.control,.option],Int(wid))}
    try await Task.sleep(nanoseconds:20_000_000)
    if mask&2 != 0 {
     delivery=try BackgroundPointerDelivery(pid:pid,windowID:wid)
     try desktop.backgroundMouse(.leftMouseDown,point,.left,1,pid,wid,frame,delivery)
     try desktop.backgroundMouse(.leftMouseUp,point,.left,1,pid,wid,frame,delivery)
     try await delivery!.waitForDelivery()
    }
    if mask&4 != 0 {try session!.send(NSEvent.EventType(rawValue:21)!,Int16.min,[],0)}
    try await Task.sleep(nanoseconds:200_000_000)
    do{result["key"]=try await desktop.backgroundKey(params.merging(["key":"Right","strategy":"event"]){_,n in n},pid,wid,frame,observation)}catch let e as BridgeError{result["keyError"]=["code":e.code,"message":e.message]}
    try await Task.sleep(nanoseconds:100_000_000)
    session?.finish();result["cleanupEpoch"]=Date().timeIntervalSince1970
    try await Task.sleep(nanoseconds:150_000_000)
    let snapshot=try await desktop.handle("snapshot",params.merging(["screenshot":false]){_,n in n})
    let node=(snapshot["nodes"] as? [Object])?.first{($0["identifier"] as? String)=="scroll-document"}
    result["documentSelection"]=node?["selectedRange"] ?? NSNull();result["rightAccepted"]=(node?["selectedRange"] as? Object)?["location"] as? Int == 1
    result["inputFocus"]=observation.json;result["session"]=session?.json ?? [:]
    try observation.validate()
   }catch let e as BridgeError{result["status"]="failed";result["error"]=["code":e.code,"message":e.message]}
    catch{result["status"]="failed";result["error"]=error.localizedDescription}
   session?.finish();desktop.releaseInput();delivery?.stop();focusObservation?.stop()
   result["endedEpoch"]=Date().timeIntervalSince1970
   if let data=try? JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]){try? data.write(to:URL(fileURLWithPath:args[4]),options:.atomic)}
   application.terminate(nil)
  }
  application.run()
 }
}
