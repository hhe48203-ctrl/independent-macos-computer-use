import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('production cursor glyph and glow obey the visibility clip in offscreen Retina rendering',{skip:process.platform!=='darwin'},()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'cu-cursor-render-'));
  try{
    const source=readFileSync(new URL('../native/AgentCursor.swift',import.meta.url),'utf8');
    const main=`import AppKit
typealias Object=[String:Any]
func rectJSON(_ r:CGRect)->Object{[:]}
struct BridgeError:Error{init(_ c:String,_ m:String){}}
${source}
@main struct Test {
  @MainActor static func main(){
    // No NSWindow is created or ordered by this raster test.
    let _=NSApplication.shared
    NSApp.setActivationPolicy(.prohibited)
    func render(_ style:AgentCursorStyle,_ rects:[CGRect]?,_ scale:Int)->NSBitmapImageRep {
      let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:80*scale,pixelsHigh:80*scale,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
      bitmap.size=NSSize(width:80,height:80)
      NSGraphicsContext.saveGraphicsState()
      let context=NSGraphicsContext(bitmapImageRep:bitmap)!
      NSGraphicsContext.current=context
      // bitmap.size already establishes logical-point/backing-pixel scale.
      context.cgContext.translateBy(x:0,y:80);context.cgContext.scaleBy(x:1,y:-1)
      let view=AgentCursorView(frame:NSRect(x:0,y:0,width:80,height:80));view.style=style;view.clipRects=rects
      view.draw(view.bounds);context.flushGraphics()
      NSGraphicsContext.restoreGraphicsState()
      return bitmap
    }
    func counts(_ bitmap:NSBitmapImageRep,_ scale:Int)->(Int,Int){
      var left=0,right=0
      for y in 0..<bitmap.pixelsHigh {for x in 0..<bitmap.pixelsWide {
        if (bitmap.colorAt(x:x,y:y)?.alphaComponent ?? 0)>0.01 {
          if x<28*scale {left+=1}else{right+=1}
        }
      }}
      return (left,right)
    }
    for scale in [1,2] {for style in [AgentCursorStyle.ring,.arrow] {
      let full=counts(render(style,nil,scale),scale)
      precondition(full.0>10 && full.1>10,"always mode must draw the full glyph/glow: \\(style) \\(scale) \\(full)")
      let partial=counts(render(style,[CGRect(x:0,y:0,width:28,height:80)],scale),scale)
      precondition(partial.0>10 && partial.1==0,"glyph and shadow must have zero pixels past the clip")
      let hidden=counts(render(style,[],scale),scale)
      precondition(hidden.0==0 && hidden.1==0,"an empty visible region must draw nothing")
      let slices=counts(render(style,[CGRect(x:0,y:0,width:28,height:15),CGRect(x:0,y:20,width:28,height:60)],scale),scale)
      precondition(slices.0>0 && slices.1==0)
      print(style.rawValue,scale,"full",full,"partial",partial,"hidden",hidden)
    }}
  }
}`;
    const file=path.join(directory,'main.swift'),binary=path.join(directory,'test');writeFileSync(file,main);
    const compile=spawnSync('xcrun',['swiftc','-parse-as-library','-swift-version','5',file,'-o',binary],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
    const run=spawnSync(binary,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
    assert.match(run.stdout,/arrow 2/);assert.match(run.stdout,/ring 2/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
