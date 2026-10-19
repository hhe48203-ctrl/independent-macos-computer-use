// Test-only. Reads a bounded, explicitly requested test phrase in one app.
// Never records a draft value, unmarked text, hardware keys, or other apps.
import AppKit
import ApplicationServices
@MainActor final class HumanTextObservation {
 let expected:String
 let pid:pid_t
 var candidates:[AXUIElement]=[]
 var candidateRefreshes=0
 var lastRefreshUptime:Double=0
 var readErrors:[String:Int]=[:]
 var samples=0
 var markedSamples=0
 var completeSamples=0
 var maximumMatchingPrefix=0
 var progress:Set<Int>=[]
 var mismatchPositions:Set<Int>=[]
 var lastComplete=false
 var lastMarkedUTF16Count=0
 var firstMarkedEpoch:Double?
 var firstCompleteEpoch:Double?
 var lastCompleteEpoch:Double?
 init?(pid:pid_t) {
  guard let text=ProcessInfo.processInfo.environment["CU_HUMAN_TEST_TEXT"],text.hasPrefix("CUH-"),text.utf16.count>=12,text.utf16.count<=256 else{return nil}
  guard NSRunningApplication(processIdentifier:pid)?.bundleIdentifier=="com.openai.codex" else{return nil}
  expected=text;self.pid=pid
  refreshCandidates(budget:1)
 }
 func refreshCandidates(budget:Double){
  candidates=[];candidateRefreshes += 1;lastRefreshUptime=ProcessInfo.processInfo.systemUptime
  let root=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(root,0.05)
  var visited=0;let deadline=ProcessInfo.processInfo.systemUptime+budget
  func attribute(_ e:AXUIElement,_ name:String)->CFTypeRef?{var value:CFTypeRef?;return AXUIElementCopyAttributeValue(e,name as CFString,&value) == .success ? value:nil}
  func collect(_ e:AXUIElement,_ depth:Int){
   guard visited<3000,depth<45,candidates.count<8,ProcessInfo.processInfo.systemUptime<deadline else{return};visited += 1
   if let role=attribute(e,kAXRoleAttribute) as? String,["AXTextArea","AXTextField","AXComboBox"].contains(role),attribute(e,kAXSubroleAttribute) as? String != kAXSecureTextFieldSubrole {candidates.append(e)}
   for child in attribute(e,kAXChildrenAttribute) as? [AXUIElement] ?? []{collect(child,depth+1)}
  }
  collect(root,0)
 }
 func sample(){
  samples += 1
  if let path=ProcessInfo.processInfo.environment["CU_HUMAN_TEST_START_FILE"],!FileManager.default.fileExists(atPath:path){return}
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else{return}
  let app=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(app,0.05);var ref:CFTypeRef?
  var focused:AXUIElement?
  if AXUIElementCopyAttributeValue(app,kAXFocusedUIElementAttribute as CFString,&ref) == .success,let ref,CFGetTypeID(ref)==AXUIElementGetTypeID(){focused=(ref as! AXUIElement);if observe(focused!){return}}
  for candidate in candidates where focused.map({!CFEqual(candidate,$0)}) ?? true {if observe(candidate){return}}
  // Codex can replace its input element during a render. Rediscover only roles,
  // never values, on a bounded schedule after every cached candidate missed.
  if ProcessInfo.processInfo.systemUptime-lastRefreshUptime>=2 {
   refreshCandidates(budget:0.15)
   for candidate in candidates {if observe(candidate){return}}
  }
 }
 func observe(_ element:AXUIElement)->Bool {
  var kind:CFTypeRef?;_ = AXUIElementCopyAttributeValue(element,kAXRoleAttribute as CFString,&kind)
  guard let kind=kind as? String,["AXTextArea","AXTextField","AXComboBox"].contains(kind) else{return false}
  var role:CFTypeRef?;_ = AXUIElementCopyAttributeValue(element,kAXSubroleAttribute as CFString,&role)
  guard role as? String != kAXSecureTextFieldSubrole else{return false}
  var countValue:CFTypeRef?
  guard AXUIElementCopyAttributeValue(element,kAXNumberOfCharactersAttribute as CFString,&countValue) == .success,let count=countValue as? NSNumber,count.intValue>=8 else{return false}
  func read(_ location:Int,_ length:Int)->String? {
   var range=CFRange(location:location,length:length);guard let encoded=AXValueCreate(.cfRange,&range) else{return nil}
   var value:CFTypeRef?
   let status=AXUIElementCopyParameterizedAttributeValue(element,kAXStringForRangeParameterizedAttribute as CFString,encoded,&value)
   guard status == .success else{let key=String(status.rawValue);readErrors[key,default:0] += 1;return nil}
   return value as? String
  }
  let e=Array(expected.utf16)
  // Probe only bounded marker positions: field start, end-anchored test
  // phrase, and just before the caret. Never scan/store an unrelated draft.
  var positions=[0,max(0,count.intValue-e.count)]
  var selected:CFTypeRef?
  if AXUIElementCopyAttributeValue(element,kAXSelectedTextRangeAttribute as CFString,&selected) == .success,let selected,CFGetTypeID(selected)==AXValueGetTypeID(){
   var range=CFRange();if AXValueGetValue(selected as! AXValue,.cfRange,&range),range.location>=e.count {positions.append(range.location-e.count)}
  }
  var actual:String?
  var matchedPosition=0
  for position in Array(Set(positions)).sorted() where position>=0 && position+8<=count.intValue {
   if let marker=read(position,8),Array(marker.utf16)==Array(e.prefix(8)) {
    actual=read(position,min(count.intValue-position,e.count));matchedPosition=position;break
   }
  }
  guard let actual else{return false}
  let a=Array(actual.utf16)
  let now=Date().timeIntervalSince1970
  if firstMarkedEpoch == nil {firstMarkedEpoch=now}
  markedSamples += 1;lastMarkedUTF16Count=min(count.intValue-matchedPosition,e.count)
  lastComplete=a==e
  var matching=0
  while matching<min(a.count,e.count)&&a[matching]==e[matching]{matching += 1}
  maximumMatchingPrefix=max(maximumMatchingPrefix,matching);progress.insert(matching)
  if matching<a.count {mismatchPositions.insert(matching)}
  if lastComplete {completeSamples += 1;if firstCompleteEpoch == nil{firstCompleteEpoch=now};lastCompleteEpoch=now}
  return true
 }
 var json:[String:Any]{["expectedTestPhrase":expected,"pid":pid,"cachedCandidateFields":candidates.count,"candidateRefreshes":candidateRefreshes,"rangeReadErrors":readErrors,"samples":samples,"markedSamples":markedSamples,"completeSamples":completeSamples,"maximumMatchingUTF16Prefix":maximumMatchingPrefix,"observedPrefixLengths":progress.sorted(),"mismatchPositions":mismatchPositions.sorted(),"lastComplete":lastComplete,"lastMarkedUTF16Count":lastMarkedUTF16Count,"firstMarkedEpoch":firstMarkedEpoch as Any? ?? NSNull(),"firstCompleteEpoch":firstCompleteEpoch as Any? ?? NSNull(),"lastCompleteEpoch":lastCompleteEpoch as Any? ?? NSNull(),"privacy":"Only bounded start/end/caret marker probes and the agreed phrase are compared; no draft or key contents stored."]}
}
