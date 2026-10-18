// Optional, read-only research runner. Raw proprietary analysis stays ignored.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, closeSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url));
const app = process.argv[2] ?? '/Applications/ChatGPT.app';
const resources = path.join(app, 'Contents/Resources');
const out = path.join(root, '.research/evidence');
mkdirSync(out, { recursive: true });
const oai = path.join(resources, 'cua_node/lib/node_modules/@oai');
const native = path.join(os.homedir(), '.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService');
const jobs = [
  ['sky-graph', 'analyze-javascript-application', path.join(oai, 'sky')],
  ['cua-repl-graph', 'analyze-javascript-application', path.join(oai, 'cua-repl')],
  ['service-macho', 'inspect-macho', native]
];
for (const [name, operation, target] of jobs) {
  if (!existsSync(target)) { console.error(`Missing target: ${target}`); process.exitCode = 1; continue; }
  // Never overwrite the original investigation record.
  const prefix = path.join(out, `${name}-${Date.now()}`);
  const stdout = openSync(prefix+'.json', 'wx'); const stderr = openSync(prefix+'.log', 'wx');
  console.error(`REA ${operation}: ${target}`);
  const r = spawnSync('npx', ['-y', 'rea-agents@6.5.0', operation, target, '--json'], { cwd: root, stdio: ['ignore', stdout, stderr], timeout: 180000 });
  closeSync(stdout); closeSync(stderr);
  if (r.error || r.status !== 0) { console.error(r.error?.message ?? `exit ${r.status}; inspect ${prefix}.json/.log`); process.exitCode = 1; continue; }
  const e = JSON.parse(readFileSync(prefix+'.json', 'utf8'));
  writeFileSync(prefix+'-identity.json', JSON.stringify({ evidenceId: e.evidence_id, subject: e.subject, operation: e.operation, authority: e.authority, limitations: e.limitations }, null, 2));
  console.error(`${name}: ${e.evidence_id ?? e.message}`);
}
