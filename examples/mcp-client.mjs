import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const client = new Client({ name: 'independent-agent', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))] }));
try {
  for (const name of ['cu_status', 'cu_apps']) {
    const result = await client.callTool({ name, arguments: {} });
    console.log(JSON.stringify(result.structuredContent ?? result.content));
  }
  // Choose an observed window, then:
  // await client.callTool({name:'cu_snapshot',arguments:{pid,windowId,screenshot:false}});
} finally { await client.close(); }
