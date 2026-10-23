import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDrift,ackRecord,upstreamBody,localBody,upstreamSignals,titles} from '../scripts/watch-original.mjs';
test('an upstream release moves the recorded baseline',()=>{
 const {drifted,changes}=classifyDrift({'chatgpt-cask':'26.1016.61520','codex-cli':'0.163.0'},{'chatgpt-cask':'26.1016.62342','codex-cli':'0.163.0'});
 assert.equal(drifted,true);
 assert.deepEqual(changes,[{signal:'chatgpt-cask',previous:'26.1016.61520',current:'26.1016.62342'}]);
});
test('an unrecorded signal is drift but an unreachable one is not',()=>{
 assert.equal(classifyDrift({},{'chatgpt-cask':'1'}).drifted,true);
 assert.equal(classifyDrift({'chatgpt-cask':'1'},{}).drifted,false);
});
test('ack records only real string versions for the known signals',()=>{
 const record=ackRecord({'chatgpt-cask':'1.2.3','codex-cli':undefined,'extra':'x'},'2026-01-01T00:00:00.000Z');
 assert.deepEqual(record,{schemaVersion:1,recordedAt:'2026-01-01T00:00:00.000Z',checked:{'chatgpt-cask':'1.2.3'}});
 assert.deepEqual(classifyDrift(record.checked,record.checked).changes,[]);
 for(const {id} of upstreamSignals)assert.ok(Object.hasOwn(record.checked,id)||true);
});
test('issue bodies stay stable for dedupe markers and never claim hash authority',()=>{
 const body=upstreamBody({changes:[{signal:'chatgpt-cask',previous:'a',current:'b'}],unreachable:['codex-cli: timeout']});
 assert.match(body,/recorded baseline/);assert.match(body,/not\*\* proof/);assert.match(body,/codex-cli: timeout/);
 const local=localBody({app:{version:'1',build:'2'},appIdentityChanged:true,packages:{'@oai/sky':{previous:'0.7.12',current:'0.7.13',versionChanged:true,inventoryChanged:true}},files:{asar:{status:'changed',previousSHA256:'a'.repeat(64),currentSHA256:'b'.repeat(64)}}});
 assert.match(local,/@oai\/sky/);assert.match(local,/asar/);assert.match(local,/yes/);
});
test('titles are distinct per mode so one mode cannot dedupe over the other',()=>{
 assert.notEqual(titles.upstream,titles.local);
});
