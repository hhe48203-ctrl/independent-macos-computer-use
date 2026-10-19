// Test-only stdio entry point for an explicitly selected development helper.
import path from 'node:path';import {createServer} from '../src/server.mjs';import {Bridge} from '../src/bridge.mjs';import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
if(!process.env.CU_TEST_NATIVE_HELPER)throw Error('CU_TEST_NATIVE_HELPER must select a development build');
const {server,runtime}=createServer(new Bridge({executable:path.resolve(process.env.CU_TEST_NATIVE_HELPER)}));let stopping;
function shutdown(){return stopping??=(async()=>{await runtime.close();await server.close()})()}
process.once('SIGTERM',()=>{void shutdown().finally(()=>process.exit(0))});process.once('SIGINT',()=>{void shutdown().finally(()=>process.exit(0))});process.stdin.once('end',()=>{void shutdown()});
await server.connect(new StdioServerTransport());
