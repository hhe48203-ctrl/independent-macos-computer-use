import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync,realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parse as parseYaml } from 'yaml';
const root = fileURLToPath(new URL('../', import.meta.url));
const identity = JSON.parse(readFileSync(path.join(root, 'plugin.json')));
if (identity.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') throw new Error('Invalid plugin manifest schema');
if (identity.extensions['com.openai'].interface.shortDescription.length > 30) throw new Error('Plugin subtitle exceeds 30 characters');
const mcp = JSON.parse(readFileSync(path.join(root, 'mcp.json')));
if (mcp.$schema !== 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json') throw new Error('Invalid MCP manifest schema');
const frontmatter = readFileSync(path.join(root, 'skills/computer-use/SKILL.md'), 'utf8').split('---', 3)[1];
const skill = parseYaml(frontmatter);
if (skill.name !== 'computer-use' || !skill.description) throw new Error('Invalid skill frontmatter');
const name = `${identity.name}-${identity.version}`;
const dist = path.join(root, 'dist');
const staging = path.join(dist, 'plugin');
const destination = path.join(staging, identity.name);
const running=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
const canonical=p=>{try{return realpathSync(p)}catch{return path.resolve(p)}};
if(running.status!==0||running.stdout.split('\n').some(line=>canonical(line.trim().replace(/^\d+\s+/,'')).startsWith(canonical(staging)+'/')))throw Error('A staged plugin executable may be running; no staging files were replaced. Close that client before packaging.');
rmSync(staging, { recursive: true, force: true }); mkdirSync(path.join(destination, 'src'), { recursive: true });
for (const file of ['plugin.json', 'mcp.json', 'LICENSE', 'skills', 'docs', 'examples']) cpSync(path.join(root, file), path.join(destination, file), { recursive: true });
const helper = path.join(root, '.build/Local Computer Use.app');
if (!existsSync(helper)) throw new Error('Run npm run build before packaging');
cpSync(helper, path.join(destination, '.build/Local Computer Use.app'), { recursive: true });
writeFileSync(path.join(destination, 'package.json'), JSON.stringify({ name: identity.name, version: identity.version, type: 'module', engines: { node: '>=22' }, license: 'MIT' }, null, 2));
const bundled = await build({ entryPoints: {server:path.join(root,'src/server.mjs'),'repl-worker':path.join(root,'src/repl-worker.mjs')}, bundle: true, platform: 'node', target: 'node22', format: 'esm', outdir:path.join(destination,'src'),outExtension:{'.js':'.mjs'}, metafile: true, banner: { js: "import { createRequire as _cuCreateRequire } from 'node:module'; const require = _cuCreateRequire(import.meta.url);" } });
// Preserve licenses of every npm package whose files enter the bundle.
const packages = new Map();
for (const input of Object.keys(bundled.metafile.inputs)) {
  let directory = path.dirname(path.resolve(root, input));
  while (directory.startsWith(path.join(root, 'node_modules'))) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest)) {
      const p = JSON.parse(readFileSync(manifest));
      if (p.name && p.version) { packages.set(`${p.name}@${p.version}`, { p, directory }); break; }
    }
    directory = path.dirname(directory);
  }
}
let notices = 'Third-party code bundled in src/server.mjs. Original package licenses follow.\n';
for (const [key, { p, directory }] of [...packages].sort()) {
  const candidates = readdirSync(directory).filter(f => /^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(f));
  if (!candidates.length) throw new Error(`No license found for bundled dependency ${key}`);
  notices += `\n\n========== ${key} (${p.license ?? 'see below'}) ==========\n`;
  for (const f of candidates) notices += `\n${f}\n${readFileSync(path.join(directory, f), 'utf8')}\n`;
}
writeFileSync(path.join(destination, 'THIRD_PARTY_NOTICES.txt'), notices);
writeFileSync(path.join(destination, 'BUILD.json'), JSON.stringify({ version: identity.version, architecture: process.arch, minimumMacOS: '14.4', minimumNode: '22', nativeSigning: 'ad-hoc', backend: 'independent-macos-apis', backgroundDefault:true, backgroundPointerSPI:'CGEventSetWindowLocation', realTextStrategy:'event; per-packet exact UTF-16 acknowledgement', experimentalAppKitFocus:{default:false,environment:'CU_EXPERIMENTAL_APPKIT_FOCUS=1',verifiedOS:'macOS 26.6.2 arm64',scope:'v1.1 covered first-party AppKit document/table and WebKit scroll fixtures. Human IME comparison is v1.0 only; no new long-hold human acceptance. Historical stock-app tests are v0.3. Not universal compatibility.'}, helperSHA256:createHash('sha256').update(readFileSync(path.join(helper,'Contents/MacOS/computer-use-bridge'))).digest('hex'), dependencyCount: packages.size }, null, 2));
writeFileSync(path.join(destination,'README.md'), readFileSync(path.join(root,'README.md'),'utf8').replace('npm ci --ignore-scripts\nnpm run build','# Prebuilt package: no npm install or compiler required.'));
const signed = spawnSync('/usr/bin/codesign', ['--verify', '--deep', helper], { encoding: 'utf8' });
if (signed.status !== 0) throw new Error(signed.stderr);
function run(cmd, args, cwd = root) { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || `${cmd} failed`); }
const pluginZip = path.join(dist, `${name}-${process.arch}-plugin.zip`);
rmSync(pluginZip, { force: true }); run('/usr/bin/zip', ['-qr', pluginZip, identity.name], staging);
// Verify the actual ZIP from outside the checkout, so dynamic require cannot
// accidentally find this project's node_modules in an ancestor directory.
const smokeDirectory = mkdtempSync('/tmp/cu-plugin-smoke-');
const client = new Client({ name: 'packaged-plugin-smoke', version: '1.0.0' });
try {
  run('/usr/bin/unzip', ['-q', pluginZip, '-d', smokeDirectory]);
  const smokeRoot = path.join(smokeDirectory, identity.name);
  run('/usr/bin/codesign', ['--verify', '--deep', path.join(smokeRoot, '.build/Local Computer Use.app')]);
  const smokeEnv = { ...process.env }; delete smokeEnv.NODE_PATH; delete smokeEnv.CU_ENABLE_FOREGROUND;
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(smokeRoot, 'src/server.mjs')], cwd: smokeDirectory, env: smokeEnv }));
  const list = await client.listTools(); if (list.tools.map(t=>t.name).join(',') !== 'js,js_reset') throw new Error('Wrong packaged tools');
  const result = await client.callTool({ name: 'js', arguments: {code:'await cua.status(); undefined'} });
  const status=JSON.parse(result.content.find(c=>c.type==='text'&&c.text.startsWith('{')).text);
  if (result.isError || status.backend !== 'independent-macos-apis' || status.bridgeVersion !== identity.version || !status.background?.default || status.foregroundEnabled !== false) throw new Error('Packaged native helper failed');
  const lexical=await client.callTool({name:'js',arguments:{code:'let kept = await Promise.resolve(41); kept'}});if(lexical.isError)throw Error('Packaged worker failed');
  const persisted=await client.callTool({name:'js',arguments:{code:'kept+1'}});if(persisted.content[0].text!=='42')throw Error('Packaged lexical persistence failed');
  const launch=await client.callTool({name:'js',arguments:{code:'await cua.launchApp("io.local.computeruse.uninstalled-policy-test")'}});if(!launch.isError||launch.structuredContent?.error?.code!=='VISIBLE_LAUNCH_REQUIRED')throw Error('Packaged visible-launch policy failed');
  await client.callTool({name:'js_reset',arguments:{}});
} finally { await client.close(); rmSync(smokeDirectory, { recursive: true, force: true }); }
// Source archive is assembled from explicit first-party paths only.
const sourceStage = path.join(dist, 'source'); rmSync(sourceStage, { recursive: true, force: true });
const sourceRoot = path.join(sourceStage, identity.name); mkdirSync(sourceRoot, { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'plugin.json', 'mcp.json', 'README.md', 'LICENSE', '.gitignore', 'src', 'native', 'scripts', 'tests', 'docs', 'examples', 'skills']) cpSync(path.join(root, file), path.join(sourceRoot, file), { recursive: true });
const sourceTar = path.join(dist, `${name}-source.tar.gz`);
run('/usr/bin/tar', ['-czf', sourceTar, '-C', sourceStage, identity.name]);
const artifactManifest = [pluginZip, sourceTar].map(file => ({ file: path.basename(file), bytes: readFileSync(file).length, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }));
writeFileSync(path.join(dist, 'checksums.json'), JSON.stringify(artifactManifest, null, 2));
console.log(JSON.stringify({ artifacts: artifactManifest, packagedToolCount: 2, prebuiltArchitecture: process.arch, bundledDependencies: [...packages.keys()] }, null, 2));
