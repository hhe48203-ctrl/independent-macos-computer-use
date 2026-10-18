// Disposable stock app launch through Launch Services' background option.
// A read-only focus observer must already be running before calling this.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
export async function startStockFixture(directory,kind,bridge,{ignoreSavedState=false}={}){
 const bundle=kind==='textedit'?'com.apple.TextEdit':'com.apple.calculator';
 const before=new Set((await bridge.request('apps')).apps.map(a=>a.pid));
 const basename=`focus-input-${Date.now()}.txt`,file=path.join(directory,basename);
 if(kind==='textedit')writeFileSync(file,'独立后台事件测试 abcdefghijklmnopqrstuvwxyz\n'+Array.from({length:65},(_,i)=>`Test row ${String(i).padStart(2,'0')} — 甲乙丙丁 abcdefghijklmnopqrstuvwxyz`).join('\n'));
 const args=['-g','-n','-b',bundle,...(kind==='textedit'?[file]:[]),...(ignoreSavedState?['--args','-ApplePersistenceIgnoreState','YES']:[])];const opened=spawnSync('/usr/bin/open',args,{encoding:'utf8'});if(opened.status!==0)throw Error(opened.stderr);
 let target;
 for(let i=0;i<100;i++){
  const windows=(await bridge.request('windows')).windows;
  target=windows.find(w=>w.bundleId===bundle&&!before.has(w.pid)&&w.onScreen&&(kind==='textedit'?w.title===basename:w.title==='Calculator'));
  if(target)break;await new Promise(r=>setTimeout(r,100));
 }
 if(!target)throw Error('No newly launched, owned stock window found; no existing app was used');
 return {target,file:kind==='textedit'?file:null,close(){try{process.kill(target.pid,'SIGTERM')}catch{}}};
}
