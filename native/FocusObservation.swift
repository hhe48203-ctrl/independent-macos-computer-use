import AppKit
import Carbon

// Read-only OS observations. These are dynamically resolved system entrypoints,
// not calls into Codex. Never replace an unknown keyboard focus with frontmost PID.
struct InputFocusObservation {
    let foregroundPID: pid_t?
    let keyboardPID: pid_t?
    let queryAvailable: Bool
    let queryError: Int32?
    let conversionError: Int32?
    let systemFlag: Bool?
    var accessibilityPID: pid_t? = nil
    var json: [String:Any] {
        ["foregroundPID":foregroundPID.map { Int($0) } as Any? ?? NSNull(),
         "keyboardPID":keyboardPID.map { Int($0) } as Any? ?? NSNull(),
         "keyboardFocusResolved":keyboardPID != nil,
         "keyFocusPID":keyboardPID.map {Int($0)} as Any? ?? NSNull(),
         "keyboardFocusQuery":queryAvailable ? "CPSGetKeyFocusProcess then GetProcessPID; typing-focus routing is a separate diagnostic" : "unavailable",
         "accessibilityFocusedPID":accessibilityPID.map { Int($0) } as Any? ?? NSNull(),
         "queryAvailable":queryAvailable,
         "queryError":queryError as Any? ?? NSNull(),
         "conversionError":conversionError as Any? ?? NSNull(),
         "systemFlag":systemFlag as Any? ?? NSNull()]
    }
    enum Change:String {case unresolved,stable,foregroundTransition,targetGainedFocus,unexpectedRecipient}
    func hasKeyboardFocusWithoutForeground(_ pid: pid_t) -> Bool {
        guard let foregroundPID else { return false }
        return keyboardPID == pid && foregroundPID != pid
    }
    func change(from before:InputFocusObservation,targetPID:pid_t)->Change {
        guard let previous=before.keyboardPID,let current=keyboardPID else{return .unresolved}
        if current == targetPID,previous != targetPID {return .targetGainedFocus}
        if previous == current {return .stable}
        if before.foregroundPID == foregroundPID {return .unexpectedRecipient}
        return .foregroundTransition
    }
}

@MainActor enum SystemInputFocus {
    private typealias Query = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>,UnsafeMutablePointer<DarwinBoolean>) -> Int32
    private typealias Convert = @convention(c) (UnsafePointer<ProcessSerialNumber>,UnsafeMutablePointer<pid_t>) -> Int32
    private static let query: Query? = dlsym(UnsafeMutableRawPointer(bitPattern:-2),"CPSGetKeyFocusProcess").map { unsafeBitCast($0,to:Query.self) }
    private static let convert: Convert? = dlsym(UnsafeMutableRawPointer(bitPattern:-2),"GetProcessPID").map { unsafeBitCast($0,to:Convert.self) }
    static var publicAPIOnly: Bool { ProcessInfo.processInfo.environment["CU_PUBLIC_API_ONLY"] == "1" }
    static func observe() -> InputFocusObservation {
        let foreground=NSWorkspace.shared.frontmostApplication?.processIdentifier
        if publicAPIOnly {
            let system = AXUIElementCreateSystemWide()
            var app: CFTypeRef?
            var pid: pid_t = 0
            if AXUIElementCopyAttributeValue(system, kAXFocusedApplicationAttribute as CFString, &app) == .success,
               let app, CFGetTypeID(app) == AXUIElementGetTypeID() {
                _ = AXUIElementGetPid(app as! AXUIElement, &pid)
            }
            return InputFocusObservation(foregroundPID: foreground, keyboardPID: nil, queryAvailable: false,
                                         queryError: nil, conversionError: nil, systemFlag: nil,
                                         accessibilityPID: pid > 0 ? pid : nil)
        }
        guard let query,let convert else{return InputFocusObservation(foregroundPID:foreground,keyboardPID:nil,queryAvailable:false,queryError:nil,conversionError:nil,systemFlag:nil)}
        var psn=ProcessSerialNumber(highLongOfPSN:0,lowLongOfPSN:0)
        var flag=DarwinBoolean(false)
        let error=query(&psn,&flag)
        guard error == 0 else{return InputFocusObservation(foregroundPID:foreground,keyboardPID:nil,queryAvailable:true,queryError:error,conversionError:nil,systemFlag:nil)}
        var pid:pid_t=0
        let conversion=convert(&psn,&pid)
        return InputFocusObservation(foregroundPID:foreground,keyboardPID:conversion == 0 && pid>0 ? pid:nil,queryAvailable:true,queryError:error,conversionError:conversion,systemFlag:flag.boolValue)
    }
}

