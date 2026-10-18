import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ''}` };
const args = ['mcp', 'add', 'macos_computer_use', '--local', '--cwd', root, '--exposure', 'direct', '--description', 'Independent macOS desktop AX, screenshots, OCR and input', '--', process.execPath, fileURLToPath(new URL('../src/server.mjs', import.meta.url))];
const r = spawnSync(process.env.PI_COMMAND ?? 'pi', args, { cwd: root, env, stdio: 'inherit' });
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
