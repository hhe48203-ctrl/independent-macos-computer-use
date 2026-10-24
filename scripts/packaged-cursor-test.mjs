// Run the changed covered-cursor behavior against the actual ZIP, outside checkout.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),identity=JSON.parse(readFileSync(root+'package.json'));
const archive=root+`dist/${identity.name}-${identity.version}-${process.arch}-plugin.zip`,temporary=mkdtempSync('/tmp/cu-cursor-package-');
const directory=root+`artifacts/packaged-cursor-${Date.now()}`;mkdirSync(directory,{recursive:true});
let report={date:new Date().toISOString(),status:'preparing',archive,sha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),extractedOutsideCheckout:true};
try{
  const unpack=spawnSync('/usr/bin/unzip',['-q',archive,'-d',temporary],{encoding:'utf8'});assert.equal(unpack.status,0,unpack.stderr);
  const env={...process.env,CU_TEST_SERVER:temporary+'/'+identity.name+'/src/server.mjs',CU_TEST_CWD:temporary};delete env.NODE_PATH;
  const run=spawnSync(process.execPath,[root+'scripts/repl-cursor-occlusion-test.mjs'],{cwd:temporary,env,encoding:'utf8',timeout:90000});
  writeFileSync(directory+'/run.log',(run.stdout??'')+(run.stderr??''));
  const match=run.stdout?.match(/REPORT (.+?\/report\.json) /);if(match)report.behaviorReport=match[1];
  assert.equal(run.status,0,run.stderr||run.stdout);
  report={...report,status:'passed',scope:'Actual extracted ZIP worker/helper, fully covered real operations and continuous hidden cursor motion; foreground PID and target/cover ordering checked. No target activation or elevated test windows.'};
}catch(error){report={...report,status:'failed',error:error.message};process.exitCode=1;}
finally{
  const ps=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
  if(ps.status!==0||ps.stdout.includes(temporary+'/')){report.cleanup='Extraction retained: an executable may still be running';report.extraction=temporary;}
  else rmSync(temporary,{recursive:true,force:true});
  writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));console.log('PACKAGED_CURSOR_REPORT',directory+'/report.json');
}
