import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('build refuses to replace an executable used by a running process',{skip:process.platform!=='darwin'},async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'cu-build-safety-'));const app=path.join(directory,'Local Computer Use.app'),exe=path.join(app,'Contents/MacOS/computer-use-bridge');mkdirSync(path.dirname(exe),{recursive:true});copyFileSync('/bin/sleep',exe);const original=readFileSync(exe),child=spawn(exe,['30'],{stdio:'ignore'});
 try{
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
  const alias=directory+'-alias';symlinkSync(directory,alias,'dir');
  for(const output of [directory,alias]){
   const built=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,env:{...process.env,CU_BUILD_DIRECTORY:output},encoding:'utf8'});
   assert.notEqual(built.status,0);assert.match(built.stderr,/build output is running/);assert.deepEqual(readFileSync(exe),original);assert.equal(existsSync(path.join(app,'Contents/Info.plist')),false);
  }
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(directory+'-alias',{force:true});rmSync(directory,{recursive:true,force:true})}
});
