// Prove the source tarball can install, build and test without checkout files.
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,realpathSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),identity=JSON.parse(readFileSync(path.join(root,'package.json'))),archive=path.join(root,`dist/${identity.name}-${identity.version}-source.tar.gz`),temporary=mkdtempSync('/tmp/cu-clean-source-'),directory=path.join(root,'artifacts/source-package-'+Date.now());mkdirSync(directory,{recursive:true});
let report={status:'preparing',version:identity.version,archive:path.basename(archive),archiveSHA256:createHash('sha256').update(readFileSync(archive)).digest('hex'),extractedOutsideCheckout:true,steps:[]};
const env={...process.env};delete env.NODE_PATH;for(const key of Object.keys(env))if(/^npm_config_/i.test(key)||['NPM_TOKEN','NODE_AUTH_TOKEN'].includes(key))delete env[key];
const config=path.join(temporary,'anonymous.npmrc'),globalConfig=path.join(temporary,'global.npmrc');writeFileSync(config,'registry=https://registry.npmjs.org/\nignore-scripts=true\n');writeFileSync(globalConfig,'');
function run(name,command,args,cwd){const result=spawnSync(command,args,{cwd,env,encoding:'utf8',maxBuffer:8*1024*1024});writeFileSync(path.join(directory,name+'.log'),(result.stdout??'')+(result.stderr??''));report.steps.push({name,exitCode:result.status,error:result.error?.message});return result}
try{
 assert.equal(run('extract','/usr/bin/tar',['-xzf',archive,'-C',temporary],temporary).status,0);
 const source=path.join(temporary,identity.name),npmArgs=['ci','--ignore-scripts','--no-audit','--no-fund','--userconfig',config,'--globalconfig',globalConfig];
 const offline=run('install-offline','npm',[...npmArgs,'--offline'],source);
 if(offline.status!==0)assert.equal(run('install-public-registry','npm',npmArgs,source).status,0,'Anonymous public-registry dependency installation failed');
 assert.equal(run('build',process.execPath,['scripts/build.mjs'],source).status,0,'Clean source build failed');
 const tests=readdirSync(path.join(source,'tests')).filter(n=>n.endsWith('.test.mjs')).map(n=>path.join(source,'tests',n));
 const tested=run('tests',process.execPath,['--test','--test-reporter=spec',...tests],source);assert.equal(tested.status,0,'Clean source regression failed');
 const count=Number((tested.stdout??'').match(/tests\s+(\d+)/)?.[1]);assert.ok(count>=18,'Native and protocol checks must run, not silently skip');assert.match(tested.stdout,/skipped\s+0/);
 report={...report,status:'passed',testsPassed:count,skipped:0,scope:'Actual source archive extracted outside checkout; locked dependencies installed with scripts disabled and isolated npm configuration; native helper rebuilt and all regression checks executed.'};
}catch(error){report={...report,status:'failed',error:{code:error.code,message:error.message}};process.exitCode=1}
finally{
 const realTemporary=realpathSync(temporary);
 const ps=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});const inUse=ps.status!==0||ps.stdout.split('\n').some(line=>{const p=line.trim().replace(/^\d+\s+/,'');return p.startsWith(temporary+'/')||p.startsWith(realTemporary+'/')});
 if(inUse){report.cleanup='Retained extraction because an executable may still be running';report.extraction=temporary}else rmSync(temporary,{recursive:true,force:true});
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('SOURCE_REPORT',path.join(directory,'report.json'));
}
