import {mkdtempSync,readFileSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),identity=JSON.parse(readFileSync(root+'package.json'));
const archive=root+`dist/${identity.name}-${identity.version}-${process.arch}-plugin.zip`,directory=mkdtempSync('/tmp/cu-repl-package-');
try{
  const unpack=spawnSync('/usr/bin/unzip',['-q',archive,'-d',directory],{encoding:'utf8'});assert.equal(unpack.status,0,unpack.stderr);
  const env={...process.env,CU_TEST_SERVER:directory+'/'+identity.name+'/src/server.mjs',CU_TEST_CWD:directory};delete env.NODE_PATH;
  const run=spawnSync(process.execPath,[root+'scripts/repl-document-test.mjs'],{env,cwd:directory,encoding:'utf8',timeout:90000});
  const report={date:new Date().toISOString(),status:run.status===0?'passed':'failed',exitCode:run.status,archive,sha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),externalServer:env.CU_TEST_SERVER,cwd:directory,nodePathUnset:true,stdout:run.stdout,stderr:run.stderr};
  mkdirSync(root+'artifacts/packaged-repl',{recursive:true});writeFileSync(root+'artifacts/packaged-repl/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));assert.equal(run.status,0,run.stderr||run.stdout);
}finally{rmSync(directory,{recursive:true,force:true});}
