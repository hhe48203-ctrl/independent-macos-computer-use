import Foundation

// AppKit may handle a newline/tab as a command and discard the rest of its
// Unicode event payload. Keep those controls in their own acknowledged event.
func backgroundUnicodePackets(_ text:String)->[[UniChar]] {
    var packets:[[UniChar]]=[];var packet:[UniChar]=[]
    for scalar in text.unicodeScalars {
        let units=Array(String(scalar).utf16)
        if scalar == "\n" || scalar == "\r" || scalar == "\t" {
            if !packet.isEmpty {packets.append(packet);packet=[]}
            packets.append(units)
        } else {
            if packet.count+units.count>16 {packets.append(packet);packet=[]}
            packet.append(contentsOf:units)
        }
    }
    if !packet.isEmpty {packets.append(packet)}
    return packets
}
