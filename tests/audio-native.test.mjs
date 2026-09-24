import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AudioBeatDetector} from '../shared/audio-beat.mjs';
import {DEFAULT_AUDIO} from '../shared/audio-reactive.mjs';
test('native PCM analyser resolves low/mid/high bands at 44.1/48 kHz and keeps silence zero',{skip:process.platform!=='darwin'},async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nuphylab-audio-unit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=`import Foundation
func check(_ condition:Bool,_ text:String){if !condition{fatalError(text)}}
for rate:Double in [44100,48000] {
 for (frequency,band) in [(60.0,0),(240.0,2),(1000.0,4),(4000.0,6),(8000.0,7)] {
  let analyzer=AudioFeatureAnalyzer()
  let samples=(0..<2048).map{Float(sin(Double($0)*frequency*2*Double.pi/rate)*0.4)}
  let result=analyzer.consume(samples,rate:rate,now:0)!
  let rms=result["rms"] as! Double,bands=result["bands"] as! [Double]
  check(abs(rms-0.4/sqrt(2))<0.02,"RMS amplitude")
  check(bands.firstIndex(of:bands.max()!)==band,"frequency band")
  check(analyzer.consume(samples,rate:rate,now:0.01)==nil,"coalesces audio buffers")
  check(analyzer.consume(samples,rate:rate,now:0.05) != nil,"emits at lighting cadence")
 }
}
let silent=AudioFeatureAnalyzer().consume(Array(repeating:Float(0),count:2048),rate:48000,now:0)!
check(silent["rms"] as! Double==0,"silence RMS")
check((silent["bands"] as! [Double]).allSatisfy{$0==0},"silence spectrum")
let invalid=AudioFeatureAnalyzer().consume(Array(repeating:Float.nan,count:2048),rate:48000,now:0)!
check(invalid["rms"] as! Double==0,"invalid PCM sanitized")
print("audio-analysis-passed")
// Real PCM through the same analyser as system/microphone capture: sustained
// bass plus regular kicks, including 200 ms attacks at the lighting cadence.
for rate:Double in [44100,48000] {
 for period in [500,200] {
  let analyzer=AudioFeatureAnalyzer()
  for now in stride(from:0,to:5000,by:50) {
   let pcm=(0..<Int(rate*0.05)).map { index -> Float in
    let t=Double(now)/1000+Double(index)/rate
    let phase=(t*1000).truncatingRemainder(dividingBy:Double(period))
    let kick=phase<100 ? 0.5*exp(-phase/80)*sin(t*60*2*Double.pi) : 0
    return Float(0.28*sin(t*110*2*Double.pi)+kick)
   }
   var frame=analyzer.consume(pcm,rate:rate,now:Double(now)/1000)!
   frame["now"]=now;frame["rate"]=rate;frame["period"]=period
   print(String(data:try! JSONSerialization.data(withJSONObject:frame),encoding:.utf8)!)
  }
 }
}
`;
 const main=path.join(dir,'main.swift'),binary=path.join(dir,'check');await writeFile(main,source);
 await promisify(execFile)('swiftc',[main,fileURLToPath(new URL('../native/AudioCapture.swift',import.meta.url)),'-o',binary,'-framework','AppKit','-framework','AVFoundation','-framework','CoreAudio','-framework','Accelerate']);
 const output=(await promisify(execFile)(binary)).stdout;
 assert.match(output,/audio-analysis-passed/);
 const frames=output.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 for(const rate of [44100,48000])for(const period of [500,200]){
  const detector=new AudioBeatDetector(),beats=[];
  for(const frame of frames.filter(f=>f.rate===rate&&f.period===period))if(detector.update(frame,frame.now,DEFAULT_AUDIO))beats.push(frame.now);
  assert.equal(beats.length,5000/period,`PCM ${rate} Hz / ${period} ms: ${beats}`);
  assert(beats.every((now,i)=>Math.abs(now-i*period)<=50),'beat detection stays within one analysis frame');
 }
});
