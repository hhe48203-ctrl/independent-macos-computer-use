import { Bridge } from '../src/bridge.mjs';
const bridge = new Bridge();
try { console.log(JSON.stringify(await bridge.request('status'), null, 2)); }
catch (error) { console.error(`${error.code}: ${error.message}`); process.exitCode = 1; }
finally { bridge.close(); }
