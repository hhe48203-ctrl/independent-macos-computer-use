// Owned-fixture causal trace; no foreground text reads or input-source changes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
import {connectRepl,parseAX} from './repl-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=Date.now(),directory=root+`artifacts/focus-cause-${stamp}`;mkdirSync(directory,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let fixture,repl,observer,report={status:'preparing',directory,phases:[]};
const save=()=>writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));
try{
 fixture=await startBackgroundFixture(directory,{background:true,documentInput:true,focusDiagnostics:true,targetRegular:process.argv.includes('--regular')});const t=fixture.apps.target;
 const executable=root+`.build/input-state/cause-${stamp}`;mkdirSync(root+'.build/input-state',{recursive:true});
 const built=spawnSync('xcrun',['swiftc','-O',root+'native/InputStateObserver.swift','-o',executable],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 observer=spawn(executable,[directory+'/input-state.json','90'],{stdio:['ignore','pipe','pipe']});observer.stderr.on('data',b=>process.stderr.write(b));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Observer not ready')),8000);observer.stdout.on('data',b=>{if(String(b).includes('READY')){clearTimeout(timer);resolve()}});observer.once('error',reject)});
 const server=process.env.CU_TEST_SERVER??root+'src/server.mjs';
 repl=await connectRepl({...process.env,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:process.argv.includes('--without-appkit')?'0':'1',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.document-target'},server);
 await repl.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${t.pid},windowId:${t.windowId}});return true})()`);
 const s=parseAX(await repl.evaluate('app.getAXState({emit:false,disableDiffing:true})')),doc=s.nodes.find(n=>n.identifier==='scroll-document');
 const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(t.pid),String(t.windowId),String(fixture.apps.cover.windowId)]));
 async function phase(name,expression){
  const before=proof(),start=Date.now()/1000;let result,error;
  try{if(expression)result=await repl.evaluate(expression);else await pause(700)}catch(e){error=e.message}
  await pause(250);const end=Date.now()/1000,after=proof();
  report.phases.push({name,start,end,result,error,before,after});save();console.log('PHASE',name,error??'observed');
 }
 await phase('idle');
 await phase('AX selection',`app.selectText(${doc.id},'Scrollable row 1 — background text')`);
 await phase('AX verified text',"app.typeText('X')");
 await phase('scroll without focus notices',"app.scroll([220,422],'down',0.2)");
 await phase('raw key zero hold',"app.pressKey('Right',{strategy:'event',durationMs:0})");
 await phase('raw key 600ms hold',"app.pressKey('Right',{strategy:'event',durationMs:600})");
 await phase('raw Unicode',"app.typeText('【ctx 中文🙂】',{strategy:'event'})");
 await phase('raw content click',"app.click([100,250],{strategy:'event'})");
 await phase('raw content drag',"app.drag([100,250],[200,260],{duration:0.6})");
 report.status=report.phases.some(p=>p.error)?'completed-with-errors':'completed';
}catch(e){report={...report,status:'failed',error:e.message};process.exitCode=1}
finally{
 await repl?.client.close();
 if(observer){observer.kill('SIGTERM');await new Promise(r=>observer.exitCode!==null||observer.signalCode!==null?r():observer.once('exit',r))}
 if(fixture)await fixture.closeAndWait();
 for(const p of report.phases){
  const trace=JSON.parse(readFileSync(directory+'/target-focus-diagnostics.json'));p.trace=trace.events.filter(e=>e.epoch>=p.start&&e.epoch<=p.end);
  p.contextActivations=p.trace.filter(e=>e.name==='input-context-activate-before').length;p.contextDeactivations=p.trace.filter(e=>e.name==='input-context-deactivate-before').length;
  p.windowOrders=p.trace.filter(e=>['order','orderFront','orderFrontRegardless','makeKeyAndOrderFront'].includes(e.name)).map(e=>({name:e.name,epoch:e.epoch,stack:e.stack}));
 }
 if(process.argv.includes('--without-appkit')){
  const ok=report.status==='completed'&&report.phases.every(p=>p.contextActivations===0&&p.contextDeactivations===0&&p.windowOrders.length===0&&p.before.fullyCovered&&p.after.fullyCovered);
  report.status=ok?'passed-no-synthetic-focus':'failed';if(!ok)process.exitCode=1;
 }
 save();console.log('REPORT',directory+'/report.json',report.status);
}
