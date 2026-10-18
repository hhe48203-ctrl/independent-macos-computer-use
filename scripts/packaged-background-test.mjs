// Reuse an existing owned Calculator/cover pair; never launch/focus/layout apps.
import{Client}from'@modelcontextprotocol/sdk/client/index.js';import{StdioClientTransport}from'@modelcontextprotocol/sdk/client/stdio.js';import assert from'node:assert/strict';
import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),identity=JSON.parse(readFileSync(path.join(root,'package.json')));
if(!process.env.CU_TEST_EXISTING_TARGETS)throw Error('Supply CU_TEST_EXISTING_TARGETS pointing to a report with owned Calculator/TextEdit test windows. No setup or foreground input will be performed.');
const previous=JSON.parse(readFileSync(process.env.CU_TEST_EXISTING_TARGETS,'utf8')).targets,target=previous.calculator,coverId=previous.textedit.windowId;
const zip=path.join(root,`dist/${identity.name}-${identity.version}-${process.arch}-plugin.zip`),directory=mkdtempSync('/tmp/cu-packaged-background-');
const unpack=spawnSync('/usr/bin/unzip',['-q',zip,'-d',directory],{encoding:'utf8'});if(unpack.status!==0)throw Error(unpack.stderr);
const proof=()=>JSON.parse(spawnSync(path.join(root,'.build/background-test-driver'),['occlusion',String(target.pid),String(target.windowId),String(coverId)],{encoding:'utf8'}).stdout);
const client=new Client({name:'external-zip-real-background-client',version:'0.2.0'}),operations=[];const env={...process.env,CU_ALLOWED_BUNDLE_IDS:'com.apple.calculator'};delete env.NODE_PATH;delete env.CU_ENABLE_FOREGROUND;
async function call(name,args={}){const r=await client.callTool({name,arguments:args});const value=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);assert.ok(!r.isError,JSON.stringify(value));return{r,value}}
try{
 const before=proof();assert.ok(before.fullyCovered);assert.notEqual(before.frontPid,target.pid);
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(directory,identity.name,'src/server.mjs')],cwd:directory,env}));
 const status=(await call('cu_status')).value;assert.equal(status.bridgeVersion,identity.version);assert.equal(status.foregroundEnabled,false);
 for(const key of['all-clear','seven','multiply','eight','equals']){
  const p=proof();assert.ok(p.fullyCovered);assert.notEqual(p.frontPid,target.pid);
  const s=(await call('cu_snapshot',{...target,screenshot:false})).value;const labels={'all-clear':['All Clear','Clear'],seven:['7'],multiply:['Multiply','×'],eight:['8'],equals:['Equals','=']};const n=s.nodes.find(n=>n.identifier===key)??s.nodes.find(n=>n.role==='AXButton'&&labels[key].includes(n.label??n.title??n.value));assert.ok(n);
  const result=(await call('cu_click',{snapshotId:s.snapshotId,elementId:n.id,strategy:'ax'})).value;const after=proof();assert.ok(after.fullyCovered);assert.notEqual(after.frontPid,target.pid);operations.push({key,before:p,after,result});
 }
 const snapshot=await call('cu_snapshot',target);assert.ok(snapshot.value.nodes.some(n=>String(n.value??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')==='56'));
 const image=snapshot.r.content.find(c=>c.type==='image');writeFileSync(path.join(root,'artifacts/packaged-calculator-56.png'),Buffer.from(image.data,'base64'));
 const report={date:new Date().toISOString(),status:'passed',archive:path.basename(zip),archiveSHA256:createHash('sha256').update(readFileSync(zip)).digest('hex'),extractedOutsideCheckout:true,serverNodePathUnset:true,version:status.bridgeVersion,foregroundEnabled:status.foregroundEnabled,target,operations,final:proof(),result:56};writeFileSync(path.join(root,'artifacts/packaged-background-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,operations:operations.length},null,2));
}finally{await client.close();rmSync(directory,{recursive:true,force:true})}
