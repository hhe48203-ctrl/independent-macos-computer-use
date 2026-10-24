import {piServerEnvironment} from './pi-policy.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
const configuration=path.join(root,'.pi/mcp.json');
const previous=existsSync(configuration)?JSON.parse(readFileSync(configuration,'utf8'))?.mcpServers?.macos_computer_use:undefined;
const serverEnv=piServerEnvironment(previous?.env,process.argv.slice(2));
const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ''}` };
const args = ['mcp', 'add', 'macos_computer_use', '--local', '--cwd', root, '--exposure', 'direct', '--description', 'Independent macOS desktop AX, screenshots, OCR and input', '--', process.execPath, fileURLToPath(new URL('../src/server.mjs', import.meta.url))];
const r = spawnSync(process.env.PI_COMMAND ?? 'pi', args, { cwd: root, env, stdio: 'inherit' });
if (r.error) throw r.error;
if(r.status===0){const next=JSON.parse(readFileSync(configuration,'utf8'));next.mcpServers.macos_computer_use.env=serverEnv;writeFileSync(configuration,JSON.stringify(next,null,2)+'\n')}
if(r.status===0)console.log(serverEnv.CU_EXPERIMENTAL_APPKIT_FOCUS==='1'?'Experimental app-local activation enabled explicitly; it can activate a background text input context.':'App-local activation disabled; real event strategies remain available without it.');
process.exitCode = r.status ?? 1;
