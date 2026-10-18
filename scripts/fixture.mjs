import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
export const fixtureBundleId = 'io.local.computeruse.fixture';
export async function startFixture() {
  const app = path.join(root, '.build/Computer Use Fixture.app');
  const statePath = path.join(root, `.build/fixture-state-${process.pid}.json`);
  const executable = path.join(app, 'Contents/MacOS/fixture');
  mkdirSync(path.dirname(executable), { recursive: true });
  writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${fixtureBundleId}</string><key>CFBundleName</key><string>Computer Use Fixture</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleVersion</key><string>1</string></dict></plist>`);
  for (const [cmd, args] of [
    ['xcrun', ['swiftc', '-swift-version', '5', '-O', '-framework', 'AppKit', path.join(root, 'native/Fixture.swift'), '-o', executable]],
    ['/usr/bin/codesign', ['--force', '--sign', '-', app]]
  ]) {
    const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status !== 0) throw new Error(r.stderr?.toString() || `${cmd} failed`);
  }
  const child = spawn(executable, [statePath], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', d => process.stderr.write(d));
  const state = () => JSON.parse(readFileSync(statePath, 'utf8'));
  for (let i = 0; i < 100; i++) {
    if (existsSync(statePath)) return { child, pid: child.pid, state, statePath, close() { child.kill('SIGTERM'); rmSync(statePath, { force: true }); } };
    if (child.exitCode !== null) throw new Error('Fixture exited before becoming ready');
    await new Promise(r => setTimeout(r, 50));
  }
  child.kill('SIGTERM'); throw new Error('Fixture startup timed out');
}
if (process.argv.includes('--open')) {
  const fixture = await startFixture();
  console.log(JSON.stringify({ pid: fixture.pid, statePath: fixture.statePath }));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => fixture.close());
}
