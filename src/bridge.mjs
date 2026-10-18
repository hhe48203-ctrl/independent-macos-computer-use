import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

export const defaultBridgePath = fileURLToPath(new URL('../.build/Local Computer Use.app/Contents/MacOS/computer-use-bridge', import.meta.url));

export class NativeError extends Error {
  constructor(code, message) { super(message); this.name = 'NativeError'; this.code = code; }
}

/** One persistent helper owns AX references. Requests serialize across all tools. */
export class Bridge {
  constructor({ executable = defaultBridgePath, env = process.env, timeoutMs = 30000 } = {}) {
    this.executable = executable;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.queue = Promise.resolve();
    this.child = null;
    this.pending = null;
    this.closed = false;
    this.generation = 0;
    this.retiring = Promise.resolve();
  }
  start() {
    if (this.closed) throw new NativeError('BRIDGE_CLOSED', 'The bridge is closed');
    if (this.child) return;
    if (!existsSync(this.executable)) throw new NativeError('BUILD_REQUIRED', 'Native bridge missing. Run npm run build on macOS first.');
    const child = spawn(this.executable, [], { env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stderr.on('data', data => process.stderr.write(data));
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      if (this.child !== child) return;
      let response;
      try { response = JSON.parse(line); }
      catch { this.stop(new NativeError('INVALID_NATIVE_RESPONSE', 'Native bridge returned invalid JSON')); return; }
      const pending = this.pending;
      if (!pending || pending.id !== response.id) { this.stop(new NativeError('INVALID_NATIVE_RESPONSE', 'Native response ID mismatch')); return; }
      this.pending = null;
      clearTimeout(pending.timer);
      if (response.error) pending.reject(new NativeError(response.error.code, response.error.message));
      else if (response.result && typeof response.result === 'object') pending.resolve(response.result);
      else pending.reject(new NativeError('INVALID_NATIVE_RESPONSE', 'Native response has no result'));
    });
    child.on('error', error => { if (this.child === child) this.stop(new NativeError('BRIDGE_START_FAILED', error.message)); });
    child.on('exit', (code, signal) => {
      lines.close();
      if (this.child === child) this.stop(new NativeError('BRIDGE_EXITED', `Native bridge exited (${signal ?? code}); take a new snapshot. No action was retried.`));
    });
    child.stdin.on('error', error => { if (this.child === child) this.stop(new NativeError('BRIDGE_PIPE_FAILED', error.message)); });
  }
  stop(error = new NativeError('BRIDGE_STOPPED', 'Native bridge stopped; take a fresh snapshot')) {
    const child = this.child;
    if (child || this.pending) this.generation++;
    this.child = null;
    if (this.pending) {
      const pending = this.pending; this.pending = null;
      clearTimeout(pending.timer); pending.reject(error);
    }
    // SIGTERM lets our helper release any mouse button held during a drag.
    // A blocked OS call gets a bounded hard stop; no queued request is retried.
    if (child && child.exitCode === null) {
      this.retiring = new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 1000);
        timer.unref();
        child.once('close', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
      });
    }
  }
  request(method, params = {}, { signal } = {}) {
    const generation = this.generation;
    const run = async () => {
      await this.retiring;
      if (signal?.aborted) throw new NativeError('CANCELLED', 'Cancelled before execution');
      // Queued requests from an invalidated helper must never mutate a new session.
      if (generation !== this.generation) throw new NativeError('SESSION_CHANGED', 'Helper session changed; retry after observing fresh state');
      this.start();
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        const abort = () => this.stop(new NativeError('CANCELLED', 'Cancelled; native helper stopped. Action may have partially completed. Observe before retrying.'));
        const done = (fn, value) => { signal?.removeEventListener('abort', abort); fn(value); };
        const timer = setTimeout(() => this.stop(new NativeError('NATIVE_TIMEOUT', 'Native operation timed out; helper stopped. Action may have partially completed. Observe before retrying.')), this.timeoutMs);
        this.pending = { id, timer, resolve: value => done(resolve, value), reject: error => done(reject, error) };
        signal?.addEventListener('abort', abort, { once: true });
        this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
  close() { this.closed = true; this.stop(new NativeError('BRIDGE_CLOSED', 'Server closed')); }
}
