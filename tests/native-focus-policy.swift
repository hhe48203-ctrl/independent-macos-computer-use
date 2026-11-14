import AppKit

@main struct FocusPolicyTests {
    static func state(_ front:pid_t?,_ key:pid_t?,error:Int32?=0)->InputFocusObservation {
        InputFocusObservation(foregroundPID:front,keyboardPID:key,queryAvailable:true,queryError:error,conversionError:key == nil ? nil:0,systemFlag:nil)
    }
    static func main() {
        let initial=state(100,100)
        precondition(state(100,100).change(from:initial,targetPID:200) == .stable)
        precondition(state(100,200).change(from:initial,targetPID:200) == .targetGainedFocus)
        // A ViewBridge/helper recipient can steal input without being the target
        // and without changing NSWorkspace.frontmostApplication.
        precondition(state(100,677).change(from:initial,targetPID:200) == .unexpectedRecipient)
        precondition(state(300,300).change(from:initial,targetPID:200) == .foregroundTransition)
        precondition(state(200,200).change(from:initial,targetPID:200) == .targetGainedFocus)
        precondition(state(100,200).hasKeyboardFocusWithoutForeground(200))
        precondition(!state(100,677).hasKeyboardFocusWithoutForeground(200))
        precondition(!state(200,200).hasKeyboardFocusWithoutForeground(200))
        precondition(!state(nil,200).hasKeyboardFocusWithoutForeground(200))
        precondition(!state(100,nil).hasKeyboardFocusWithoutForeground(200))
        let unresolved=state(100,nil,error:1003)
        precondition(unresolved.change(from:initial,targetPID:200) == .unresolved)
        precondition(initial.change(from:unresolved,targetPID:200) == .unresolved)
        precondition(unresolved.json["keyboardPID"] is NSNull)
        precondition(unresolved.json["keyboardFocusResolved"] as? Bool == false)
        print("PASS stable route, target theft, auxiliary theft, user foreground transition, unresolved query")

        let witness = (id: 10, pid: pid_t(100))
        let cover = (id: 11, pid: pid_t(101))
        let parent = (id: 12, pid: pid_t(200))
        let child = (id: 13, pid: pid_t(200))
        let initialOrder = [witness, cover, parent]
        func crossing(_ after: NormalWindowOrder) -> BackgroundWindowCrossing? {
            backgroundWindowCrossing(pid: parent.pid, windowId: parent.id, before: initialOrder, after: after)
        }
        precondition(crossing([witness, cover, child, parent]) == nil)
        precondition(crossing([witness, child, cover, parent]) == .newWindow)
        precondition(crossing([witness, child, cover]) == .newWindow)
        precondition(crossing([witness, child, parent, cover]) == .existingWindow)
        precondition(crossing([witness, child, parent]) == nil)
        precondition(crossing([witness, cover, parent, (id: 18, pid: 300)]) == nil)
        precondition(crossing([witness, child, (id: cover.id, pid: 300), parent]) == nil)
        print("PASS new and existing window order, closed parent, safe child, unrelated windows")
    }
}
