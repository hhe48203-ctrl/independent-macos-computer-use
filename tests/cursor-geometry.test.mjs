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
    let target=CGRect(x:-100,y:100,width:400,height:300),footprint=CGRect(x:0,y:150,width:80,height:80)
    let screens=[CGRect(x:-200,y:0,width:1000,height:900)]
    func visible(_ point:CGPoint,_ covers:[CGRect],_ area:CGRect=footprint)->[CGRect]{AgentCursorRegion.visible(footprint:area,point:point,target:target,covers:covers,screens:screens)}
    let point=CGPoint(x:24,y:174)
    precondition(visible(point,[])==[footprint])
    precondition(visible(point,[target]).isEmpty)
    let cover=CGRect(x:30,y:100,width:200,height:300),clipped=visible(point,[cover])
    precondition(clipped==[CGRect(x:0,y:150,width:30,height:80)])
    precondition(visible(CGPoint(x:31,y:174),[cover]).isEmpty)
    let holes=[CGRect(x:40,y:160,width:10,height:10),CGRect(x:60,y:190,width:30,height:80)]
    let regions=visible(point,holes)
    precondition(!regions.isEmpty)
    for r in regions {precondition(footprint.contains(r));for hole in holes {precondition(r.intersection(hole).isEmpty || r.intersection(hole).isNull)}}
    precondition(abs(regions.reduce(0){$0+$1.width*$1.height}-5500)<0.01)
    precondition(visible(CGPoint(x:-90,y:174),[],CGRect(x:-114,y:150,width:80,height:80))==[CGRect(x:-100,y:150,width:66,height:80)])
    precondition(AgentCursorRegion.visible(footprint:footprint,point:point,target:target,covers:[],screens:[]).isEmpty)
    precondition(AgentCursorRegion.visible(footprint:footprint,point:point,target:target,covers:[],screens:[CGRect(x:0,y:100,width:40,height:200)])==[CGRect(x:0,y:150,width:40,height:80)])
    print("geometry and motion passed")
  }
}`;
    const file=path.join(directory,'main.swift');writeFileSync(file,main);
    const compiled=spawnSync('xcrun',['swiftc','-parse-as-library','-swift-version','5',file,'-o',path.join(directory,'test')],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
    const run=spawnSync(path.join(directory,'test'),[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
