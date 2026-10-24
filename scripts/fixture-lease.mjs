// Atomic, process-shared fixture ownership. A ps check alone has a TOCTOU race.
import {mkdirSync,openSync,writeFileSync,readFileSync,closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';import {randomUUID} from 'node:crypto';
const leases=new Map();
export function acquireFixtureLease(directory){
 const file=path.resolve(directory,'fixture.lease');let entry=leases.get(file);
 if(!entry){
  mkdirSync(directory,{recursive:true});const token=randomUUID();let fd;
  try{fd=openSync(file,'wx')}catch(e){
   if(e.code!=='EEXIST')throw e;
   let owner;try{owner=JSON.parse(readFileSync(file,'utf8'))}catch{}
   throw Object.assign(Error(`Owned GUI fixtures are leased by another test${owner?.pid?` (PID ${owner.pid})`:''}. No executable was changed. If that process crashed, verify all owned tests/compilers have exited before removing ${file}.`),{code:'FIXTURE_BUSY'});
  }
  try{writeFileSync(fd,JSON.stringify({pid:process.pid,token,createdAt:new Date().toISOString()}))}finally{closeSync(fd)}
  entry={token,refs:0};leases.set(file,entry);
 }
 entry.refs++;let released=false;
 return ()=>{
  if(released)return;released=true;entry.refs--;
  if(entry.refs===0){
   leases.delete(file);
   const current=JSON.parse(readFileSync(file,'utf8'));
   if(current.pid!==process.pid||current.token!==entry.token)throw Error('Fixture lease ownership changed; refusing to unlink it');
   unlinkSync(file);
  }
 };
}
