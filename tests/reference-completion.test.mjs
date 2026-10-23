import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceCompletion} from '../scripts/reference-completion.mjs';
// A complete measured scenario; do not synthesize the required names from the implementation.
const names=['nav','type','selectAll','top','drag','scroll','capture','click','setValue','selectText'];
const scenario=()=>({mode:'independent',steps:names.map((name,i)=>({name,status:'passed',epoch:100+i})),observedFrom:99,observedUntil:110,isolated:true});
test('reference differences are retained while independent regressions fail the process',()=>{
 const run=scenario();run.steps[1].status='failed';
 assert.deepEqual(referenceCompletion(run),{status:'completed-with-differences',uncoveredSteps:[],exitCode:1});
 assert.equal(referenceCompletion({...run,mode:'original'}).exitCode,0);
});
test('repeating a passing checkpoint cannot replace a missing behavior',()=>{
 const run=scenario();run.steps[1].name='nav';
 assert.equal(referenceCompletion(run).status,'inconclusive-incomplete');assert.equal(referenceCompletion(run).exitCode,1);
});
test('observer expiry cannot turn unobserved late actions into isolation passes',()=>{
 const run=scenario();run.observedUntil=105;
 assert.deepEqual(referenceCompletion(run),{status:'inconclusive-observer-coverage',uncoveredSteps:['capture','click','setValue','selectText'],exitCode:1});
});
test('an observed isolation failure is not hidden by missing later coverage',()=>{
 const run=scenario();run.observedUntil=105;run.isolated=false;
 assert.equal(referenceCompletion(run).status,'failed-isolation');assert.equal(referenceCompletion(run).exitCode,1);
});
test('complete evidence succeeds but absent timing evidence fails closed',()=>{
 const run=scenario();assert.equal(referenceCompletion(run).status,'passed');assert.equal(referenceCompletion(run).exitCode,0);
 delete run.observedFrom;assert.equal(referenceCompletion(run).status,'inconclusive-observer-coverage');assert.equal(referenceCompletion(run).exitCode,1);
});
