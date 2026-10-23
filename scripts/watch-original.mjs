// Read-only watcher for the installed original and its public upstream release
// signals. It never imports the original runtime, opens its socket, or reads
// user credentials/configuration. Two independent modes:
//   --local     authoritative: hashes the installed app against docs/original-baseline.json
//   --upstream   portable: compares public release metadata (no app install required)
// With --issue it opens or updates a single deduplicated tracking issue via `gh`.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const watchFile=path.join(root,'ci/upstream-watch.json');
export const label='original-watch';
export const upstreamSignals=Object.freeze([
 {id:'chatgpt-cask',label:'Homebrew cask chatgpt (ChatGPT.app)',url:'https://formulae.brew.sh/api/cask/chatgpt.json'},
 {id:'codex-cli',label:'npm @openai/codex (Codex CLI)',url:'https://registry.npmjs.org/@openai/codex/latest'}
]);
export const titles={upstream:'[watch] Upstream Codex/ChatGPT release moved past the recorded baseline',local:'[watch] Installed ChatGPT.app drifted from the recorded baseline'};
// Pure comparison so the decision is testable without network or a desktop.
export function classifyDrift(recorded={},observed={}){
 const changes=[];
 for(const {id} of upstreamSignals){
  const previous=recorded[id]??null,current=observed[id]??null;
  if(current===null||current===undefined)continue;
  if(previous!==current)changes.push({signal:id,previous,current});
 }
 return {drifted:changes.length>0,changes};
}
export function ackRecord(observed,at=new Date().toISOString()){
 const checked={};
 for(const {id} of upstreamSignals)if(typeof observed[id]==='string')checked[id]=observed[id];
 return {schemaVersion:1,recordedAt:at,checked};
}
export function upstreamBody({changes,unreachable=[]}){
 const rows=changes.length?changes.map(c=>`| \`${c.signal}\` | ${c.previous??'not recorded'} | **${c.current}** |`).join('\n'):'| (none) | - | - |';
 return [
  'Automated read-only check of public upstream release metadata. No original module was executed and no app install was required.',
  '','| signal | recorded baseline | upstream now |','| --- | --- | --- |',rows,'',
  unreachable.length?`Unreachable this run: ${unreachable.map(u=>'`'+u+'`').join(', ')}\n`:'',
  '## Next steps','',
  '1. On a machine with the app installed, run `node scripts/reference-baseline.mjs --check` to confirm the install moved too.',
  '2. Refresh `docs/ORIGINAL_BASELINE.md` and `docs/original-comparison.json`; keep the previous manifest as history.',
  '3. Re-run `npm test` and `node scripts/reference-behavior-test.mjs --independent`.',
  '4. Acknowledge with `node scripts/watch-original.mjs --ack`, then close this issue.','',
  '> An upstream release being published is **not** proof that the installed baseline changed. Only `reference-baseline.mjs --check` is authoritative for hashes.'
 ].filter(Boolean).join('\n');
}
export function localBody(summary,stderr=''){
 const packages=Object.entries(summary?.packages??{}).filter(([,p])=>p.versionChanged||p.inventoryChanged).map(([n,p])=>`| \`${n}\` | ${p.previous??'-'} | ${p.current??'-'} | inventory ${p.inventoryChanged?'changed':'same'} |`);
 const files=Object.entries(summary?.files??{}).filter(([,f])=>f.status==='changed'||f.status==='missing').map(([id,f])=>`| \`${id}\` | ${f.status} | ${(f.previousSHA256??'-').slice(0,12)} | ${(f.currentSHA256??'-').slice(0,12)} |`);
 return [
  'Automated read-only inventory of the **installed** original. Nothing was executed and no private socket or credential was accessed.',
  '','```json',JSON.stringify(summary?.app??{},null,2),'```','',
  'Detected app identity change: **'+(summary?.appIdentityChanged?'yes':'no')+'**','',
  packages.length?['Package changes:','','| package | previous | current | inventory |','| --- | --- | --- | --- |',...packages,''].join('\n'):'',
  files.length?['File changes:','','| artifact | status | previous | current |','| --- | --- | --- | --- |',...files,''].join('\n'):'',
  stderr?`\`\`\`\n${stderr.trim()}\n\`\`\`\n`:'',
  '## Next steps','',
  '1. Re-run with `node scripts/reference-baseline.mjs --previous docs/original-baseline.json --output artifacts/next-reference.json`.',
  '2. Refresh the baseline documents and re-derive any behavior comparison before claiming equivalence.',
  '3. Close this issue only after the baseline is refreshed and acknowledged.'
 ].filter(Boolean).join('\n');
}
async function observeUpstream(){
 const observed={},unreachable=[];
 for(const s of upstreamSignals){
  try{
   const r=await fetch(s.url,{headers:{'user-agent':'cu-original-watch'}});
   if(!r.ok)throw Error(`HTTP ${r.status}`);
   const v=(await r.json())?.version;
   if(typeof v!=='string'||!v)throw Error('missing version field');
   observed[s.id]=v;
  }catch(e){unreachable.push(`${s.id}: ${e.message}`)}
 }
 return {observed,unreachable};
}
function observeLocal(){
 const r=spawnSync(process.execPath,[path.join(root,'scripts/reference-baseline.mjs'),'--check'],{encoding:'utf8',maxBuffer:64*1024*1024});
 let summary=null;try{summary=JSON.parse(r.stdout)}catch{}
 return {drifted:r.status===1,summary,stderr:r.stderr??''};
}
function sh(args,input){
 const r=spawnSync('gh',args,{encoding:'utf8',input,maxBuffer:16*1024*1024});
 return {ok:r.status===0,out:(r.stdout??'').trim(),err:(r.stderr??'').trim()};
}
function ensureLabel(){sh(['label','create',label,'--color','fbca04','--description','Automated original-baseline drift tracking','--force'])}
function openIssue(title){
 const r=sh(['issue','list','--label',label,'--state','open','--limit','50','--json','number,title,body']);
 if(!r.ok)throw Error(`gh issue list failed: ${r.err}`);
 return (JSON.parse(r.out||'[]')||[]).find(i=>i.title===title)??null;
}
function fileIssue({title,body,marker}){
 ensureLabel();
 const existing=openIssue(title);
 if(existing){
  if((existing.body??'').includes(marker))return {action:'unchanged',number:existing.number};
  const upd=sh(['issue','comment',String(existing.number),'--body-file','-'],`New observation (${new Date().toISOString()}):\n\n${body}`);
  if(!upd.ok)throw Error(`gh issue comment failed: ${upd.err}`);
  return {action:'commented',number:existing.number};
 }
 const created=sh(['issue','create','--title',title,'--label',label,'--body-file','-'],`${body}\n\n${marker}`);
 if(!created.ok)throw Error(`gh issue create failed: ${created.err}`);
 return {action:'created',number:Number((created.out.match(/\/issues\/(\d+)/)??[])[1])||null,url:created.out};
}
// Side effects only happen in this entry point, so the pure helpers above stay importable.
export async function main(args=process.argv.slice(2)){
 const has=f=>args.includes(f);
 const mode=has('--local')?'local':has('--upstream')?'upstream':(process.platform==='darwin'?'local':'upstream');
 let report,exitCode=0;
 if(has('--ack')){
 const {observed,unreachable}=await observeUpstream();
 if(!Object.keys(observed).length)throw Error(`No upstream signal could be read: ${unreachable.join('; ')}`);
 const record=ackRecord(observed);
 await mkdir(path.dirname(watchFile),{recursive:true});
 await writeFile(watchFile,JSON.stringify(record,null,2)+'\n');
 report={mode:'ack',path:path.relative(root,watchFile),...record};
}else if(mode==='local'){
 const {drifted,summary,stderr}=observeLocal();
 exitCode=drifted?1:summary?0:2;
 const changes=(summary?.packageChanges)??{};
 const marker=`<!-- original-watch:local:${summary?.app?.version??'unknown'}:${summary?.app?.build??'unknown'} -->`;
 report={mode,drifted,exitCode,app:summary?.app??null,appIdentityChanged:summary?.appIdentityChanged??null,packageChanges:changes};
 if(drifted&&has('--issue')&&summary)report.issue=fileIssue({title:titles.local,body:localBody(summary,stderr),marker});
 else if(!summary&&has('--issue'))report.note='reference-baseline.mjs produced no parseable summary; nothing filed';
}else{
 let recorded={};try{recorded=(JSON.parse(await readFile(watchFile,'utf8'))?.checked)??{}}catch{}
 const {observed,unreachable}=await observeUpstream();
 const {drifted,changes}=classifyDrift(recorded,observed);
 exitCode=drifted?1:Object.keys(observed).length?0:2;
 const marker=`<!-- original-watch:upstream:${changes.map(c=>c.signal+'='+c.current).join(',')} -->`;
 report={mode,drifted,exitCode,recorded,observed,unreachable,changes};
 if(drifted&&has('--issue'))report.issue=fileIssue({title:titles.upstream,body:upstreamBody({changes,unreachable}),marker});
}
 console.log(JSON.stringify(report,null,2));
 return exitCode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().then(code=>{process.exitCode=code}).catch(e=>{console.error(`watch-original: ${e.message}`);process.exitCode=2});
}
