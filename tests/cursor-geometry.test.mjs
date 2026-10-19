import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
test('native cursor conversion supports negative/multidisplay coordinates and continuous eased motion',{skip:process.platform!=='darwin'},()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'cu-cursor-geometry-'));
  try {
    const source=readFileSync(new URL('../native/AgentCursor.swift',import.meta.url),'utf8');
    const main=`import AppKit
typealias Object=[String:Any]
func rectJSON(_ r:CGRect)->Object{["x":r.minX,"y":r.minY,"width":r.width,"height":r.height]}
struct BridgeError:Error{init(_ c:String,_ m:String){}}
${source}
@main struct Test {
  @MainActor static func main(){
    for (global,expected) in [(CGPoint(x:360,y:314),CGPoint(x:336,y:586)),(CGPoint(x:-100,y:200),CGPoint(x:-124,y:700)),(CGPoint(x:2100,y:-800),CGPoint(x:2076,y:1700)),(CGPoint(x:500,y:1500),CGPoint(x:476,y:-600))] {
      precondition(AgentCursor.appKitOrigin(global:global,primaryTop:956)==expected)
    }
    let from=CGPoint(x:-100,y:300),to=CGPoint(x:1200,y:50)
    let points=(0...60).map{AgentCursor.interpolate(from:from,to:to,progress:Double($0)/60)}
    precondition(points.first==from && points.last==to)
    for i in 1..<points.count {precondition(points[i].x>points[i-1].x && points[i].y<points[i-1].y);precondition(hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)<40)}
    precondition(AgentCursor.motionDuration(distance:10)<AgentCursor.motionDuration(distance:800))
    precondition(AgentCursor.motionDuration(distance:8000)<=0.55)
    print("geometry and motion passed")
  }
}`;
    const file=path.join(directory,'main.swift');writeFileSync(file,main);
    const compiled=spawnSync('xcrun',['swiftc','-parse-as-library','-swift-version','5',file,'-o',path.join(directory,'test')],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
    const run=spawnSync(path.join(directory,'test'),[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
