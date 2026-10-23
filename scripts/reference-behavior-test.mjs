// Owned-fixture reference comparison. In original mode, only the legitimate
// cua_repl tool supplies input; this controller only observes and records.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
import {Bridge} from '../src/bridge.mjs';
import {connectRepl,parseAX} from './repl-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv.includes('--independent')?'independent':'original';
const at=process.argv.indexOf('--cursor-owner'),cursorOwner=at<0?null:Number(process.argv[at+1]);
assert.ok(cursorOwner===null||Number.isSafeInteger(cursorOwner)&&cursorOwner>0);
const directory=root+`artifacts/reference-${mode}-${Date.now()}`;mkdirSync(directory,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,documentInput:true,reference:mode==='original'}),target=fixture.apps.target;
const env={...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:mode==='original'?'io.local.computeruse.reference-document-target':'io.local.computeruse.document-target',CU_EXPERIMENTAL_APPKIT_FOCUS:'1'};
// This Bridge is observation-only in original mode.
const observer=new Bridge({env});let trace,repl;const steps=[];
const suffix='【基线 中文🙂 é 👩‍💻】';let report={status:'preparing',mode,target:{pid:target.pid,windowId:target.windowId},directory,suffix};
const save=()=>writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));
const snapshot=()=>observer.request('snapshot',{pid:target.pid,windowId:target.windowId,screenshot:false});
const document=s=>s.nodes.find(n=>n.identifier==='scroll-document');
const vertical=s=>s.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width)?.value;
const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));
let before;
async function checkpoint(command){
 const state=await snapshot(),doc=document(state),actual=fixture.read('target'),step={name:command.step,epoch:Date.now()/1000,document:{value:doc.value,selectedRange:doc.selectedRange,selectedText:doc.selectedText},scroll:vertical(state),input:actual.input,count:actual.count,proof:proof()};
 try{
  assert.ok(!command.error,command.error);
  switch(command.step){
   case 'nav':assert.equal(doc.selectedRange.location,document(before).value.length);break;
   case 'type':assert.equal(doc.value,document(before).value+suffix);break;
   case 'selectAll':assert.equal(doc.selectedRange.location,0);assert.equal(doc.selectedRange.length,doc.value.length);break;
   case 'top':assert.equal(doc.selectedRange.location,0);break;
   case 'drag':assert.ok(doc.selectedRange.length>0);break;
   case 'scroll':assert.ok(vertical(state)>vertical(before));break;
   case 'capture':{
    const c=command.capture;assert.ok(c&&c.width>0&&c.width<=16384&&c.height>0&&c.height<=16384&&c.bytes>1000);assert.ok(JSON.stringify(c.signature)===JSON.stringify([137,80,78,71,13,10,26,10])||(c.signature[0]===255&&c.signature[1]===216),'PNG or JPEG signature required');step.capture=c;
    const button=state.nodes.find(n=>n.identifier==='apply-message').frame;
    step.screenshotButtonPoint=[Math.round((button.x+button.width/2)*c.width/state.window.frame.width),Math.round((button.y+button.height/2)*c.height/state.window.frame.height)];break;
   }
   case 'click':assert.equal(actual.count,1);break;
   case 'setValue':assert.equal(actual.input,'baseline field 中文');break;
   case 'selectText':{const field=state.nodes.find(n=>n.identifier==='message-input');assert.equal(field.selectedRange?.length,2);assert.equal(field.selectedText,'中文');break;}
   default:throw Error('Unknown checkpoint');
  }
  assert.equal(step.proof.fullyCovered,true);assert.notEqual(step.proof.frontPid,target.pid);step.status='passed';
 }catch(e){step.status='failed';step.error=e.message}
 steps.push(step);report={...report,status:'running',steps};save();console.log('CHECKPOINT',JSON.stringify({...step,document:{...step.document,valueLength:step.document.value.length,value:undefined,selectedTextLength:step.document.selectedText?.length,selectedText:undefined}}));return step;
}
async function finish(){
 trace.close();await new Promise(resolve=>trace.child.exitCode!==null?resolve():trace.child.once('exit',resolve));const observations=trace.read();
 const order=recordedWindowOrder(observations,target.windowId,fixture.apps.cover.windowId),samples=observations.samples??[];
 const cursorSamples=samples.filter(s=>s.referenceWindows?.length).map(s=>({t:s.t,windows:s.referenceWindows}));
 const recipient=observations.processEvents??[];
 report={...report,status:steps.length===10&&steps.every(s=>s.status==='passed')?'passed':'completed-with-differences',afterProof:proof(),windowOrder:order,observation:{sampleCount:observations.sampleCount,maxSampleGap:observations.maxSampleGap,targetForegroundSamples:samples.filter(s=>s.foregroundPID===target.pid).length,targetKeyboardSamples:samples.filter(s=>s.keyboardPID===target.pid).length,recipientKeyDown:recipient.filter(e=>e.type===10).length,recipientMouseDown:recipient.filter(e=>e.type===1).length},referenceCursorSamples:cursorSamples,scope:'One disposable covered AppKit fixture. No foreground draft reads, no human concurrency test, no original private module/socket access. Failed operations are recorded without replay.'};
 if(order.violations.length||report.observation.targetForegroundSamples||report.observation.targetKeyboardSamples){report.status='failed-isolation';process.exitCode=1}
 save();console.log('REPORT',directory+'/report.json',report.status);
}
try{
 before=await snapshot();assert.equal(proof().fullyCovered,true);
 trace=await startFocusTrace(directory,{seconds:180,targetPID:target.pid,env:{...process.env,...(cursorOwner?{CU_TRACE_WINDOW_OWNER_PID:String(cursorOwner)}:{})}});
 report={...report,status:'ready',before,initialProof:proof()};save();
 console.log('REFERENCE_READY',JSON.stringify({mode,directory,bundle:env.CU_ALLOWED_BUNDLE_IDS,appPath:root+'.build/Reference Document Target.app',target:{pid:target.pid,windowId:target.windowId},suffix,scrollFrame:before.nodes.find(n=>n.identifier==='scroll-area').frame}));
 if(mode==='original'){
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity});let timedOut=false;
  const stop=()=>lines.close();process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const deadline=setTimeout(()=>{timedOut=true;console.error('Reference controller timed out');lines.close()},230000);
  try{for await(const line of lines){if(!line.trim())continue;const command=JSON.parse(line);if(command.step==='finish')break;await checkpoint(command)}}finally{clearTimeout(deadline);lines.close();process.stdin.pause();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop)}
  if(timedOut)throw Error('Reference controller deadline exceeded; recorded checkpoints are incomplete')
 }else{
  repl=await connectRepl(env);await repl.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}});return true})()`);
  async function run(step,expression){try{await repl.evaluate(expression);return await checkpoint({step})}catch(e){return checkpoint({step,error:e.message})}}
  await run('nav',`app.pressKey('CMD+Down',{strategy:'event'})`);
  await run('type',`app.typeText(${JSON.stringify(suffix)},{strategy:'event'})`);
  await run('selectAll',`app.pressKey('CMD+A',{strategy:'event'})`);
  await run('top',`app.pressKey('CMD+Up',{strategy:'event'})`);
  const observed=await snapshot(),f=observed.nodes.find(n=>n.identifier==='scroll-area').frame;
  await run('drag',`app.drag([${f.x+20},${f.y+15}],[${f.x+250},${f.y+15}],{duration:0.35})`);
  await run('scroll',`app.scroll([${f.x+200},${f.y+50}],'down',0.6)`);
  const capture=await repl.evaluate(`(async()=>{let png=await app.getScreenshot({emit:false});return {bytes:png.length,signature:[...png.subarray(0,8)],width:png.readUInt32BE(16),height:png.readUInt32BE(20)}})()`);
  const shot=await checkpoint({step:'capture',capture});await run('click',`app.click(${JSON.stringify(shot.screenshotButtonPoint)},{strategy:'event'})`);
  const ax=parseAX(await repl.evaluate('app.getAXState({emit:false,disableDiffing:true})')),field=ax.nodes.find(n=>n.identifier==='message-input');
  await run('setValue',`app.setValue(${field.id},'baseline field 中文')`);
  const current=parseAX(await repl.evaluate('app.getAXState({emit:false,disableDiffing:true})')).nodes.find(n=>n.identifier==='message-input');
  await run('selectText',`app.selectText(${current.id},'中文')`);
 }
 await finish();
}catch(e){report={...report,status:'failed',error:e.message};save();console.error('REPORT',directory+'/report.json',e.message);process.exitCode=1}
finally{observer.close();await observer.retiring;await repl?.client.close();trace?.close();fixture.close()}
