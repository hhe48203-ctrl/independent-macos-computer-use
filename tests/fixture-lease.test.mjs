import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,writeFileSync}from'node:fs';import{spawnSync}from'node:child_process';import os from'node:os';import path from'node:path';import{acquireFixtureLease}from'../scripts/fixture-lease.mjs';
const moduleURL=new URL('../scripts/fixture-lease.mjs',import.meta.url).href;
test('GUI fixture lease rejects a second process and remains held through nested fixture replacement',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'cu-lease-'));const first=acquireFixtureLease(directory),second=acquireFixtureLease(directory);
 const child=()=>spawnSync(process.execPath,['--input-type=module','-e',`import{acquireFixtureLease}from ${JSON.stringify(moduleURL)};const release=acquireFixtureLease(${JSON.stringify(directory)});release();`],{encoding:'utf8'});
 try{
  assert.notEqual(child().status,0);first();assert.notEqual(child().status,0);second();assert.equal(child().status,0);
  writeFileSync(path.join(directory,'fixture.lease'),'{"pid":99999999,"token":"stale"}');assert.throws(()=>acquireFixtureLease(directory),{code:'FIXTURE_BUSY'},'A stale lease requires explicit verified recovery, never races to delete a newer owner');
 }finally{first();second();rmSync(directory,{recursive:true,force:true})}
});
