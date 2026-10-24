// Tests each independent combination of notice1 / activation-point click / notice21.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=Date.now(),directory=root+`artifacts/focus-ablation-${stamp}`;mkdirSync(directory,{recursive:true});
const executable=directory+'/probe',source=['FocusObservation.swift','AgentCursor.swift','PointerDelivery.swift','UnicodePackets.swift','ScopedAppKitFocus.swift','Background.swift','ScopeAblationProbe.swift'];
writeFileSync(directory+'/version.swift','let bridgeVersion="diagnostic"\n');
const entry=readFileSync(root+'native/main.swift','utf8');const marker=entry.indexOf('let application = NSApplication.shared\n');assert.ok(marker>0);writeFileSync(directory+'/Desktop.swift',entry.slice(0,marker));
const built=spawnSync('xcrun',['swiftc','-parse-as-library','-D','CU_FOCUS_PROBE','-swift-version','5','-O','-framework','AppKit','-framework','ApplicationServices','-framework','ScreenCaptureKit','-framework','Vision',directory+'/version.swift',directory+'/Desktop.swift',...source.map(n=>root+'native/'+n),'-o',executable],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
const rows=[];let fixture;
try{
 for(const mask of [0,1,4,5,2,3,6,7]){
  const d=directory+'/mask-'+mask;fixture=await startBackgroundFixture(d,{background:true,documentInput:true,focusDiagnostics:true,targetRegular:process.argv.includes('--regular')});const t=fixture.apps.target;
  const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(t.pid),String(t.windowId),String(fixture.apps.cover.windowId)]));
  const before=proof();assert.equal(before.fullyCovered,true);
  const child=spawn(executable,[String(t.pid),String(t.windowId),String(mask),d+'/probe.json'],{env:{...process.env,CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.document-target',CU_EXPERIMENTAL_APPKIT_FOCUS:'1'},stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',b=>err+=b);
  const deadline=setTimeout(()=>child.kill('SIGTERM'),8000);const code=await new Promise(r=>child.once('exit',r));clearTimeout(deadline);assert.equal(code,0,err);
  const result=JSON.parse(readFileSync(d+'/probe.json')),after=proof();
  await fixture.closeAndWait();fixture=null;
  const trace=JSON.parse(readFileSync(d+'/target-focus-diagnostics.json')).events.filter(e=>e.epoch>=result.startedEpoch);
  const row={mask,result,before,after,contextActivations:trace.filter(e=>e.name==='input-context-activate-before').length,contextDeactivations:trace.filter(e=>e.name==='input-context-deactivate-before').length,orders:trace.filter(e=>['order','orderFront','orderFrontRegardless','makeKeyAndOrderFront'].includes(e.name)),trace};rows.push(row);
  writeFileSync(directory+'/report.json',JSON.stringify({status:'running',rows},null,2));console.log('ABLATION',JSON.stringify({mask,rightAccepted:result.rightAccepted,error:result.keyError??result.error,context:row.contextActivations,covered:after.fullyCovered}));
 }
 writeFileSync(directory+'/report.json',JSON.stringify({status:'completed-observation',rows},null,2));
}finally{fixture?.close();console.log('REPORT',directory+'/report.json')}
