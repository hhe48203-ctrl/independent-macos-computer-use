// Re-record docs/assets/demo.gif from one real run of the js tool.
//
// Prerequisites, from this checkout:
//   npm ci --ignore-scripts
//   npm run build
//   npm run bench:v2 -- --prepare
// The terminal that launches this script, and the built helper, need
// Accessibility and Screen Recording. ffmpeg must be on PATH.
//
// The script copies the pinned Ledger Lantern Mail fixture, launches that
// Electron app, and drives it only through the js MCP tool (the same REPL
// client the benchmark uses). It reads the Accessibility tree and uses
// background AXPress to open "Freight invoice SVL-119" and then SVL-119.txt.
// screencapture -l records that window id only, at real time. A screen
// rectangle is not used, because another window can move in front of it.
// ffmpeg decimates frames for the GIF and does not change playback speed.
//
//   node scripts/record-readme-demo.mjs
//
// Output: docs/assets/demo.gif and docs/assets/demo.mp4
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync, existsSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectRepl} from './repl-client.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pin = path.join(root, '.research/cdb-pinned-22a67eacd15dc71811e330ed88951dd615bb395d/taskpack/tasks/shared/cdb-s03');
const appDir = path.join(pin, 'apps/ledger-lantern-mail');
const electron = path.join(appDir, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const outDir = path.join(root, 'docs/assets');
const gifPath = path.join(outDir, 'demo.gif');
const mp4Path = path.join(outDir, 'demo.mp4');
const subject = 'Freight invoice SVL-119';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${(result.stderr || result.stdout || '').slice(-500)}`);
  }
  return result.stdout || '';
}

function frontmost() {
  return run('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true']).trim();
}

function activate(name) {
  spawnSync('osascript', ['-e', `tell application "System Events" to set frontmost of process ${JSON.stringify(name)} to true`]);
}

async function js(session, code) {
  const result = await session.client.callTool({name: 'js', arguments: {code, title: 'readme-demo'}});
  const text = result.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
  if (result.isError) throw new Error(text.slice(0, 1500));
  const marked = result.content.find((block) => block.type === 'text' && block.text.startsWith('RESULT '));
  if (!marked) throw new Error(`js call returned no result: ${text.slice(0, 500)}`);
  return JSON.parse(marked.text.slice(7));
}

function clickCode(predicate, label) {
  // The REPL parses a leading "{" as an object, so each call is an async expression.
  // const stays inside the function and does not collide with the next js call.
  return `await (async () => {
  const tree = await app.getAXState({emit:false, disableDiffing:true, maxNodes:900});
  const line = tree.split('\\n').find(${predicate});
  if (!line) throw Error(${JSON.stringify(label + ' was not in the latest Accessibility tree')});
  const index = Number(line.match(/\\[(\\d+)\\]/)[1]);
  const result = await app.click(index, {strategy:'ax'});
  nodeRepl.write('RESULT ' + JSON.stringify({index, method: result.method, mode: result.mode, ok: result.ok}));
})()`;
}

function compileHitTester(directory) {
  const source = path.join(directory, 'top-window.swift');
  const binary = path.join(directory, 'top-window');
  writeFileSync(source, `import CoreGraphics
import Foundation
let x = Double(CommandLine.arguments[1])!
let y = Double(CommandLine.arguments[2])!
let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
for window in info {
  let layer = window[kCGWindowLayer as String] as? Int ?? 0
  if layer != 0 { continue }
  guard let bounds = window[kCGWindowBounds as String] as? NSDictionary,
        let rect = CGRect(dictionaryRepresentation: bounds),
        rect.contains(CGPoint(x: x, y: y)) else { continue }
  let pid = window[kCGWindowOwnerPID as String] as? Int ?? 0
  print(pid)
  exit(0)
}
print(0)
`);
  run('xcrun', ['swiftc', '-O', source, '-o', binary]);
  return binary;
}

function windowCrop(movie) {
  const detected = spawnSync(ffmpeg, ['-hide_banner', '-i', movie, '-vf', 'cropdetect=24:2:0', '-f', 'null', '-'], {encoding: 'utf8'});
  const crops = [...`${detected.stderr}`.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)].map((match) => match[1]);
  const crop = crops.at(-1);
  const [width, height] = (crop || '').split(':').map(Number);
  if (!crop || width < 800 || height < 500) throw new Error(`Window capture crop ${crop || 'missing'} is not the fixture window`);
  return crop;
}

function topPid(binary, x, y) {
  return Number(run(binary, [String(Math.round(x)), String(Math.round(y))]).trim());
}

const previousFront = frontmost();
if (!existsSync(electron)) {
  throw new Error('Pinned Ledger Lantern Mail is missing. Run npm run bench:v2 -- --prepare first.');
}
const ffmpeg = run('which', ['ffmpeg']).trim();
const workspace = mkdtempSync(path.join(tmpdir(), 'ledger-mail-demo-'));
const scratch = mkdtempSync(path.join(tmpdir(), 'ledger-mail-record-'));
cpSync(path.join(pin, 'fixture/mail'), path.join(workspace, 'mail'), {recursive: true});
const child = spawn(electron, ['.', `--workspace=${workspace}`, '--disable-backgrounding-occluded-windows'], {
  cwd: appDir,
  env: {...process.env, ELECTRON_RUN_AS_NODE: undefined},
  stdio: 'ignore',
});
let session;
const stopChild = () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } };

try {
  session = await connectRepl({...process.env});
  let win;
  let previousFrame = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    const windows = await js(session, `nodeRepl.write('RESULT '+JSON.stringify(await cua.listWindows({emit:false}))); undefined`);
    win = windows.find((item) => item.title === 'Ledger Lantern Mail' && item.pid === child.pid);
    const frameKey = JSON.stringify(win?.frame);
    if (win?.frame?.width === 1180 && frameKey === previousFrame) break;
    previousFrame = frameKey;
    await sleep(200);
  }
  if (!win || win.frame.width !== 1180) throw new Error('Ledger Lantern Mail did not settle on its fixture window');
  const status = await js(session, `nodeRepl.write('RESULT '+JSON.stringify(await cua.status({emit:false}))); undefined`);
  const display = status.displays[0].frame;
  const frame = win.frame;
  const inside = frame.x >= 0 && frame.y >= 32 && frame.x + frame.width <= display.x + display.width && frame.y + frame.height <= display.y + display.height;
  if (!inside) throw new Error(`Fixture window ${JSON.stringify(frame)} is not fully inside the display below the menu bar. No capture was started.`);

  const hit = compileHitTester(scratch);
  const points = [
    [frame.x + frame.width / 2, frame.y + frame.height / 2],
    [frame.x + 12, frame.y + 12],
    [frame.x + frame.width - 12, frame.y + 12],
    [frame.x + 12, frame.y + frame.height - 12],
    [frame.x + frame.width - 12, frame.y + frame.height - 12],
  ];
  for (const [x, y] of points) {
    const pid = topPid(hit, x, y);
    if (pid !== child.pid) throw new Error('Another window covers the fixture. No capture was started.');
  }

  const ready = await js(session, `
var app = await cua.getApp({pid:${win.pid}, windowId:${win.windowId}}, {emit:false});
await (async () => {
  const tree = await app.getAXState({emit:false, disableDiffing:true, maxNodes:900});
  const found = tree.split('\\n').some(item => item.includes('"role":"AXCheckBox"') && item.includes(${JSON.stringify(subject)}));
  nodeRepl.write('RESULT ' + JSON.stringify({ready: found}));
})()`);
  if (!ready.ready) throw new Error('The freight invoice row was not visible in the Accessibility tree');

  const movie = path.join(scratch, 'capture.mov');
  // -l records the window's own pixels. A screen rectangle (-R) would include
  // whatever later moves in front of that region.
  const captureStarted = Date.now();
  const capture = spawn('/usr/sbin/screencapture', ['-x', '-v', '-V', '13', '-l', String(win.windowId), movie], {stdio: 'ignore'});
  const captureDone = new Promise((resolve, reject) => {
    capture.once('error', reject);
    capture.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`screencapture exited ${code}`))));
  });
  await sleep(800);

  const marks = [];
  const mark = (name) => marks.push({name, ms: Date.now()});
  mark('inbox');
  await sleep(1600);
  mark('open-mail');
  const opened = await js(session, clickCode(
    `item => item.includes('"role":"AXCheckBox"') && item.includes(${JSON.stringify(subject)})`,
    subject,
  ));
  if (opened.method !== 'AXPress' || opened.mode !== 'background') {
    throw new Error(`Mail row click was ${opened.mode} ${opened.method}, not background AXPress`);
  }
  const shown = await js(session, `await (async () => {
  const tree = await app.getAXState({emit:false, disableDiffing:true, maxNodes:900});
  const heading = tree.split('\\n').some(item => item.includes('"role":"AXHeading"') && item.includes(${JSON.stringify(subject)}));
  nodeRepl.write('RESULT ' + JSON.stringify({heading}));
})()`);
  if (!shown.heading) throw new Error('The freight invoice did not open. The recording will not be published.');
  mark('mail-open');
  await sleep(2200);
  mark('open-attachment');
  const attachment = await js(session, clickCode(
    `item => item.includes('"role":"AXButton"') && item.includes('Open read-only attachment SVL-119.txt')`,
    'SVL-119.txt attachment',
  ));
  if (attachment.method !== 'AXPress' || attachment.mode !== 'background') {
    throw new Error(`Attachment click was ${attachment.mode} ${attachment.method}, not background AXPress`);
  }
  const dialog = await js(session, `await (async () => {
  const tree = await app.getAXState({emit:false, disableDiffing:true, maxNodes:900});
  const open = tree.split('\\n').some(item => item.includes('AXApplicationDialog') && item.includes('SVL-119.txt'));
  nodeRepl.write('RESULT ' + JSON.stringify({open}));
})()`);
  if (!dialog.open) throw new Error('The attachment dialog did not open. The recording will not be published.');
  mark('dialog');
  await sleep(4200);
  mark('end');
  await captureDone;

  const info = spawnSync(ffmpeg, ['-hide_banner', '-i', movie], {encoding: 'utf8'});
  const duration = Number((`${info.stderr}`.match(/Duration: (\d+):(\d+):(\d+\.\d+)/) || []).slice(1).reduce((seconds, part, index) => seconds + Number(part) * [3600, 60, 1][index], 0).toFixed(3));
  if (!(duration >= 8 && duration <= 15)) throw new Error(`Capture duration ${duration}s is outside 8–15s. The GIF was not written.`);
  console.log(JSON.stringify({frame, windowId: win.windowId, opened, attachment, duration, marks}, null, 2));

  const crop = windowCrop(movie);
  const palette = path.join(scratch, 'palette.png');
  const gifFilter = `crop=${crop},fps=12,scale=960:-1:flags=lanczos`;
  run(ffmpeg, ['-y', '-i', movie, '-vf', `${gifFilter},palettegen=stats_mode=diff`, palette]);
  run(ffmpeg, ['-y', '-i', movie, '-i', palette, '-lavfi', `${gifFilter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=2:diff_mode=rectangle`, gifPath]);
  run(ffmpeg, ['-y', '-i', movie, '-an', '-vf', `crop=${crop},scale=960:-2:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4Path]);

  const gif = statSync(gifPath);
  if (gif.size > 3 * 1024 * 1024) throw new Error(`GIF is ${gif.size} bytes, above 3 MB. docs/assets/demo.gif was left in place for inspection and was not a sped-up encode.`);
  const at = (name, pad) => ((marks.find((item) => item.name === name).ms - captureStarted) / 1000 + pad).toFixed(2);
  const inboxAt = at('inbox', 0.4);
  const dialogAt = at('dialog', 0.6);
  run(ffmpeg, ['-y', '-ss', '0.6', '-i', movie, '-frames:v', '1', '-vf', `crop=${crop}`, path.join(scratch, 'frame-inbox.png')]);
  run(ffmpeg, ['-y', '-ss', inboxAt, '-i', movie, '-frames:v', '1', '-vf', `crop=${crop}`, path.join(scratch, 'frame-message.png')]);
  run(ffmpeg, ['-y', '-ss', dialogAt, '-i', movie, '-frames:v', '1', '-vf', `crop=${crop}`, path.join(scratch, 'frame-dialog.png')]);
  console.log(`Wrote ${gifPath} (${gif.size} bytes, crop ${crop}) and ${mp4Path}`);
  console.log(`Frames in ${scratch}`);
} finally {
  if (session) await Promise.race([session.client.close().catch(() => {}), sleep(1500)]);
  stopChild();
  await sleep(400);
  rmSync(workspace, {recursive: true, force: true});
  if (previousFront) activate(previousFront);
}
