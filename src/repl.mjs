import { Worker } from 'node:worker_threads';
import { NativeError } from './bridge.mjs';

const fault=(code,message)=>new NativeError(code,message);
export class CuaRepl {
  constructor(bridge,{workerURL=new URL('./repl-worker.mjs',import.meta.url),maxOutputBytes=8*1024*1024}={}) {
    this.bridge=bridge;this.workerURL=workerURL;this.maxOutputBytes=maxOutputBytes;
    this.worker=null;this.active=null;this.queue=Promise.resolve();this.generation=0;this.sequence=0;this.closed=false;this.retiring=Promise.resolve();
  }
  start() {
    if(this.closed)throw fault('REPL_CLOSED','REPL is closed');
    if(this.worker)return;
    const worker=new Worker(this.workerURL,{stdout:true,stderr:true,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});this.worker=worker;
    const output=text=>{if(this.active)this.output({type:'text',text:String(text)},this.active.id);};
    worker.stdout.on('data',output);worker.stderr.on('data',output);
    worker.on('message',message=>{
      if(this.worker!==worker)return;
      if(message.type==='output'){this.output(message.content,message.execution);return;}
      if(message.type==='native'){
        const call=this.active;
        if(!call||call.id!==message.execution) {worker.postMessage({type:'nativeResult',id:message.id,error:{code:'EXECUTION_ENDED',message:'Execution no longer active'}});return;}
        void this.bridge.request(message.method,message.params,{signal:call.controller.signal}).then(result=>{
          if(this.worker===worker&&this.active===call)worker.postMessage({type:'nativeResult',id:message.id,result});
        },error=>{if(this.worker===worker&&this.active===call)worker.postMessage({type:'nativeResult',id:message.id,error:{code:error.code??'NATIVE_ERROR',message:error.message}});});
        return;
      }
      if(message.type==='done'&&this.active?.id===message.id){
        const call=this.active;this.active=null;call.finish(message.error);
      }
    });
    worker.on('error',error=>{if(this.worker===worker)void this.invalidate(fault('WORKER_ERROR',error.message));});
    worker.on('exit',code=>{if(this.worker===worker)void this.invalidate(fault('WORKER_EXITED',`JavaScript worker exited (${code}); bindings cleared. Observe before retrying.`));});
  }
  output(content,id) {
    const call=this.active;if(!call||call.id!==id)return;
    if(!content||!['text','image'].includes(content.type))return;
    const size=Buffer.byteLength(content.text??content.data??'');
    call.bytes+=size;
    if(call.bytes>this.maxOutputBytes||call.content.length>=256){void this.invalidate(fault('OUTPUT_LIMIT','REPL output limit exceeded; bindings cleared.'));return;}
    call.content.push(content);
  }
  async invalidate(error=fault('REPL_RESET','REPL reset; bindings and native session cleared. Actions already delivered may have completed.')) {
    this.generation++;
    const worker=this.worker;this.worker=null;
    const call=this.active;this.active=null;
    call?.controller.abort();this.bridge.stop(error);
    const previous=this.retiring;
    this.retiring=Promise.allSettled([previous,worker?.terminate(),this.bridge.retiring]);
    call?.finish({code:error.code,message:error.message});
    await this.retiring;
  }
  execute(code,{timeoutMs=30000,signal}={}) {
    const generation=this.generation;
    const run=async()=>{
      await this.retiring;
      if(this.closed)throw fault('REPL_CLOSED','REPL is closed');
      if(signal?.aborted)throw fault('CANCELLED','Cancelled before execution');
      if(generation!==this.generation)throw fault('SESSION_CHANGED','REPL changed while queued; bindings cleared');
      this.start();
      return new Promise(resolve=>{
        const id=++this.sequence;const controller=new AbortController();
        const abort=()=>void this.invalidate(fault('CANCELLED','Execution cancelled; bindings cleared and native work stopped. Observe before retrying.'));
        const timer=setTimeout(()=>void this.invalidate(fault('JS_TIMEOUT','Execution timed out; bindings cleared and native work stopped. Observe before retrying.')),timeoutMs);
        const call={id,controller,bytes:0,content:[],finish:error=>{
          clearTimeout(timer);signal?.removeEventListener('abort',abort);
          const content=call.content;if(error)content.push({type:'text',text:JSON.stringify({error})});
          if(!content.length)content.push({type:'text',text:'(completed)'});
          resolve({content,...(error?{isError:true}:{}),structuredContent:{execution:id,generation:this.generation,...(error?{error}:{})}});
        }};
        this.active=call;signal?.addEventListener('abort',abort,{once:true});this.worker.postMessage({type:'execute',id,code});
      });
    };
    const result=this.queue.then(run);this.queue=result.catch(()=>{});return result;
  }
  async reset() {await this.invalidate();return {content:[{type:'text',text:'REPL reset. Variables, app objects, pending native work and agent cursor cleared.'}]};}
  async close() {this.closed=true;await this.invalidate(fault('REPL_CLOSED','Server closed'));this.bridge.close();await this.bridge.retiring;}
}
