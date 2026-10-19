// Coordinated 10s baseline + 20s background comparison; no Codex draft reads.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {connectRepl,parseAX} from './repl-client.mjs';
import {startBackgroundFixture} from './background-fixture.mjs';
assert.equal(process.env.CU_TEST_HUMAN_AGREED,'1','Coordinate human participation before running');
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=Date.now(),directory=root+`artifacts/ime-concurrency-${stamp}`;mkdirSync(directory,{recursive:true});
const executable=root+`.build/input-state/ime-observer-${stamp}`;mkdirSync(root+'.build/input-state',{recursive:true});
const compiled=spawnSync('xcrun',['swiftc','-O',root+'native/InputStateObserver.swift','-o',executable],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
let cancelled=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{cancelled=true});
let observer,fixture,repl,report={status:'preparing',phases:[],operations:[]};
const save=()=>writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFile(name){const limit=Date.now()+120000;while(!existsSync(directory+'/'+name)){assert.ok(!cancelled,'Test cancelled');assert.ok(Date.now()<limit,'No coordinated start signal');await pause(100)}}
try{
  fixture=await startBackgroundFixture(directory,{background:true,documentInput:true});const target=fixture.apps.target;
  repl=await connectRepl({...process.env,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:'1',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.document-target'});
  await repl.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}});return {pid:app.pid}})()`);
  const state=parseAX(await repl.evaluate('app.getAXState({emit:false,disableDiffing:true})'));
  const scroll=state.nodes.find(n=>n.identifier==='scroll-area').frame,button=state.nodes.find(n=>n.identifier==='apply-message').id;
  observer=spawn(executable,[directory+'/input-state.json','300'],{env:{...process.env,CU_INPUT_STATE_RECORD_KEY_COUNTS:'1'},stdio:['ignore','pipe','pipe']});observer.stderr.on('data',b=>process.stderr.write(b));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Observer not ready')),10000);observer.stdout.on('data',b=>{if(String(b).includes('READY')){clearTimeout(timer);resolve()}});observer.once('error',reject)});
  report={...report,status:'ready',target:{pid:target.pid,windowId:target.windowId},privacy:'No Codex AX or text reads. Input-source IDs, hardware/combined modifier masks and source/target metadata only.'};save();console.log('IME_READY',directory);
  await waitFile('baseline-start');const baseline=Date.now()/1000;report.status='baseline';save();await pause(10000);report.phases.push({name:'baseline-no-background-operations',start:baseline,end:Date.now()/1000});save();console.log('BASELINE_DONE');
  await waitFile('active-start');const active=Date.now()/1000;report.status='active';save();
  let round=0;
  const expressions=[()=>`app.pressKey('CMD+Down',{strategy:'event'})`,()=>`app.typeText('【IME ${round} 中文🙂】',{strategy:'event'})`,()=>`app.pressKey('CMD+A',{strategy:'event'})`,()=>`app.pressKey('CMD+Up',{strategy:'event'})`,()=>`app.drag([${scroll.x+20},${scroll.y+15}],[${scroll.x+250},${scroll.y+15}],{duration:0.2})`,()=>`app.scroll([${scroll.x+200},${scroll.y+50}],'down',0.6)`,()=>`app.click(${button},{strategy:'event'})`];
  while(Date.now()/1000-active<20){
    for(const expression of expressions){assert.ok(!cancelled,'Test cancelled');if(Date.now()/1000-active>=20)break;const start=Date.now()/1000;const result=await repl.evaluate(expression());report.operations.push({start,end:Date.now()/1000,result});save();}round++;
  }
  report.phases.push({name:'raw-background-with-corrected-scope',start:active,end:Date.now()/1000});report.status='completed-awaiting-human-review';save();console.log('IME_DONE');
}catch(error){report={...report,status:'failed',error:error.message};process.exitCode=1;}
finally{
  await repl?.client.close();fixture?.close();if(observer){observer.kill('SIGTERM');await new Promise(r=>observer.exitCode!==null?r():observer.once('exit',r));}
  if(existsSync(directory+'/input-state.json')){const o=JSON.parse(readFileSync(directory+'/input-state.json'));report.phaseObservations=report.phases.map(phase=>{const within=row=>row.epoch>=phase.start&&row.epoch<=phase.end;const samples=o.samples.filter(within),keys=o.keyboardMetadata.filter(within),flags=o.flagsChangedEvents.filter(within);return {...phase,samples:samples.length,sourceIDs:[...new Set(samples.map(s=>s.source))],hidFlags:[...new Set(samples.map(s=>s.hidFlags))],combinedFlags:[...new Set(samples.map(s=>s.combinedFlags))],keyDown:keys.filter(e=>e.type===10).length,sourcePIDs:[...new Set(keys.map(k=>k.sourcePID))],flagsChangedCount:flags.length,modifierMismatchSamples:samples.filter(s=>s.hidFlags!==s.combinedFlags).length}})}
  save();console.log('REPORT',directory+'/report.json',JSON.stringify({status:report.status,error:report.error,phases:report.phaseObservations}));
}
