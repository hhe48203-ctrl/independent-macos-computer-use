# Cursor visibility

[中文版本](zh-CN/CURSOR_OCCLUSION.md)

The default `CU_AGENT_CURSOR_VISIBILITY=target` makes the independent cursor respect the target window's exposed area. It keeps the same continuous motion and waits for arrival before input. A covered target point hides the whole cursor; when the anchor is exposed but the drawing crosses an occluding edge, the entire glyph and shadow are clipped. Hidden motion, clicks, drags, scrolling and keyboard operations continue normally. Occlusion alone never cancels an action or resets its position.

Set `CU_AGENT_CURSOR_VISIBILITY=always` in the MCP server environment to keep the earlier top-level progress overlay. This setting is independent of `CU_AGENT_CURSOR_STYLE=ring|arrow`; invalid visibility values fall back to `target`. Restart/reconnect the client to apply environment changes. `CU_AGENT_CURSOR=0` still disables drawing entirely.

## Implementation

The helper reads the public [WindowServer window inventory](https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo(_:_:)) in front-to-back order. It subtracts all nonzero-alpha window bounds preceding the exact target PID/window, excluding only its own cursor panel. Windows from the target process can occlude it too. The remaining area intersects target and display bounds. A covered anchor produces an empty mask; an exposed anchor uses disjoint visible rectangles, rounded inward to backing pixels before clipping the production drawing, including arrow glow.

The normal visibility mode uses an ordinary-level, nonactivating panel. Only that panel is ordered when it becomes visible; the helper does not continuously bring it forward, order relative to another process, raise a target or change the target's level. The optional `always` panel retains the status-bar level. Both remain click-through and unable to become key/main. Geometry updates at about 60 Hz during motion and while idle, so moving a cover can hide/reveal a stationary cursor without a new action. Resize, target disappearance, reset and timeout retain the earlier cleanup rules.

`cua.cursorState()` adds:

| Field | Meaning |
| --- | --- |
| `visibilityMode` | effective `target` or `always` |
| `visibilityReason` | `visible`, `clipped`, `occluded-or-outside`, `target-unavailable`, `always` or `inactive` |
| `clipRects` | current drawing regions in global top-left logical points |
| `occluderCount` | upper windows intersecting the cursor footprint |
| `occlusionGeometry` | `conservative-window-bounds` |

Public window metadata does not expose arbitrary per-pixel transparency or every rounded window shape. Translucent windows and transparent corners conservatively hide their whole bounding rectangles. Geometry sampling is not an atomic compositor mask: changes between samples can take until the next update. New windows can also cover the ordinary-level panel directly. Other Spaces, lock screen and real multi-display behavior are outside this machine's acceptance; negative/display coordinate formulas are tested separately.

## Verification

Run `npm run build`, `npm test`, and `npm run test:cursor:occlusion`. The live test keeps disposable windows behind the foreground, checks real click/drag/scroll delivery while hidden, intermediate hidden motion, reset, unchanged foreground PID and target/cover ordering. Offscreen bitmap tests use the actual production `AgentCursorView` at 1× and 2×: both styles must draw exposed pixels, draw zero pixels beyond a clip edge, and draw nothing for an empty region. Geometry tests cover multiple occluders, clipped target/display edges, hidden anchors and negative coordinates. The historical `test:cursor` explicitly selects `always` to keep testing the earlier lifecycle behavior under full cover.

An early test setup brought disposable windows forward and briefly used a floating level to obtain screen crops. The participant reported windows coming forward and resisting coverage. That setup was removed, as was the new cross-process cursor-relative ordering experiment; these attempts are not a passing visible-screen comparison. A regression guard now forbids elevated fixture levels and front/key/activation calls in background fixture setup, and forbids cross-process relative ordering/AX Raise/activation in the cursor component. The final acceptance uses offscreen pixels plus real fully covered operations, without repeating the intrusive setup. No new human IME acceptance is claimed by this drawing change.
