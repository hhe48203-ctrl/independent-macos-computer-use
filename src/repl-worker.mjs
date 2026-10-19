import { parentPort } from 'node:worker_threads';
import { AsyncLocalStorage } from 'node:async_hooks';
import { start } from 'node:repl';
import { PassThrough } from 'node:stream';
import { inspect, format } from 'node:util';
import { createCua } from './cua.mjs';

const scope=new AsyncLocalStorage();
const pending=new Map();let sequence=0;let current;let bootstrapped=false;let failure;
const describe=e=>({code:e.code??e.name??'JS_ERROR',message:e.message??String(e),stack:e.stack});
function context() {const token=scope.getStore();if(!token||token.closed||current!==token)throw Object.assign(Error('Execution ended. Await operations inside the active js call.'),{code:'EXECUTION_ENDED'});return token;}
function emit(content) {const token=context();parentPort.postMessage({type:'output',execution:token.id,content});}
const cua=createCua({emit,request(method,params){
  const token=context();const id=++sequence;
  const promise=new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,execution:token.id});parentPort.postMessage({type:'native',id,execution:token.id,method,params});});
  token.operations.add(promise);promise.then(()=>token.operations.delete(promise),()=>token.operations.delete(promise));return promise;
}});
const output=new PassThrough();
const repl=start({input:new PassThrough(),output,terminal:false,prompt:'',useGlobal:false,ignoreUndefined:true});
// Node's default evaluator sends synchronous exceptions to its domain rather
// than its callback. Preserve this evaluator for actual lexical/TLA semantics.
repl._domain.on('error',error=>failure?.(error));
const nodeRepl=Object.freeze({
  write(value){emit({type:'text',text:typeof value==='string'?value:inspect(value,{depth:6,maxArrayLength:100,maxStringLength:20000})});},
  async emitImage(value){
    if(value?.type==='image'&&typeof value.data==='string') {emit(value);return;}
    const bytes=Buffer.isBuffer(value)||value instanceof Uint8Array?Buffer.from(value):value?.bytes?Buffer.from(value.bytes):null;
    if(!bytes)throw Error('emitImage expects PNG/JPEG bytes or an MCP image block');
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpeg=bytes[0]===255&&bytes[1]===216;
    if(!png&&!jpeg)throw Error('Only PNG/JPEG images are supported');
    emit({type:'image',data:bytes.toString('base64'),mimeType:png?'image/png':'image/jpeg'});
  },
  env:Object.freeze({...process.env})
});
const log=(...args)=>emit({type:'text',text:format(...args)});
Object.assign(repl.context,{cua,nodeRepl,console:Object.freeze({log,info:log,warn:log,error:log,debug:log,dir:value=>nodeRepl.write(value)})});
process.on('unhandledRejection',error=>{if(current)emitSafe({type:'text',text:`Unhandled rejection: ${error?.message??error}`});});
function emitSafe(content){if(current&&!current.closed)parentPort.postMessage({type:'output',execution:current.id,content});}
parentPort.on('message',async message=>{
  if(message.type==='nativeResult') {const p=pending.get(message.id);if(!p)return;pending.delete(message.id);message.error?p.reject(Object.assign(Error(message.error.message),{code:message.error.code})):p.resolve(message.result);return;}
  if(message.type!=='execute')return;
  const token={id:message.id,closed:false,operations:new Set()};current=token;
  await scope.run(token,async()=>{
    let value,error;
    try {
      if(!bootstrapped){cua.bootstrap();bootstrapped=true;}
      value=await new Promise((resolve,reject)=>{failure=reject;repl.eval(message.code+'\n',repl.context,`cua-${message.id}.js`,(e,result)=>e?reject(e):resolve(result));});
    }catch(e){error=describe(e);}
    // Drain already issued native operations. Late timers carry their original
    // AsyncLocalStorage token and cannot operate in a subsequent execution.
    while(token.operations.size)await Promise.allSettled([...token.operations]);
    if(value!==undefined&&!error)emit({type:'text',text:inspect(value,{depth:4,maxArrayLength:50,maxStringLength:12000})});
    token.closed=true;current=undefined;failure=undefined;
    parentPort.postMessage({type:'done',id:message.id,error});
  });
});
parentPort.postMessage({type:'ready'});
