import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('native Unicode packets preserve UTF-16 and isolate controls',{skip:process.platform!=='darwin'},()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'cu-unicode-'));try{
  const exe=path.join(dir,'test');const build=spawnSync('xcrun',['swiftc','-parse-as-library',path.join(root,'native/UnicodePackets.swift'),path.join(root,'tests/native-unicode-packets.swift'),'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
  const run=spawnSync(exe,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
