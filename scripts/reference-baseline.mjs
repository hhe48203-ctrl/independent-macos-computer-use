// Read-only installed-reference inventory. Never imports the original runtime,
// connects to its socket or reads user configuration/credentials.
import {createReadStream} from 'node:fs';
import {readFile,stat,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing ${name} value`);return args[i+1]};
const app=path.resolve(option('--app','/Applications/ChatGPT.app'));
const output=option('--output',null),previous=option('--previous',path.join(root,'docs/original-baseline.json'));
async function digest(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex')}
async function record(file){try{const s=await stat(file);if(!s.isFile())return {path:file,status:'not-a-file'};const sha256=await digest(file),after=await stat(file);if(s.size!==after.size||s.mtimeMs!==after.mtimeMs)throw Error(`Installed file changed during inventory: ${file}`);return {path:file,bytes:s.size,sha256}}catch(e){if(e.code==='ENOENT')return {path:file,status:'missing'};throw e}}
function plist(file,key){const r=spawnSync('/usr/libexec/PlistBuddy',['-c',`Print :${key}`,file],{encoding:'utf8'});if(r.status!==0)throw Error(`Cannot read installed app ${key}`);return r.stdout.trim()}
const oai=path.join(app,'Contents/Resources/cua_node/lib/node_modules/@oai');
const packages={};const files={};
const selected=[['asar','Contents/Resources/app.asar'],['appExecutable','Contents/MacOS/ChatGPT']];
for(const [id,p] of selected)files[id]=await record(path.join(app,p));
for(const name of ['cua-repl','cua','sky','browser-desktop']){
 const directory=path.join(oai,name),manifest=path.join(directory,'package.json');
 try{const p=JSON.parse(await readFile(manifest,'utf8'));const inventory=[];
 async function walk(at){for(const e of (await readdir(at,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){if(e.name==='node_modules')continue;const f=path.join(at,e.name);if(e.isDirectory())await walk(f);else if(e.isFile()&&(/\.(m?js|json|md|ts)$/.test(e.name))){const s=await record(f);inventory.push({relative:path.relative(directory,f),bytes:s.bytes,sha256:s.sha256})}}}
 await walk(directory);packages['@oai/'+name]={version:p.version,path:directory,manifestSHA256:await digest(manifest),inventory,inventorySHA256:createHash('sha256').update(JSON.stringify(inventory)).digest('hex')};
 }catch(e){if(e.code!=='ENOENT')throw e;packages['@oai/'+name]={status:'missing',path:directory}}
}
const sky=path.join(oai,'sky'),cua=path.join(oai,'cua');
for(const [id,p] of Object.entries({nativePipe:'dist/project/cua/sky_js/src/targets/mac/native-pipe.js',macClient:'dist/project/cua/sky_js/src/targets/mac/client.js',serviceJs:'dist/project/cua/sky_js/src/service.js',skyApi:'dist/project/cua/sky_js/src/sky.js'}))files[id]=await record(path.join(sky,p));
files.replLauncher=await record(path.join(oai,'cua-repl/dist/lib/js/oai_js_cua_repl/src/launch.js'));
files.macAppBinding=await record(path.join(cua,'dist/lib/js/oai_js_cua/src/tinysky_alt/bind_mac_app.js'));
files.facadeTypes=await record(path.join(cua,'dist/lib/js/oai_js_cua/src/tinysky_alt/types.d.ts'));
files.nativeService=await record(path.join(os.homedir(),'.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'));
files.bundledNativeService=await record(path.join(sky,'Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'));
let old;try{old=JSON.parse(await readFile(previous,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
const changes={};for(const [id,r] of Object.entries(files)){const prior=old?.files?.[id]??old?.artifacts?.[id];changes[id]={status:r.status==='missing'?'missing':!prior?'not-recorded':prior.sha256===r.sha256?'unchanged':'changed',previousSHA256:prior?.sha256??null,currentSHA256:r.sha256??null}}
const packageChanges={};for(const [name,r] of Object.entries(packages)){const p=old?.packages?.[name];const before=typeof p==='string'?p:p?.version;packageChanges[name]={previous:before??null,current:r.version??null,versionChanged:before===undefined?null:before!==r.version,inventoryChanged:typeof p==='object'?p.inventorySHA256!==r.inventorySHA256:null}}
const info=path.join(app,'Contents/Info.plist');const result={schemaVersion:1,observedAt:new Date().toISOString(),app:{path:app,bundleId:plist(info,'CFBundleIdentifier'),version:plist(info,'CFBundleShortVersionString'),build:plist(info,'CFBundleVersion')},packages,files,comparison:{previousPath:old?previous:null,previousAppVersion:old?.app?.version??old?.appVersion??null,packageChanges,files:changes},limits:['File identity and static inventory are not behavioral equivalence.','New fields without a historical digest are not classified as changed.','No original module was executed; no service socket or credential was accessed.']};
if(output){await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({output,app:result.app,packages:packageChanges,files:changes,installedServiceMatchesBundled:files.nativeService.sha256===files.bundledNativeService.sha256},null,2));
if(args.includes('--check')&&(!old||result.app.version!==(old.app?.version??old.appVersion)||Object.values(changes).some(x=>['changed','missing'].includes(x.status))||Object.values(packageChanges).some(x=>x.versionChanged===true||x.inventoryChanged===true)))process.exitCode=1;
