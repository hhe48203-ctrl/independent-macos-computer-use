// Visible setup is intentionally separate from background-operation acceptance.
// Announce it to the participant before setting the explicit setup switch.
import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Bridge} from '../src/bridge.mjs';import {startStockFixture} from './stock-fixture.mjs';import {startFocusTrace} from './focus-trace.mjs';
assert.equal(process.env.CU_TEST_ALLOW_FOREGROUND_SETUP,'1','Arrange visible test setup before enabling this switch');
assert.equal(process.env.CU_EXPERIMENTAL_APPKIT_FOCUS,'1','This test evaluates the explicitly enabled experimental backend');
const [kind,id]=process.argv.slice(2),coverId=Number(id);assert.ok(['calculator','textedit'].includes(kind)&&Number.isSafeInteger(coverId)&&coverId>0,'Usage: interactive-stock-test.mjs calculator|textedit ORIGINAL_CODEX_MAIN_WINDOW_ID');
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=Date.now(),directory=path.join(root,'artifacts/interactive-stock-'+kind+'-'+stamp);mkdirSync(directory,{recursive:true});
let fixture,trace;const bridge=new Bridge({env:{...process.env,CU_ENABLE_FOREGROUND:'0'}});let report={status:'preparing',kind,explicitVisibleSetup:true};
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim()};
try{
 const initial=await bridge.request('status'),windows=(await bridge.request('windows')).windows;
 const cover=windows.find(w=>w.windowId===coverId&&w.pid===initial.inputFocus.foregroundPID&&w.bundleId==='com.openai.codex'&&w.onScreen);assert.ok(cover,'The exact original Codex window must already be foreground');
 report.originalCover=cover;trace=await startFocusTrace(directory,{seconds:140});
 const driver=path.join(root,'.build/interactive-stock-driver-'+stamp);run('xcrun',['swiftc','-swift-version','5','-O',path.join(root,'native/BackgroundTestDriver.swift'),'-o',driver]);
 fixture=await startStockFixture(directory,kind,bridge,{ignoreSavedState:true});report.target=fixture.target;save();
 const t=fixture.target;const width=Math.min(kind==='calculator'?674:680,cover.frame.width-120),height=Math.min(kind==='calculator'?408:520,cover.frame.height-140);
 report.setupLayout=run(driver,['layout',String(t.pid),String(t.windowId),String(cover.frame.x+60),String(cover.frame.y+70),String(width),String(height)]);
 report.setupReturn=JSON.parse(run(driver,['restore-setup-foreground',String(cover.pid),String(coverId),String(t.pid)]));
 for(let i=0;i<20;i++){const s=await bridge.request('status');if(s.inputFocus.foregroundPID===cover.pid&&s.inputFocus.keyFocusPID===cover.pid)break;assert.ok(i<19,'Original foreground did not become ready; no backend input');await new Promise(r=>setTimeout(r,100))}
 const proof=JSON.parse(run(driver,['occlusion',String(t.pid),String(t.windowId),String(coverId)]));assert.equal(proof.fullyCovered,true);report.operationStartEpoch=Date.now()/1000;report.setupProof=proof;save();
 bridge.close();await bridge.retiring;
 const child=spawn(process.execPath,[path.join(root,'scripts/raw-stock-pointer-test.mjs'),kind,String(t.pid),String(t.windowId),String(coverId)],{cwd:root,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_STOCK_POINTER_EXISTING_LONG_TEXT:'1'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',d=>{output+=d;process.stdout.write(d)});child.stderr.on('data',d=>process.stderr.write(d));const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
 report.operationEndEpoch=Date.now()/1000;report.childExitCode=code;const match=output.match(/REPORT (.+\/report.json)/);if(match)report.operationReport=match[1];
 assert.equal(code,0,'Stock background operations must pass');const result=JSON.parse(readFileSync(report.operationReport,'utf8'));assert.equal(result.status,'stock-pointer-checks-passed');report.status='interactive-setup-background-operations-passed';
}catch(error){report={...report,status:'failed',error:{code:error.code,message:error.message}};process.exitCode=1}
finally{
 bridge.close();await bridge.retiring;if(trace){trace.close();await new Promise(r=>trace.child.exitCode!==null?r():trace.child.once('exit',r));const o=trace.read();report.setupAndOperationObservation={sampleCount:o.sampleCount,maxSampleGap:o.maxSampleGap,foregroundPIDs:[...new Set(o.samples.map(s=>s.foregroundPID))],scope:'Includes explicitly visible setup; only the child operation report establishes backend isolation.'}}
 save();console.log('SETUP_REPORT',path.join(directory,'report.json'));fixture?.close();
}
