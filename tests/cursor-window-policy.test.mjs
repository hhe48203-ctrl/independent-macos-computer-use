// Regression for the occlusion test setup that briefly raised owned windows.
// These are API-boundary guards: cursor rendering never needs to order another
// process's window, and background fixtures must not elevate their level.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('cursor and background test setup cannot introduce target raising APIs',()=>{
  const cursor=readFileSync(new URL('../native/AgentCursor.swift',import.meta.url),'utf8');
  assert.doesNotMatch(cursor,/\.order\s*\(|kAXRaiseAction|\.activate\s*\(/,'cursor must not perform relative ordering, AX Raise or activation');
  const fixture=readFileSync(new URL('../native/BackgroundFixture.swift',import.meta.url),'utf8');
  assert.doesNotMatch(fixture,/\.level\s*=/,'owned fixtures must stay at the ordinary window level');
  const background=fixture.split('if CommandLine.arguments.contains("--background") {')[1]?.split('} else {')[0];
  assert.ok(background,'background startup branch must be inspected');
  assert.doesNotMatch(background,/orderFront|makeKey|activate\s*\(/,'background test setup must not bring owned windows forward');
  assert.match(background,/window\.orderBack\(nil\)/);
});
