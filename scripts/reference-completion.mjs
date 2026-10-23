// Completion rules are shared by the live controller and offline evidence review.
export const requiredReferenceSteps=Object.freeze(['nav','type','selectAll','top','drag','scroll','capture','click','setValue','selectText']);
export function referenceCompletion({mode,steps,observedFrom,observedUntil,isolated}) {
  const complete=steps.length===requiredReferenceSteps.length&&steps.every((s,i)=>s.name===requiredReferenceSteps[i]);
  const validInterval=Number.isFinite(observedFrom)&&Number.isFinite(observedUntil)&&observedUntil>=observedFrom;
  const uncoveredSteps=steps.filter(s=>!validInterval||!Number.isFinite(s.epoch)||s.epoch<observedFrom||s.epoch>observedUntil).map(s=>s.name);
  const status=!isolated?'failed-isolation':!complete?'inconclusive-incomplete':uncoveredSteps.length?'inconclusive-observer-coverage':steps.every(s=>s.status==='passed')?'passed':'completed-with-differences';
  return {status,uncoveredSteps,exitCode:status==='passed'||mode==='original'&&status==='completed-with-differences'?0:1};
}
