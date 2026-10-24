import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('build refuses to replace an executable used by a running process',{skip:process.platform!=='darwin'},async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'cu-build-safety-')),app=path.join(directory,'Local Computer Use.app'),exe=path.join(app,'Contents/MacOS/computer-use-bridge');mkdirSync(path.dirname(exe),{recursive:true});
 // A copied platform /bin/sleep can exit with SIGKILL on this host. Use our
 // own signed executable and wait for main(), not merely the spawn event.
 const source=path.join(directory,'guard.c');writeFileSync(source,'#include <stdio.h>\n#include <unistd.h>\nint main(void){puts("ready");fflush(stdout);sleep(60);return 0;}\n');
 assert.equal(spawnSync('xcrun',['clang',source,'-o',exe],{encoding:'utf8'}).status,0);
 assert.equal(spawnSync('/usr/bin/codesign',['--force','--sign','-',exe],{encoding:'utf8'}).status,0);
 const original=readFileSync(exe),child=spawn(exe,[],{stdio:['ignore','pipe','ignore']});
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Owned guard process did not become ready')),5000);let output='';
   child.stdout.on('data',data=>{output+=data;if(output.includes('ready\n')){clearTimeout(timer);resolve()}});
   child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',(code,signal)=>{clearTimeout(timer);reject(Error(`Owned guard process exited before build: ${signal??code}`))});
  });
  const alias=directory+'-alias';symlinkSync(directory,alias,'dir');
  for(const output of [directory,alias]){
   assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);
   const built=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,env:{...process.env,CU_BUILD_DIRECTORY:output},encoding:'utf8'});
   assert.notEqual(built.status,0);assert.match(built.stderr,/build output is running/);assert.deepEqual(readFileSync(exe),original);assert.equal(existsSync(path.join(app,'Contents/Info.plist')),false);
  }
 }finally{child.kill();await new Promise(r=>child.exitCode!==null||child.signalCode!==null?r():child.once('exit',r));rmSync(directory+'-alias',{force:true});rmSync(directory,{recursive:true,force:true})}
});

test('build cannot start while a GUI fixture owns the output directory',{skip:process.platform!=='darwin'},()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'cu-build-lease-'));
 try{
  writeFileSync(path.join(directory,'fixture.lease'),JSON.stringify({pid:process.pid,token:'owned-test'}));
  const built=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,env:{...process.env,CU_BUILD_DIRECTORY:directory},encoding:'utf8'});
  assert.notEqual(built.status,0);assert.match(built.stderr,/GUI test holds the fixture lease/);assert.equal(existsSync(path.join(directory,'BridgeVersion.swift')),false);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
