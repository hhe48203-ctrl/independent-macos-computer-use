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
  const runs=[];
  const scenarios=[{name:'repl-document-test.mjs',scoped:'1'},{name:'repl-document-test.mjs',scoped:'0'},{name:'repl-input-options-test.mjs',scoped:'1'},{name:'repl-reconnect-test.mjs',scoped:'0'},{name:'focus-cause-test.mjs',scoped:'0',args:['--without-appkit','--regular']}];
  for(const scenario of scenarios){
    const run=spawnSync(process.execPath,[root+'scripts/'+scenario.name,...(scenario.args??[])],{env:{...env,CU_TEST_SCOPED_FOCUS:scenario.scoped},cwd:directory,encoding:'utf8',timeout:90000});
    runs.push({...scenario,exitCode:run.status,stdout:run.stdout,stderr:run.stderr});
    if(run.status!==0)break;
  }
  const report={date:new Date().toISOString(),status:runs.length===scenarios.length&&runs.every(r=>r.exitCode===0)?'passed':'failed',archive,sha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),externalServer:env.CU_TEST_SERVER,cwd:directory,nodePathUnset:true,runs};
  mkdirSync(root+'artifacts/packaged-repl',{recursive:true});writeFileSync(root+'artifacts/packaged-repl/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));assert.equal(report.status,'passed',runs.at(-1).stderr||runs.at(-1).stdout);
}finally{rmSync(directory,{recursive:true,force:true});}
