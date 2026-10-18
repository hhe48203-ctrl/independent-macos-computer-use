import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
test('keyboard routing distinguishes auxiliary theft, user transitions and unresolved queries',{skip:process.platform!=='darwin'},()=>{
  mkdirSync(path.join(root,'.build'),{recursive:true});
  const executable=path.join(mkdtempSync(path.join(root,'.build/focus-policy-')),'test');
  const build=spawnSync('xcrun',['swiftc','-swift-version','5',path.join(root,'native/FocusObservation.swift'),path.join(root,'tests/native-focus-policy.swift'),'-o',executable],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(executable,[],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/PASS stable route/);
});
