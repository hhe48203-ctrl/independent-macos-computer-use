import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function startBackgroundFixture(directory,{roles=['target','cover'],background=true,regular=false,targetRegular=false,launchServices=false,documentInput=false,selectionInput=false,focusDiagnostics=false,allSpaces=false,reference=false,resizable=false,beforeLaunch}={}){
  if(regular && !launchServices && process.env.CU_TEST_ALLOW_FOREGROUND_SETUP!=='1')throw Error('Direct regular AppKit launch may activate itself; CU_TEST_ALLOW_FOREGROUND_SETUP=1 is required.');
  mkdirSync(directory,{recursive:true});const children=[];const apps={};
  const driver=path.join(root,'.build/background-test-driver');
  function run(command,args){const r=spawnSync(command,args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim()}
  // Recompiling an in-use signed Mach-O can invalidate its executable pages.
  // Refuse overlapping runs before changing either app's executable.
  const running=run('/bin/ps',['-axo','pid=,comm=']);
  for(const role of roles){const name=role==='target'?(reference?'Reference Document Target':documentInput?'Background Document Target':'Background Target'):'Foreground Workspace';const executable=path.join(root,'.build',name+'.app/Contents/MacOS/fixture');if(running.split('\n').some(line=>line.trim().replace(/^\d+\s+/,'')===executable))throw Error(`${name} from an earlier test is still running; close that owned test before recompiling.`)}
  run('xcrun',['swiftc','-swift-version','5','-O',path.join(root,'native/BackgroundTestDriver.swift'),'-o',driver]);
  if(beforeLaunch)await beforeLaunch({driver,run});
  for(const role of roles){
    for(const file of readdirSync(directory))if(file.startsWith(role+'-')&&file.endsWith('.json'))rmSync(path.join(directory,file));
    const name=role==='target'?(reference?'Reference Document Target':documentInput?'Background Document Target':'Background Target'):'Foreground Workspace';const bundle=role==='target'?(reference?'io.local.computeruse.reference-document-target':documentInput?'io.local.computeruse.document-target':'io.local.computeruse.background-target'):'io.local.computeruse.foreground-workspace';
    const app=path.join(root,'.build',name+'.app');const executable=path.join(app,'Contents/MacOS/fixture');mkdirSync(path.dirname(executable),{recursive:true});
    writeFileSync(path.join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>${name}</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleVersion</key><string>1</string></dict></plist>`);
    run('xcrun',['swiftc','-parse-as-library','-swift-version','5','-O',path.join(root,'native/BackgroundFixture.swift'),...(focusDiagnostics?['-D','CU_FOCUS_DIAGNOSTICS',path.join(root,'native/FocusDiagnostics.swift')]:[]),'-o',executable]);run('/usr/bin/codesign',['--force','--sign','-',app]);
    const roleRegular=regular||(targetRegular&&role==='target'),roleLaunchServices=launchServices||(targetRegular&&role==='target');
    const args=[role,directory,...(allSpaces?['--all-spaces']:[]),...(resizable?['--resizable']:[]),...(roleRegular?['--regular-background']:[]),...(roleLaunchServices?['--launch-services-background']:[]),...(documentInput&&role==='target'?['--document-input']:[]),...(selectionInput&&role==='target'?['--selection-input']:[]),...(background?['--background',String(role==='cover'?apps.target?.windowId??0:0)]:[])];
    let child;
    if(roleLaunchServices){run('/usr/bin/open',['-g','-n',app,'--args',...args])}
    else {child=spawn(executable,args,{stdio:['ignore','ignore','pipe']});children.push(child);child.stderr.on('data',d=>process.stderr.write(d))}
    const stateFile=path.join(directory,role+'-state.json');
    for(let i=0;i<100&&!existsSync(stateFile);i++){if(child&&child.exitCode!==null)throw Error('Fixture exited');await new Promise(r=>setTimeout(r,50))}
    const state=JSON.parse(readFileSync(stateFile,'utf8'));
    if(!child){child={kill(signal){try{process.kill(state.pid,signal)}catch{}},exitCode:null};children.push(child)}
    apps[role]={...state,child};
  }
  return {apps,driver,run,read(role,suffix='state'){return JSON.parse(readFileSync(path.join(directory,`${role}-${suffix}.json`),'utf8'))},close(){for(const c of children)c.kill('SIGTERM')},async closeAndWait(){
    for(const c of children)c.kill('SIGTERM');
    for(const a of Object.values(apps)){
      const c=a.child;
      if(typeof c.once==='function'){if(c.exitCode===null&&c.signalCode===null)await new Promise(r=>c.once('exit',r))}
      else for(let i=0;i<60;i++){try{process.kill(a.pid,0)}catch{break}await new Promise(r=>setTimeout(r,50))}
    }
  }};
}
