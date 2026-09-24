// Detect attacks before the display gain curve compresses/clips the signal.
// Each band releases independently, so a sustained bass cannot hide a snare.
export class AudioBeatDetector {
  constructor(){this.reset()}
  reset(){
    this.previous=Array(9).fill(0);this.average=Array(9).fill(0);
    this.peaks=Array(9).fill(0);this.held=Array(9).fill(false);
    this.lastTime=null;this.lastBeat=-Infinity;
  }
  update(sample,now,{noiseFloor,sensitivity}){
    if(this.lastTime!==null&&now-this.lastTime>350)this.reset();
    const elapsed=this.lastTime===null?50:Math.max(0,now-this.lastTime);
    this.lastTime=now;
    const noise=10**(noiseFloor/20),gain=sensitivity/1.5;
    const threshold=Math.min(0.55,Math.max(0.08,0.16/gain**0.65));
    const floor=Math.max(0.001,noise*0.6)/Math.sqrt(gain);
    const release=Math.min(0.12,Math.max(0.04,threshold*0.45));
    const values=[sample.rms,...sample.bands].map(n=>sample.rms>noise?Math.max(0,n-noise):0);
    let onset=false;
    values.forEach((value,i)=>{
      if(this.held[i]){
        this.peaks[i]=Math.max(this.peaks[i],value);
        if(value<this.peaks[i]*(1-release))this.held[i]=false;
      }
      const rise=value-this.previous[i];
      const contrast=Math.max(value-this.average[i],rise);
      if(!this.held[i]&&value>floor*2.5
        &&rise>Math.max(floor,this.previous[i]*threshold*0.3)
        &&contrast>Math.max(floor,Math.max(this.average[i],this.previous[i])*threshold)){
        onset=true;this.held[i]=true;this.peaks[i]=value;
      }
      this.average[i]+=(value-this.average[i])*(1-Math.exp(-elapsed/350));
    });
    this.previous=values;
    // Coalesce adjacent bands belonging to one attack; 150–200 ms drum hits
    // can still each produce a visible wave at the keyboard's 20 Hz cadence.
    if(!onset||now-this.lastBeat<140)return false;
    this.lastBeat=now;
    return true;
  }
}
