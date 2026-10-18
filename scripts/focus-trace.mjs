import { spawn,spawnSync } from 'node:child_process';
import { mkdirSync,existsSync,readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function startFocusTrace(directory,{seconds=90,targetPID}={}) {
  mkdirSync(path.join(root,'.build/focus-v3'),{recursive:true});mkdirSync(directory,{recursive:true});
  // Never replace executable pages belonging to an existing observer process.
  const executable=path.join(root,`.build/focus-v3/focus-trace-${process.pid}-${Date.now()}`);
  const built=spawnSync('xcrun',['swiftc','-swift-version','5','-O',path.join(root,'native/FocusObservation.swift'),path.join(root,'native/FocusTrace.swift'),'-o',executable],{encoding:'utf8'});
  if(built.status!==0)throw Error(built.stderr||built.stdout);
  const child=spawn(executable,[directory,String(seconds),...(targetPID?[String(targetPID)]:[])],{stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',data=>process.stderr.write(data));
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{child.kill();reject(Error('Focus trace did not become ready'))},10000);
    child.once('error',error=>{clearTimeout(timeout);reject(error)});
    child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Focus trace exited before ready: ${code}`))});
    child.stdout.on('data',data=>{if(String(data).includes('READY')){clearTimeout(timeout);resolve()}});
  });
  const report=path.join(directory,'focus-trace.json');
  return {child,report,read(){return existsSync(report)?JSON.parse(readFileSync(report,'utf8')):null},close(){child.kill('SIGTERM')}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const trace=await startFocusTrace(path.resolve(process.argv[2]??'artifacts/focus-observation'),{seconds:Number(process.argv[3]??30)});
  console.log(`Read-only focus observer ready: ${trace.report}`);
  await new Promise(resolve=>trace.child.once('exit',resolve));
}
