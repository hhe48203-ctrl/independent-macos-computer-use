import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {acquireFixtureLease} from './fixture-lease.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const release = args.includes('--run') ? acquireFixtureLease(path.join(root, '.build')) : () => {};
const child = spawn(process.env.CU_BENCH_PYTHON ?? 'python3', [path.join(root, 'scripts/bench-v2/run.py'), ...args], {
  cwd: root, detached: true, stdio: 'inherit', env: {
    HOME: process.env.HOME, USER: process.env.USER, PATH: process.env.PATH,
    CU_BENCH_NODE: process.execPath, PI_COMMAND: process.env.PI_COMMAND,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    PYTHONDONTWRITEBYTECODE: '1'
  }
});
const forward = signal => child.kill(signal);
const interrupt = () => forward('SIGINT');
const terminate = () => forward('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);
try {
  const {code, signal} = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  if (signal) console.error(`Benchmark supervisor exited on ${signal}; verify owned processes before removing the fixture lease.`);
  else release();
  process.exitCode = code ?? 1;
} catch (error) {
  release();
  throw error;
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
}
