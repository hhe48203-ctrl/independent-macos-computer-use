import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
import {connectRepl} from './repl-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=Date.now(),directory=root+`artifacts/input-state-${stamp}`;mkdirSync(directory,{recursive:true});
const binary=root+`.build/input-state/observer-${stamp}`,output=directory+'/input-state.json';mkdirSync(root+'.build/input-state',{recursive:true});
const built=spawnSync('xcrun',['swiftc','-O',root+'native/InputStateObserver.swift','-o',binary],{encoding:'utf8'});if(built.status!==0)throw Error(built.stderr);
const observer=spawn(binary,[output],{stdio:['ignore','pipe','pipe']});observer.stderr.on('data',b=>process.stderr.write(b));
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Observer not ready')),10000);observer.stdout.on('data',b=>{if(String(b).includes('READY')){clearTimeout(timer);resolve()}});observer.once('error',reject)});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let fixture,repl;const phases=[];
async function phase(name,expression){const start=Date.now()/1000;let result,error;try{result=await repl.evaluate(expression)}catch(e){error=e.message}await pause(250);phases.push({name,start,end:Date.now()/1000,result,error});}
try{
  fixture=await startBackgroundFixture(directory,{background:true});
  repl=await connectRepl({...process.env,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:'1',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target'});
  const t=fixture.apps.target;await repl.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${t.pid},windowId:${t.windowId}});return {pid:app.pid}})()`);
  for(let round=0;round<3;round++){
    await phase('cursor only','app.move([100,280])');
    await phase('AX text','app.typeText("ax")');
    await phase('AX select-all','app.pressKey("CMD+A")');
    await phase('raw Unicode plus local focus','app.typeText("raw",{strategy:"event"})');
    await phase('raw Command shortcut plus local focus','app.pressKey("CMD+A",{strategy:"event"})');
    await phase('raw click plus local focus','app.click([100,280],{strategy:"event"})');
    await phase('raw scroll without local focus','app.scroll([100,280],"down",0.2)');
    await repl.evaluate('(async()=>{var s=await app.getAXState({emit:false,disableDiffing:true});var line=s.split("\\n").find(l=>l.includes("message-input"));var index=Number(line.match(/\\[(\\d+)\\]/)[1]);await app.performSecondaryAction(index,"focus");return true})()');
  }
}finally{
  await repl?.client.close();fixture?.close();observer.kill('SIGTERM');await new Promise(r=>observer.exitCode!==null?r():observer.once('exit',r));
  const observation=JSON.parse(readFileSync(output));const report={date:new Date().toISOString(),phases,changes:observation.changes,flagsChangedEvents:observation.flagsChangedEvents,scope:'Read-only global input-source/modifier sampling during controlled background phases. Human source/IME switching itself is not simulated; absence of sampled changes does not prove safe concurrent switching.'};
  writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));console.log('REPORT',directory+'/report.json',JSON.stringify({phases:phases.map(p=>({name:p.name,error:p.error})),changes:report.changes,flagsChangedEvents:report.flagsChangedEvents.length}));
}
