// Run only after a person has agreed to the 30-second concurrent-use test.
// Observes foreground PID / pointer positions, never other apps' key contents.
import assert from 'node:assert/strict';
import{Client}from'@modelcontextprotocol/sdk/client/index.js';
import{StdioClientTransport}from'@modelcontextprotocol/sdk/client/stdio.js';
import{readFileSync,writeFileSync}from'node:fs';
import{spawnSync}from'node:child_process';
import path from'node:path';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.resolve(process.argv[2]??'');
const config=JSON.parse(readFileSync(path.join(dir,'human-targets.json'),'utf8'));
const {target,coverId}=config;
const client=new Client({name:'human-concurrent-background-test',version:'1.0.0'});
const proof=()=>{const p=spawnSync(path.join(root,'.build/background-test-driver'),['occlusion',String(target.pid),String(target.windowId),String(coverId)],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);return JSON.parse(p.stdout)};
async function call(name,args){const r=await client.callTool({name,arguments:args});const value=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);if(r.isError)throw Error(JSON.stringify(value));return value}
const preparation=Number(process.env.CU_HUMAN_PREPARE_SECONDS??0);if(preparation>0)await new Promise(r=>setTimeout(r,Math.min(30,preparation)*1000));
const operations=[];const start=Date.now()/1000;let error;
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs')],env:{...process.env,CU_ALLOWED_BUNDLE_IDS:'com.apple.calculator'}}));
 console.log('HUMAN_TEST_STARTED',new Date().toISOString());let round=0;
 while(Date.now()/1000-start<30){
  for(const id of['all-clear','seven','multiply','eight','equals']){
   const before=proof();assert.ok(before.fullyCovered);assert.notEqual(before.frontPid,target.pid);
   const s=await call('cu_snapshot',{...target,screenshot:false});let n=s.nodes.find(n=>n.identifier===id);if(!n){const names={'all-clear':['All Clear','Clear'],'seven':['7'],'multiply':['Multiply','×'],'eight':['8'],'equals':['Equals','=']};n=s.nodes.find(n=>n.role==='AXButton'&&names[id].includes(n.label??n.title??n.value))}assert.ok(n);
   const result=await call('cu_click',{snapshotId:s.snapshotId,elementId:n.id,strategy:'ax'});const after=proof();operations.push({time:Date.now()/1000,before,after,result});assert.ok(after.fullyCovered);assert.notEqual(after.frontPid,target.pid);
  }
  const s=await call('cu_snapshot',{...target,screenshot:false});assert.ok(s.nodes.some(n=>String(n.value??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')==='56'));round++;
 }
 console.log('HUMAN_TEST_ENDED',round,'verified calculations');
}catch(e){error={message:e.message,stack:e.stack};console.error(e.message)}
finally{
 await client.close();await new Promise(r=>setTimeout(r,250));
 const end=Date.now()/1000;const all=JSON.parse(readFileSync(path.join(dir,'cover-samples.json'),'utf8'));
 const samples=all.filter(s=>s.t+config.epoch>=start&&s.t+config.epoch<=end);
 const activations=JSON.parse(readFileSync(path.join(dir,'cover-activations.json'),'utf8')).filter(s=>s.t+config.epoch>=start&&s.t+config.epoch<=end);
 const report={date:new Date().toISOString(),status:error?'failed':'completed-awaiting-human-feedback',start,end,duration:end-start,target,operations,sampleCount:samples.length,frontPids:[...new Set(samples.map(s=>s.frontPid))],targetEverFront:samples.some(s=>s.frontPid===target.pid)||activations.some(a=>a.pid===target.pid),pointerDistinctPositions:new Set(samples.map(s=>s.x+','+s.y)).size,humanFeedback:null,error,privacy:'Only foreground PID and pointer coordinates observed; no other-app keystrokes or screenshots collected.'};
 writeFileSync(path.join(dir,'human-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,operations:operations.length},null,2));
}
