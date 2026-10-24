import test from 'node:test';import assert from 'node:assert/strict';import {piServerEnvironment} from '../scripts/pi-policy.mjs';
test('real background events never implicitly enable app-local input-context activation',()=>{
 for(const args of [[],['--background-events']]){
  const env=piServerEnvironment({CU_EXPERIMENTAL_APPKIT_FOCUS:'1',CU_ALLOWED_BUNDLE_IDS:'owned.test',CUSTOM:'kept'},args);
  assert.equal(env.CU_EXPERIMENTAL_APPKIT_FOCUS,'0');assert.equal(env.CU_ENABLE_FOREGROUND,'0');assert.equal(env.CU_ALLOWED_BUNDLE_IDS,'owned.test');assert.equal(env.CUSTOM,'kept');
 }
 assert.equal(piServerEnvironment({},['--experimental-appkit-focus']).CU_EXPERIMENTAL_APPKIT_FOCUS,'1');
});
