import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync,realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'darwin') throw new Error('Requires macOS 14 or newer and Xcode Command Line Tools.');
const app = path.resolve(root, process.env.CU_BUILD_DIRECTORY ?? '.build', 'Local Computer Use.app');
const outputExecutable=path.join(app,'Contents/MacOS/computer-use-bridge');
const inventory=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
if(inventory.status!==0)throw Error('Could not check whether the build output is in use; no files were changed.');
const canonical=p=>{try{return realpathSync(p)}catch{return path.resolve(p)}};
if(inventory.stdout.split('\n').some(line=>canonical(line.trim().replace(/^\d+\s+/,''))===canonical(outputExecutable)))throw Error('Native helper at this build output is running. Close its MCP client or choose a separate CU_BUILD_DIRECTORY before rebuilding. No files were changed.');
mkdirSync(path.join(app, 'Contents/MacOS'), { recursive: true });
writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.local.computeruse.bridge</string>
<key>CFBundleName</key><string>Local Computer Use</string>
<key>CFBundleExecutable</key><string>computer-use-bridge</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>0.3.0</string>
<key>LSMinimumSystemVersion</key><string>14.4</string>
<key>LSUIElement</key><true/>
<key>NSScreenCaptureUsageDescription</key><string>Capture windows requested by your local AI agent.</string>
</dict></plist>`);
function run(command, args) {
  const r = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run('xcrun', ['swiftc', '-swift-version', '5', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.4`, '-O', '-framework', 'AppKit', '-framework', 'ApplicationServices', '-framework', 'ScreenCaptureKit', '-framework', 'Vision', path.join(root, 'native/FocusObservation.swift'), path.join(root,'native/PointerDelivery.swift'), path.join(root,'native/UnicodePackets.swift'), path.join(root,'native/ScopedAppKitFocus.swift'), path.join(root, 'native/Background.swift'), path.join(root, 'native/main.swift'), '-o', path.join(app, 'Contents/MacOS/computer-use-bridge')]);
run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
console.error(`Built ${app}`);
