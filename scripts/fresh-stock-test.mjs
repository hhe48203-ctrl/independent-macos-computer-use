import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Bridge} from '../src/bridge.mjs';import {startFocusTrace} from './focus-trace.mjs';import {startStockFixture} from './stock-fixture.mjs';
if(process.env.CU_TEST_ALLOW_FOREGROUND_SETUP!=='1')throw Error('Stock apps may place a startup window above the foreground even with open -g. This diagnostic requires explicitly arranged interactive setup: CU_TEST_ALLOW_FOREGROUND_SETUP=1.');
const root=fileURLToPath(new URL('../',import.meta.url)),kind=process.argv[2];assert.ok(['calculator','textedit'].includes(kind));
const directory=path.join(root,'artifacts/fresh-stock-'+kind+'-'+Date.now());mkdirSync(directory,{recursive:true});
const trace=await startFocusTrace(directory,{seconds:90});const b=new Bridge();let fixture;let report={status:'running',kind};
try{
 const initial=await b.request('status');
 const initialWindows=(await b.request('windows')).windows.filter(w=>w.onScreen&&w.frame.width>200&&w.frame.height>200);
 assert.ok(initialWindows.some(w=>w.bundleId==='com.openai.codex'&&w.pid===initial.inputFocus.foregroundPID),'Use this test with the Codex main window in front');
 fixture=await startStockFixture(directory,kind,b);const t=fixture.target;report.target=t;
 // Use an existing cover; do not move or raise any application window.
 const windows=(await b.request('windows')).windows;const pids=new Set([t.pid]);
 const cover=windows.find(w=>w.onScreen&&!pids.has(w.pid)&&w.bundleId==='com.openai.codex'&&w.frame.x<=t.frame.x&&w.frame.y<=t.frame.y&&w.frame.x+w.frame.width>=t.frame.x+t.frame.width&&w.frame.y+w.frame.height>=t.frame.y+t.frame.height);
 assert.ok(cover,'An existing Codex window must geometrically contain the fresh stock window');
 b.close();await b.retiring;
 const child=spawn(process.execPath,[path.join(root,'scripts/raw-stock-pointer-test.mjs'),kind,String(t.pid),String(t.windowId),String(cover.windowId)],{cwd:root,env:{...process.env,CU_STOCK_POINTER_EXISTING_LONG_TEXT:kind==='textedit'?'1':'0'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',d=>{output+=d;process.stdout.write(d)});child.stderr.on('data',d=>process.stderr.write(d));const code=await new Promise(r=>child.once('exit',r));
 report.childExitCode=code;const match=output.match(/REPORT (.+\/report.json)/);if(match)report.pointerReport=match[1];assert.equal(code,0,'Stock pointer test must pass');
 report.status='fresh-stock-checks-passed';
}catch(error){report={...report,status:'failed',error:error.message};process.exitCode=1}
finally{
 b.close();trace.close();await new Promise(r=>trace.child.exitCode!==null?r():trace.child.once('exit',r));const observation=trace.read();
 const targetPIDs=new Set(fixture?[fixture.target.pid]:[]);const isolated=observation.samples.every(s=>s.keyboardFocusResolved&&!targetPIDs.has(s.keyboardPID)&&!targetPIDs.has(s.foregroundPID));
 if(!isolated){report.status='failed';report.isolationError='Stock setup or operation obtained focus';process.exitCode=1}
 report.setupAndOperationObservation={isolated,sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap};
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('FRESH_REPORT',path.join(directory,'report.json'));fixture?.close();
}
