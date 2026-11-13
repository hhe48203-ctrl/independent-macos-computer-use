import Foundation

typealias NormalWindowOrder = [(id: Int, pid: pid_t)]

enum BackgroundWindowCrossing: Equatable {
    case existingWindow, newWindow
}

func backgroundWindowCrossing(pid: pid_t, windowId: Int, before: NormalWindowOrder, after: NormalWindowOrder) -> BackgroundWindowCrossing? {
    let priorIndices = Dictionary(before.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: { first, _ in first })
    let anchor = before.firstIndex { $0.id == windowId && $0.pid == pid }
        ?? before.firstIndex { $0.pid == pid }
    var earliestCoveredIndex = before.count
    var newWindowCrossed = false
    for window in after.reversed() {
        let previousIndex = priorIndices[window.id]
        if window.pid != pid {
            if let previousIndex, before[previousIndex].pid == window.pid {
                earliestCoveredIndex = min(earliestCoveredIndex, previousIndex)
            }
        } else if let previousIndex, before[previousIndex].pid == pid {
            if earliestCoveredIndex < previousIndex { return .existingWindow }
        } else if let anchor, earliestCoveredIndex < anchor {
            // A new normal window may cross an existing cover even if its
            // parent stays put or the action closes the initiating window.
            newWindowCrossed = true
        }
    }
    return newWindowCrossed ? .newWindow : nil
}
