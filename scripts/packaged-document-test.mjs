// Run every real document action through the actual ZIP, outside this checkout.
import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
assert.equal(process.env.CU_EXPERIMENTAL_APPKIT_FOCUS,'1','Explicit opt-in is required for the packaged real-event test');
const root=fileURLToPath(new URL('../',import.meta.url)),identity=JSON.parse(readFileSync(path.join(root,'package.json'))),archive=path.join(root,`dist/${identity.name}-${identity.version}-${process.arch}-plugin.zip`);
const extracted=mkdtempSync('/tmp/cu-packaged-document-'),directory=path.join(root,'artifacts/packaged-document-'+Date.now());mkdirSync(directory,{recursive:true});
let report={status:'preparing',archive:path.basename(archive),archiveSHA256:createHash('sha256').update(readFileSync(archive)).digest('hex'),extractedOutsideCheckout:true,nodePathUnset:true};
try{
 const unzip=spawnSync('/usr/bin/unzip',['-q',archive,'-d',extracted],{encoding:'utf8'});assert.equal(unzip.status,0,unzip.stderr);
 const server=path.join(extracted,identity.name,'src/server.mjs'),env={...process.env,CU_TEST_MCP_SERVER:server,CU_TEST_DOCUMENT_CAPTURE:'1'};delete env.NODE_PATH;delete env.CU_TEST_NATIVE_HELPER;
 const child=spawn(process.execPath,[path.join(root,'scripts/raw-document-test.mjs')],{cwd:extracted,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>{output+=d;process.stdout.write(d)});child.stderr.on('data',d=>process.stderr.write(d));
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});report.exitCode=code;const match=output.match(/REPORT (.+\/report.json)/);assert.ok(match,'Missing document evidence');report.documentReport=match[1];
 const result=JSON.parse(readFileSync(report.documentReport,'utf8'));report.version=result.statusMetadata?.bridgeVersion;report.operations=result.operations?.length;report.recordedWindowOrder=result.recordedWindowOrder;
 assert.equal(code,0);assert.equal(result.status,'raw-document-events-passed');assert.equal(result.serverEntry,server);assert.equal(report.version,identity.version);assert.equal(report.operations,7);assert.ok(result.perception?.screenshot&&result.perception.ocr);report.perception=result.perception;report.status='passed';
}catch(error){report={...report,status:'failed',error:{code:error.code,message:error.message}};process.exitCode=1}
finally{
 const inventory=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
 const realExtraction=realpathSync(extracted);
 const inUse=inventory.status!==0||inventory.stdout.split('\n').some(line=>{const p=line.trim().replace(/^\d+\s+/,'');return p.startsWith(extracted+'/')||p.startsWith(realExtraction+'/')});
 if(inUse){report.cleanup='Retained extraction because an executable may still be running';report.extraction=extracted}else rmSync(extracted,{recursive:true,force:true});
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('PACKAGED_REPORT',path.join(directory,'report.json'));
}
