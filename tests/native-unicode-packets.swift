import Foundation
@main struct PacketTests {
 static func main(){
  for text in ["", "汉🙂 é 👨‍👩‍👧‍👦", "\n事件滚动测试 00 abcdefghijklmnopqrstuvwxyz\n第二行\t末尾", String(repeating:"🙂",count:30), "123456789012345🙂\r\nend"] {
   let packets=backgroundUnicodePackets(text)
   precondition(packets.flatMap{$0}==Array(text.utf16),"Packets must reconstruct exact UTF-16")
   for p in packets {
    precondition(!p.isEmpty&&p.count<=16)
    precondition(!(0xdc00...0xdfff).contains(p.first!),"No leading low surrogate")
    precondition(!(0xd800...0xdbff).contains(p.last!),"No trailing high surrogate")
    if p.contains(where:{[9,10,13].contains($0)}){precondition(p.count==1,"Controls need their own packet")}
   }
  }
  print("Unicode packet boundaries passed")
 }
}
