import { tools } from './tools.mjs';
import { coreDocumentation, appDocumentation } from './documentation.mjs';

const error = (code, message) => Object.assign(new Error(message), {code});
function options(value, allowed) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('INVALID_ARGUMENT','Options must be an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw error('UNSUPPORTED_OPTION',`Unsupported option: ${key}`);
  return value;
}
export function createCua({request, emit}) {
  const native = async (method, params={}) => {
    const schema = tools.find(t=>t.method===method)?.schema;
    return request(method, schema ? schema.parse(params) : params);
  };
  const documented = new Set();
  const doc = text => { if (!documented.has(text)) {documented.add(text);emit({type:'text',text});} };
  const display = (value, opts) => {if (opts?.emit !== false) emit({type:'text',text:typeof value==='string'?value:JSON.stringify(value,null,2)}); return value;};
  async function inventory() {
    const {windows}=await native('windows');
    const {apps}=await native('apps');
    for(const w of windows) if(!apps.some(a=>a.pid===w.pid)) apps.push({pid:w.pid,bundleId:w.bundleId,name:w.app});
    return {apps:apps.map(a=>({...a,id:a.bundleId??String(a.pid),windows:windows.filter(w=>w.pid===a.pid)})),windows};
  }
  class App {
    #target; #snapshot; #lines; #scale={x:1,y:1}; #dimensions;
    constructor(target) {this.#target=Object.freeze({pid:target.pid,windowId:target.windowId});this.pid=target.pid;this.windowId=target.windowId;}
    async #live() {
      const {windows}=await native('windows',{pid:this.pid});
      const w=windows.find(w=>w.windowId===this.windowId);
      if(!w) {this.#snapshot=undefined;throw error('WINDOW_GONE','Bound window disappeared; choose a fresh target');}
      return w;
    }
    #ref(index) {
      if(!Number.isInteger(index)||index<0||!this.#snapshot) throw error('INVALID_ELEMENT','Observe this app before using a numeric element index');
      const node=this.#snapshot.nodes.find(n=>n.id===`e${index}`);
      if(!node) throw error('INVALID_ELEMENT',`Index ${index} was not present in the latest observation`);
      return {snapshotId:this.#snapshot.snapshotId,elementId:node.id};
    }
    async #point(point) {
      if(!Array.isArray(point)||point.length!==2||!point.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)) throw error('INVALID_COORDINATE','Expected [x,y] with finite nonnegative coordinates');
      const w=await this.#live();
      if(this.#dimensions&&(w.frame.width!==this.#dimensions.width||w.frame.height!==this.#dimensions.height)) throw error('STALE_GEOMETRY','Window resized since observation; get a fresh screenshot or AX state');
      const [x,y]=[point[0]/this.#scale.x,point[1]/this.#scale.y];
      if(x>=w.frame.width||y>=w.frame.height) throw error('INVALID_COORDINATE','Point lies outside the bound window');
      return {x,y};
    }
    async #observe(screenshot, opts={}) {
      options(opts,['emit','disableDiffing','maxDimension']);
      const snap=await native('snapshot',{...this.#target,screenshot,maxDimension:opts.maxDimension??1600});
      this.#snapshot=snap; this.#dimensions=snap.window.frame;
      this.#scale=snap.screenshot?{x:snap.screenshot.scaleX,y:snap.screenshot.scaleY}:{x:1,y:1};
      const lines=snap.nodes.map(n=>{const {id,depth,parent,...rest}=n;return `${'  '.repeat(depth)}[${id.slice(1)}] ${JSON.stringify(rest)}`;});
      const header=`Window ${this.windowId} pid ${this.pid} ${JSON.stringify(snap.window.title??'')} (${snap.window.frame.width}x${snap.window.frame.height} logical points)${snap.truncated?' [TRUNCATED]':''}`;
      let state;
      if(this.#lines&&!opts.disableDiffing) {
        const changes=[];
        for(let i=0;i<Math.max(lines.length,this.#lines.length);i++) if(lines[i]!==this.#lines[i]) changes.push(lines[i]===undefined?`- [${i}] removed`:`${this.#lines[i]===undefined?'+':'~'} ${lines[i]}`);
        state=header+'\nAX diff (indices refer to latest tree):\n'+(changes.join('\n')||'(no changes)');
      } else state=header+'\nAX tree:\n'+lines.join('\n');
      this.#lines=lines;display(state,opts);
      if(snap.screenshotError) display({screenshotError:snap.screenshotError},opts);
      if(snap.screenshot&&opts.emit!==false) emit({type:'image',data:snap.screenshot.data,mimeType:snap.screenshot.mimeType});
      return {state,...(snap.screenshot?{screenshot:Buffer.from(snap.screenshot.data,'base64')}:{})};
    }
    async getAXState(opts) {return (await this.#observe(false,opts)).state;}
    async getAXStateAndScreenshot(opts) {return this.#observe(true,opts);}
    async getScreenshot(opts={}) {
      options(opts,['emit','maxDimension']);
      const {screenshot:s}=await native('screenshot',{...this.#target,maxDimension:opts.maxDimension??1600});
      this.#scale={x:s.scaleX,y:s.scaleY};this.#dimensions=s.frame;
      if(opts.emit!==false){display({windowId:this.windowId,width:s.width,height:s.height,scaleX:s.scaleX,scaleY:s.scaleY,coordinates:'screenshot pixels',agentCursorIncluded:false},opts);emit({type:'image',data:s.data,mimeType:s.mimeType});}
      return Buffer.from(s.data,'base64');
    }
    async #action(method,args) {
      await this.#live();
      const result=await native(method,args);
      try {await this.getAXState();} catch(e) {emit({type:'text',text:`Action completed, observation failed: ${e.code??e.name}: ${e.message}. Observe before retrying.`});}
      return result;
    }
    async click(target,opts={}) {
      options(opts,['mouseButton','clickCount','strategy','key','durationMs']);
      if(opts.key||opts.durationMs) throw error('UNSUPPORTED_OPTION','Modifier clicks and hold duration are not implemented');
      const at=Array.isArray(target)?{...this.#target,...await this.#point(target)}:this.#ref(target);
      return this.#action('click',{...at,button:opts.mouseButton??'left',count:opts.clickCount??1,strategy:opts.strategy??'auto'});
    }
    async drag(from,to,opts={}) {
      options(opts,['duration']);const a=await this.#point(from),b=await this.#point(to);
      return this.#action('drag',{...this.#target,fromX:a.x,fromY:a.y,toX:b.x,toY:b.y,duration:opts.duration??0.4});
    }
    async scroll(target,direction,pages=1) {
      if(!['up','down','left','right'].includes(direction)||typeof pages!=='number'||!Number.isFinite(pages)||pages<=0||pages>10)throw error('INVALID_ARGUMENT','Use up/down/left/right with pages >0 and <=10');
      const w=await this.#live();let at;
      if(Array.isArray(target))at=await this.#point(target);
      else {this.#ref(target);const n=this.#snapshot.nodes[target];if(!n.frame)throw error('NO_ELEMENT_FRAME','Element has no frame');at={x:n.frame.x+n.frame.width/2,y:n.frame.y+n.frame.height/2};}
      const vertical=['up','down'].includes(direction);const delta=Math.round((vertical?w.frame.height:w.frame.width)*0.8*pages)*(direction==='down'||direction==='right'?-1:1);
      return this.#action('scroll',{...this.#target,...at,deltaX:vertical?0:delta,deltaY:vertical?delta:0});
    }
    async typeText(text,opts={}) {options(opts,['strategy']);return this.#action('type_text',{...this.#target,text,strategy:opts.strategy??'auto'});}
    async pressKey(key,opts={}) {options(opts,['strategy','durationMs']);if(opts.durationMs)throw error('UNSUPPORTED_OPTION','Key hold duration is not implemented');return this.#action('key',{...this.#target,key,strategy:opts.strategy??'auto'});}
    async paste(text,opts={}) {options(opts,['format']);if(opts.format&&opts.format!=='text')throw error('UNSUPPORTED_FORMAT','Only plain text paste via AX insertion is implemented');return this.typeText(text);}
    async selectText(index,text,opts={}) {options(opts,['prefix','suffix','selectionType']);return this.#action('select_text',{...this.#ref(index),text,prefix:opts.prefix,suffix:opts.suffix,selection:opts.selectionType??'text'});}
    async setValue(index,value) {return this.#action('ax_action',{...this.#ref(index),action:'setValue',value});}
    async performSecondaryAction(index,action) {return this.#action('ax_action',{...this.#ref(index),action});}
    async move(point) {const at=await this.#point(point);return native('cursor',{...this.#target,...at});}
  }
  return Object.freeze({
    bootstrap(){doc(coreDocumentation);},
    async rewriteDocumentation(){for(const text of documented)emit({type:'text',text});},
    async getState(opts={}) {options(opts,['emit']);return display({...await inventory(),status:await native('status')},opts);},
    async initialize(){return this.getState();},
    async listApps(opts={}) {options(opts,['emit']);return display((await inventory()).apps,opts);},
    async listWindows(opts={}) {options(opts,['emit']);return display((await native('windows')).windows,opts);},
    async status(opts={}) {options(opts,['emit']);return display(await native('status'),opts);},
    async requestPermissions(opts) {return display(await native('request_permissions',opts));},
    async launchApp(bundleId,opts={}) {options(opts,['allowVisibleWindows']);return display(await native('launch',{bundleId,allowVisibleWindows:opts.allowVisibleWindows??false}));},
    async getApp(reference) {
      const {windows,apps}=await inventory();let matches;
      if(typeof reference==='string') {
        const needle=reference.toLowerCase();const pids=apps.filter(a=>[a.id,a.bundleId,a.name,a.displayName,a.path].some(v=>v?.toLowerCase()===needle)).map(a=>a.pid);
        matches=windows.filter(w=>pids.includes(w.pid)||[w.app,w.bundleId].some(v=>v?.toLowerCase()===needle));
      } else if(reference&&Number.isInteger(reference.windowId)&&Object.keys(reference).every(k=>['windowId','pid'].includes(k)))matches=windows.filter(w=>w.windowId===reference.windowId&&(reference.pid===undefined||w.pid===reference.pid));
      else throw error('INVALID_ARGUMENT','Use an exact app name/bundle/path or {windowId,pid?}');
      if(matches.length!==1)throw error(matches.length?'AMBIGUOUS_APP':'APP_NOT_FOUND',`Expected one window, found ${matches.length}; inspect cua.listWindows() and select {windowId,pid}. No app was launched.`);
      doc(appDocumentation);const app=new App(matches[0]);await app.getAXState({disableDiffing:true});return app;
    },
    async cursorState(){return display(await native('cursor_state'));},
    async hideCursor(){return native('cursor_hide');}
  });
}
