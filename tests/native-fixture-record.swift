import AppKit

@main struct FixtureRecordTests {
    static func main() throws {
        for type in [NSEvent.EventType.keyDown,.keyUp] {
            let event=NSEvent.keyEvent(with:type,location:.zero,modifierFlags:.command,timestamp:0,windowNumber:0,context:nil,characters:"a",charactersIgnoringModifiers:"a",isARepeat:false,keyCode:0)!
            // The old logger's unconditional subtype getter throws an ObjC
            // exception here and terminates this test before it can pass.
            let row=fixtureEventRecord(event,elapsed:1)
            precondition(row["type"] as? UInt == type.rawValue)
            precondition(row["characters"] as? String == "a")
            precondition(row["keyCode"] as? UInt16 == 0)
            precondition(row["subtype"] == nil)
            _=try JSONSerialization.data(withJSONObject:row)
        }
        let notice=NSEvent.otherEvent(with:.appKitDefined,location:.zero,modifierFlags:[],timestamp:0,windowNumber:0,context:nil,subtype:1,data1:0,data2:0)!
        precondition(fixtureEventRecord(notice,elapsed:2)["subtype"] as? Int16 == 1)
        print("Fixture key and notice logging passed without posting input")
    }
}
