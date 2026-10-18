import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('fixture logger accepts real key events without throwing or posting input',{skip:process.platform!=='darwin'},()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'cu-fixture-record-'));try{
  const executable=path.join(directory,'test');
  const build=spawnSync('xcrun',['swiftc','-D','CU_FIXTURE_RECORD_TEST','-parse-as-library',path.join(root,'native/BackgroundFixture.swift'),path.join(root,'tests/native-fixture-record.swift'),'-o',executable],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
  const run=spawnSync(executable,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
