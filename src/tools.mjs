import { z } from 'zod';

const pid = z.number().int().positive();
const windowId = z.number().int().positive();
const target = { pid, windowId };
const inputMode = { mode: z.enum(['background', 'foreground']).default('background') };
const coordinate = z.number().finite().nonnegative();
const snapshotId = z.string().uuid();
const elementId = z.string().regex(/^e\d+$/);
const imageOptions = {
  maxDimension: z.number().int().min(320).max(4096).default(1600),
  showCursor: z.boolean().default(false)
};
const captureTarget = { pid: pid.optional(), windowId: windowId.optional(), displayId: z.number().int().positive().optional() };
const obj = fields => z.object(fields).strict();

export const tools = [
  { name: 'cu_status', method: 'status', readOnly: true, schema: obj({}), description: 'Check independent native backend, TCC Accessibility/Screen Recording permissions, display geometry and local policy. Does not prompt. Start here.' },
  { name: 'cu_request_permissions', method: 'request_permissions', schema: obj({ accessibility: z.boolean().default(false), screenRecording: z.boolean().default(false) }), description: 'Request normal macOS TCC prompts. Call only when the user asks to set up permissions. The user must grant access in System Settings; this cannot grant it automatically.' },
  { name: 'cu_apps', method: 'apps', readOnly: true, schema: obj({}), description: 'List running GUI apps with bundleId and pid. Honors optional CU_ALLOWED_BUNDLE_IDS.' },
  { name: 'cu_windows', method: 'windows', readOnly: true, schema: obj({ pid: pid.optional() }), description: 'List app windows, windowId, pid, title, visibility and global logical-point frames. Pair pid with windowId in later calls.' },
  { name: 'cu_launch', method: 'launch', schema: obj({ bundleId: z.string().min(1).max(256), allowVisibleWindows:z.boolean().default(false), ...inputMode }), description: 'Return an existing single app instance without reopening it. New background launches require allowVisibleWindows:true: apps can raise startup windows even with activates=false, so use only when visible setup is acceptable. Multiple existing instances require choosing a PID with cu_apps/cu_windows. Explicit foreground mode also requires server foreground permission. Observe windows after launch; visible setup is separate from background-input isolation.' },
  { name: 'cu_focus', method: 'focus', schema: obj(target), description: 'Disabled by default; requires server environment CU_ENABLE_FOREGROUND=1. Raise and focus an exact visible app window. Verifies app and focused-window ownership before allowing input.' },
  { name: 'cu_snapshot', method: 'snapshot', readOnly: true, schema: obj({ ...target, screenshot: z.boolean().default(true), includeMenuBar: z.boolean().default(false), maxNodes: z.number().int().min(1).max(2000).default(500), maxDepth: z.number().int().min(1).max(30).default(16), ...imageOptions }), description: 'Observe a window: AX tree with snapshot-scoped element IDs, labels, values, bounds, actions, and optional PNG. Set includeMenuBar for app menu nodes (scope:menu); operate these with cu_ax_action, not coordinates. IDs expire after 120 seconds and 16 retained snapshots. Secure values omitted. Check truncated and screenshotError. Frames are window-relative logical points.' },
  { name: 'cu_screenshot', method: 'screenshot', readOnly: true, schema: obj({ ...captureTarget, ...imageOptions }).superRefine(validateCapture), description: 'Capture a specific window (pid+windowId) or display (displayId/default main) using ScreenCaptureKit. Returns PNG plus dimensions, frame and scale. Divide image pixel coordinates by scaleX/scaleY before window input. Display capture is disabled in app-allowlist mode.' },
  { name: 'cu_ocr', method: 'ocr', readOnly: true, schema: obj({ ...captureTarget, ...imageOptions }).superRefine(validateCapture), description: 'Recognize visible text using local Apple Vision OCR. Returns confidence and top-left logical-point rectangles. Useful for canvas/custom apps without AX labels.' },
  { name: 'cu_click', method: 'click', schema: obj({ pid: pid.optional(), windowId: windowId.optional(), x: coordinate.optional(), y: coordinate.optional(), snapshotId: snapshotId.optional(), elementId: elementId.optional(), button: z.enum(['left', 'right', 'middle']).default('left'), count: z.number().int().min(1).max(3).default(1), strategy:z.enum(['auto','ax','event']).default('auto'), ...inputMode }).superRefine((v, ctx) => {
    if (v.elementId !== undefined) {
      if (!v.snapshotId || v.pid !== undefined || v.windowId !== undefined || v.x !== undefined || v.y !== undefined) ctx.addIssue({ code: 'custom', message: 'Element click requires snapshotId+elementId only, without pid/windowId/x/y' });
    } else if (!v.pid || !v.windowId || v.x === undefined || v.y === undefined || v.snapshotId) ctx.addIssue({ code: 'custom', message: 'Coordinate click requires pid+windowId+x+y only' });
  }), description: 'Click an observed element OR window-relative logical point. Default background auto strategy uses AXPress when available, otherwise exact-window events without real pointer movement. The default route generates no activation notice; an explicitly enabled experimental server route may send scoped app-local focus notices. strategy:ax requires AXPress; strategy:event forces process/window events (app may ignore or reorder; verify). Event routing requires window-location OS SPI and an authorized source-filtered process tap; pointerDelivery confirms routing-flag removal, not UI success. No foreground fallback. Observe actual result. Explicit mode:foreground activates/moves input.' },
  { name: 'cu_type_text', method: 'type_text', schema: obj({ ...target, text: z.string().max(20000), snapshotId: snapshotId.optional(), elementId: elementId.optional(), strategy:z.enum(['auto','ax','event']).default('auto'), ...inputMode }).superRefine((v, ctx) => { if (!!v.snapshotId !== !!v.elementId) ctx.addIssue({ code:'custom',message:'Supply snapshotId and elementId together' }); if(v.mode==='foreground'&&v.elementId)ctx.addIssue({code:'custom',message:'Exact text element references are supported only in background mode; focus the field before foreground typing'}); if(v.mode==='foreground'&&v.strategy!=='auto')ctx.addIssue({code:'custom',message:'Text strategy selects a background mechanism only'}); }), description: 'Default background auto/ax inserts Unicode through AX and verifies exact text. strategy:event sends real Unicode keyboard events only to this process, with no AX mutations, global HID input or clipboard. It requires an already-focused text element and readable insertion range. The default route also needs an existing internal key window; the opt-in scoped AppKit route can prepare that window with app-local notices; exact readback is required after every bounded packet; newline controls are isolated. It never falls back to AX or foreground. Optional snapshotId+elementId observes an exact target; event strategy does not focus it. Frameworks may ignore or transform events; failures may be partial. Explicit foreground mode uses CGEvent typing.' },
  { name: 'cu_key', method: 'key', schema: obj({ ...target, key: z.string().min(1).max(100), strategy:z.enum(['auto','event']).default('auto'), ...inputMode }).superRefine((v,ctx)=>{if(v.mode==='foreground'&&v.strategy!=='auto')ctx.addIssue({code:'custom',message:'Key strategy selects a background mechanism only'})}), description: 'Send a key/chord (CMD+A, Enter, Tab, Escape, Left, F5). Default background auto uses verified AX selection for CMD+A when supported; strategy:event forces real key events without that AX replacement; other keys post only to the target process. Requires its internal key window to match. No global modifier key state changes. Default routing generates no activation notice; the opt-in scoped AppKit route emits local notices. App acceptance varies, so observe result. Explicit foreground mode activates target.' },
  { name: 'cu_scroll', method: 'scroll', schema: obj({ ...target, deltaX: z.number().int().min(-10000).max(10000).default(0), deltaY: z.number().int().min(-10000).max(10000).default(0), x: coordinate.optional(), y: coordinate.optional(), ...inputMode }), description: 'Scroll an exact window, including when occluded. Default background posts a window-routed event without mouse movement or activation. Pixel deltas: positive deltaY up, negative down; positive deltaX left. Coordinates are window-relative logical points. Explicit foreground mode permits activation.' },
  { name: 'cu_drag', method: 'drag', schema: obj({ ...target, fromX: coordinate, fromY: coordinate, toX: coordinate, toY: coordinate, duration: z.number().min(0.1).max(2).default(0.4), ...inputMode }), description: 'Default background drag posts a window-routed sequence, without moving the real pointer. The default route generates no activation notice; an opt-in scoped AppKit route emits local notices. Stops on window movement; attempts to release only its target button on cancellation. App support varies; observe result. Coordinates are window-relative points. Explicit foreground mode uses real pointer.' },
  { name: 'cu_ax_action', method: 'ax_action', schema: obj({ snapshotId, elementId, action: z.enum(['press', 'focus', 'setValue', 'showMenu', 'increment', 'decrement', 'confirm']), value: z.string().max(20000).optional(), ...inputMode }).superRefine((v, ctx) => {
    if ((v.action === 'setValue') !== (v.value !== undefined)) ctx.addIssue({ code: 'custom', message: 'value must be supplied only for setValue' });
  }), description: 'Semantic action on an observed AX element. Default background never raises/activates; focus means app-internal AX focus only. Global app menus are rejected in background mode. Apps can themselves react to actions by opening UI; verify state. Secure fields excluded. Explicit foreground mode permits activation.' },
  { name: 'cu_select_text', method: 'select_text', schema: obj({ snapshotId, elementId, text: z.string().min(1).max(20000), prefix: z.string().max(20000).optional(), suffix: z.string().max(20000).optional(), selection: z.enum(['text', 'cursor_before', 'cursor_after']).default('text'), ...inputMode }), description: 'Select exact text or place a cursor via UTF-16 AX range; prefix/suffix disambiguate. Default background only changes target internal selection, without activating. Follow with cu_type_text. Secure fields excluded. Explicit foreground mode permits activation.' },
  { name: 'cu_clipboard', method: 'clipboard', schema: obj({ text: z.string().max(100000).optional() }), description: 'Read clipboard text, or replace it when text is supplied. Disabled by default; requires CU_ENABLE_CLIPBOARD=1 and no app allowlist. Only use on user request.' }
];

function validateCapture(v, ctx) {
  if ((v.pid === undefined) !== (v.windowId === undefined) || (v.windowId !== undefined && v.displayId !== undefined)) ctx.addIssue({ code: 'custom', message: 'Supply pid+windowId together, OR displayId, never both' });
}

export function toMcpResult(result) {
  const { screenshot, ...rest } = result;
  const content = [];
  let structuredContent = rest;
  if (screenshot) {
    const { data, ...metadata } = screenshot;
    structuredContent = { ...rest, screenshot: metadata };
    content.push({ type: 'image', data, mimeType: screenshot.mimeType });
  }
  content.unshift({ type: 'text', text: JSON.stringify(structuredContent) });
  return { content, structuredContent };
}
