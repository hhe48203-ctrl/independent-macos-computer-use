import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function connectRepl(env,server=root+'src/server.mjs',cwd=root) {
  const client=new Client({name:'repl-acceptance',version:'1'});const calls=[];
  await client.connect(new StdioClientTransport({command:process.execPath,args:[server],cwd,env}));
  return {client,calls,async evaluate(expression){
    const code=`nodeRepl.write('RESULT '+JSON.stringify(await (${expression}))); undefined`;
    const result=await client.callTool({name:'js',arguments:{code}});calls.push({code,result});
    if(result.isError)throw Object.assign(Error(result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n')),{result});
    const content=result.content.find(c=>c.type==='text'&&c.text.startsWith('RESULT '));
    if(!content)throw Error('Missing explicit evaluation result');
    return JSON.parse(content.text.slice(7));
  }};
}
export function parseAX(state) {
  return {nodes:state.split('\n').filter(line=>/^\s*\[\d+\] \{/.test(line)).map(line=>({id:Number(line.match(/\[(\d+)\]/)[1]),...JSON.parse(line.slice(line.indexOf('{')))}))};
}
