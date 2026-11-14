import {appendFileSync, readFileSync} from 'node:fs';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {Bridge} from '../../src/bridge.mjs';
import {createServer} from '../../src/server.mjs';
import {BenchPolicyError, createGuiValidator} from './guard.mjs';

const windowMethods = new Set(['snapshot', 'screenshot', 'ocr', 'click', 'drag', 'scroll', 'type_text', 'key', 'cursor', 'hover']);
const referenceMethods = new Set(['click', 'ax_action', 'select_text']);
const metadataMethods = new Set(['status', 'apps', 'windows', 'cursor_state', 'cursor_hide']);
const isolationErrors = new Set([
  'BACKGROUND_APP_ACTIVATED', 'BACKGROUND_WINDOW_REORDERED', 'BACKGROUND_KEYBOARD_FOCUS_CHANGED',
  'BACKGROUND_KEYBOARD_ROUTE_CHANGED', 'BACKGROUND_TYPING_ROUTE_CHANGED', 'BACKGROUND_ACCESSIBILITY_FOCUS_CHANGED'
]);

export function createScopedRequest(request, targets, reject = message => { throw new BenchPolicyError(message, true); },
  {allowForegroundHover = false, reportIsolation = () => {}} = {}) {
  const pids = new Set(targets.map(target => target.pid));
  const snapshots = new Set();
  return async (method, params = {}, options) => {
    const foregroundHover = allowForegroundHover && method === 'hover' && params.mode === 'foreground';
    if ((params.mode === 'foreground' && !foregroundHover) || (method === 'hover' && !foregroundHover) ||
        (params.pid !== undefined && !pids.has(params.pid))) {
      return reject('Only the owned benchmark processes are in scope.');
    }
    if (method === 'key') {
      const chords = String(params.key).toLowerCase().split('+').map(part => part.trim());
      if (chords.some(part => ['cmd', 'command', 'super', 'meta'].includes(part)) && ['c','x','v'].includes(chords.at(-1))) {
        return reject('Clipboard keyboard shortcuts are disabled for benchmark trials.');
      }
    }
    const allowed = metadataMethods.has(method) ||
      (windowMethods.has(method) && pids.has(params.pid) && Number.isSafeInteger(params.windowId)) ||
      (referenceMethods.has(method) && snapshots.has(params.snapshotId));
    if (!allowed) return reject(`Native method ${method} has no authorized benchmark target.`);
    let result;
    try { result = await request(method, params, options); }
    catch (error) {
      if (isolationErrors.has(error?.code)) reportIsolation({code:error.code,method});
      throw error;
    }
    if (method === 'apps' || method === 'windows') {
      return {[method]: result[method].filter(item => pids.has(item.pid))};
    }
    if (method === 'snapshot') snapshots.add(result.snapshotId);
    return result;
  };
}

if (process.argv[2] === '--check') {
  const bridge = new Bridge({timeoutMs: 10000});
  try {
    const status = await bridge.request('status');
    const {windows} = await bridge.request('windows');
    const {apps} = await bridge.request('apps');
    console.log(JSON.stringify({permissions: status.permissions, displays: status.displays, background: status.background, windows, apps}));
  } finally { bridge.close(); await bridge.retiring; }
} else if (process.argv[2] === '--serve') {
  const scope = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const audit = (code, message) => appendFileSync(scope.audit, JSON.stringify({code,message})+'\n', {mode: 0o600});
  const bridge = new Bridge();
  bridge.request = createScopedRequest(bridge.request.bind(bridge), scope.targets, message => {
    audit('BENCH_GUI_ONLY', message);
    throw new BenchPolicyError(message, true);
  }, {
    allowForegroundHover: scope.allowForegroundHover === true,
    reportIsolation: scope.isolationAudit ? event => {
      appendFileSync(scope.isolationAudit, JSON.stringify(event)+'\n', {mode:0o600});
    } : undefined
  });
  const validate = createGuiValidator();
  const {server, runtime} = createServer(bridge, {validateCode(code) {
    try { validate(code); }
    catch (error) { audit(error.code ?? 'BENCH_JS_SUBSET', error.message); throw error; }
  }});
  const shutdown = async () => { await runtime.close(); await server.close(); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void shutdown().finally(() => process.exit(0)));
  process.stdin.once('end', () => void shutdown());
  await server.connect(new StdioServerTransport());
}
