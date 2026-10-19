import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const client=new Client({name:'independent-agent',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))]}));
try {
  console.log((await client.listTools()).tools.map(t=>t.name)); // js, js_reset
  const state=await client.callTool({name:'js',arguments:{code:'await cua.getState(); undefined'}});
  for(const item of state.content)if(item.type==='text')console.log(item.text);
  // After choosing an observed window:
  // await client.callTool({name:'js',arguments:{code:'let app=await cua.getApp({windowId:123,pid:456})'}});
  // await client.callTool({name:'js',arguments:{code:'await app.getAXStateAndScreenshot(); undefined'}});
  // The same app variable persists across these calls.
} finally {await client.close();}
