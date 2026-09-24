import {layout,blank,heart} from './layout.mjs';
import {scaleColor} from './render-animation.mjs';
import {AUDIO_EFFECTS} from './audio-effects.mjs';
import {AudioBeatDetector} from './audio-beat.mjs';
import {hsvToHex} from './color.mjs';
const effectIds=new Set(AUDIO_EFFECTS.map(effect=>effect.id));
const heartIndices=new Set(heart('#ffffff').flatMap((color,index)=>color==='#ffffff'?[index]:[]));
const clamp=value=>Math.max(0,Math.min(1,value));
export const DEFAULT_AUDIO = {source:'system',deviceId:'',effect:'pulse',colorMode:'single',color:'#6f9e85',sensitivity:1.5,noiseFloor:-55};
// Color is a separate layer: switching palettes must not change the beat
// detector, brightness envelope, particle lifetime or unlit keys.
function colorfulColor(effect,key,phase) {
  const x=key.x+key.w/2,y=key.y+key.h/2,flow=phase*28;
  let hue=x*24+y*9+flow;
  if(effect==='spectrum'||effect==='rain')hue=Math.min(7,Math.floor(x/2))*40+8;
  else if(effect==='mirror')hue=Math.abs(x-8)*38+flow;
  else if(effect==='ripple')hue=Math.hypot(x-8,(y-3)*1.4)*34-flow;
  else if(effect==='sparkle')hue=key.index*137.508+flow;
  else if(effect==='heartbeat')hue=(x-8)*55+y*15+flow;
  else if(effect==='split')hue=(x<8?5+x*5:170+(x-8)*10)+y*4;
  return hsvToHex({h:hue,s:0.9,v:1});
}
export function validateAudio(input={},previous=DEFAULT_AUDIO) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('声音律动设置无效');
  const next={...DEFAULT_AUDIO,...previous};
  for(const [key,value] of Object.entries(input)) {
    if(key==='source' && ['system','microphone'].includes(value)) next[key]=value;
    else if(key==='effect' && effectIds.has(value)) next[key]=value;
    else if(key==='colorMode' && ['single','colorful'].includes(value)) next[key]=value;
    else if(key==='deviceId' && typeof value==='string' && value.length<=256) next[key]=value;
    else if(key==='color' && typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value)) next[key]=value.toLowerCase();
    else if(key==='sensitivity' && Number.isFinite(value) && value>=0.25 && value<=4) next[key]=value;
    else if(key==='noiseFloor' && Number.isFinite(value) && value>=-80 && value<=-20) next[key]=value;
    else throw new Error('声音律动设置无效');
  }
  return next;
}
export function validateAudioFeature(value) {
  if(!value || !Number.isFinite(value.rms) || value.rms<0 || value.rms>1 || !Array.isArray(value.bands) || value.bands.length!==8 || value.bands.some(n=>!Number.isFinite(n)||n<0||n>1))
    throw new Error('声音分析数据无效');
  return {rms:value.rms,bands:[...value.bands]};
}
export class AudioReactive {
  constructor() {this.reset()}
  reset(){
    this.level=0;this.bands=Array(8).fill(0);this.drive=0;this.peak=0.04;
    this.lastTime=null;this.lastBeat=-Infinity;this.beats=new AudioBeatDetector();
    this.ripples=[];this.drops=[];this.stars=[];this.comets=[];this.lastSpawn=-Infinity;
    this.sequence=0;this.lastSequence=-1;this.effect=null;this.phase=0;this.seed=0x75a3;
    this.sample={rms:0,bands:Array(8).fill(0)};
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296}
  feed(value){this.sample=validateAudioFeature(value);this.sequence++}
  render(config,now,stale=false) {
    const dt=Math.min(250,Math.max(0,this.lastTime===null ? 50 : now-this.lastTime));this.lastTime=now;
    const noise=10**(config.noiseFloor/20);
    const normalize=n=>Math.min(1,Math.pow(Math.max(0,n-noise),0.45)*config.sensitivity);
    const level=stale ? 0 : normalize(this.sample.rms);
    const blend=(old,next)=>old+(next-old)*(1-Math.exp(-dt/(next>old ? 45 : 170)));
    this.level=blend(this.level,level);
    this.bands=this.bands.map((old,i)=>blend(old,stale ? 0 : normalize(this.sample.bands[i])));
    // Keep a slowly decaying peak BEFORE compression/clipping. This preserves
    // musical dynamics even when the old gain curve would stay near full light.
    const raw=stale?0:Math.max(0,this.sample.rms-noise);
    this.peak=Math.max(0.04,raw,this.peak*Math.exp(-dt/3500));
    const target=Math.pow(clamp(raw/this.peak*config.sensitivity/1.5),1.65);
    this.drive+=(target-this.drive)*(1-Math.exp(-dt/(target>this.drive?30:95)));
    this.phase+=dt/1000*(0.45+this.level*1.5);
    const changed=this.effect!==config.effect;
    if(changed){this.effect=config.effect;this.ripples=[];this.drops=[];this.stars=[];this.comets=[];this.lastSpawn=-Infinity}
    if(!stale && (this.sequence!==this.lastSequence||changed)){
      const energy=normalize(Math.max(...this.sample.bands,this.sample.rms*0.4));
      if(this.beats.update(this.sample,now,config)){
        const strength=Math.max(0.55,energy);
        this.ripples.push({time:now,strength});this.comets.push({time:now,strength,row:Math.floor(this.random()*6)});this.lastBeat=now;
      }
      this.lastSequence=this.sequence;
    }
    this.ripples=this.ripples.filter(r=>now-r.time<1000);
    this.comets=this.comets.filter(c=>now-c.time<1250);
    this.drops=this.drops.filter(d=>now-d.time<1600);
    this.stars=this.stars.filter(s=>now-s.time<850);
    if(!stale&&this.drive>0.035&&now-this.lastSpawn>170-this.level*110){
      if(config.effect==='rain'){
        const total=this.bands.reduce((sum,v)=>sum+v,0);let pick=this.random()*total,band=0;
        for(;band<7;band++){pick-=this.bands[band];if(pick<=0)break}
        this.drops.push({time:now,x:band*2+this.random()*2,strength:Math.max(0.3,this.drive)});
      }else if(config.effect==='sparkle'){
        for(let i=0;i<1+Math.floor(this.level*3);i++)this.stars.push({time:now,index:Math.floor(this.random()*83),strength:Math.max(0.3,this.drive)});
      }
      this.lastSpawn=now;
    }
    const frame=blank();
    for(const key of layout) {
      if(key.index>=83)continue;
      const x=key.x+key.w/2,y=key.y+key.h/2;
      let amount=this.drive;
      if(config.effect==='spectrum') {
        const band=Math.min(7,Math.floor((key.x+key.w/2)/16*8));
        const height=this.bands[band]*6;
        amount=Math.min(1,Math.max(0,height-(5-key.y)));
      } else if(config.effect==='ripple') {
        const distance=Math.hypot(x-8,(y-3)*1.4);
        amount=this.ripples.reduce((peak,r)=>{
          const progress=(now-r.time)/1000;
          return Math.max(peak,Math.max(0,1-Math.abs(distance-progress*11)/1.7)*(1-progress)*r.strength);
        },0);
      } else if(config.effect==='mirror') {
        amount=clamp(this.drive*8.5-Math.abs(x-8))*Math.max(0.3,this.drive);
      } else if(config.effect==='wave') {
        const center=3+Math.sin(x*0.65-this.phase*3)*2.1;
        amount=Math.max(0,1-Math.abs(y-center)/1.25)*this.drive;
      } else if(config.effect==='rain') {
        amount=this.drops.reduce((peak,d)=>{
          const head=(now-d.time)/1600*9-0.5,trail=head-y;
          return Math.max(peak,Math.max(0,1-Math.abs(x-d.x)/1.2)*(trail>=-0.6&&trail<2.5?Math.exp(-Math.max(0,trail)*1.2):0)*d.strength);
        },0);
      } else if(config.effect==='comet') {
        amount=this.comets.reduce((peak,c)=>{
          const progress=(now-c.time)/1250,head=progress*21-1,trail=head-x;
          return Math.max(peak,(trail>=-0.6&&trail<5?Math.exp(-Math.max(0,trail)*0.65):0)*Math.max(0,1-Math.abs(y-(c.row+0.5))/1.6)*c.strength*(1-progress*0.6));
        },0);
      } else if(config.effect==='sparkle') {
        amount=this.stars.reduce((peak,s)=>s.index===key.index?Math.max(peak,Math.sin((now-s.time)/850*Math.PI)*s.strength):peak,0);
      } else if(config.effect==='heartbeat') {
        amount=heartIndices.has(key.index)?this.ripples.reduce((peak,r)=>{
          const age=now-r.time;
          const first=Math.exp(-Math.pow((age-80)/90,2)),second=0.75*Math.exp(-Math.pow((age-330)/110,2));
          return Math.max(peak,Math.max(first,second)*r.strength);
        },0):0;
      } else if(config.effect==='split') {
        const strength=x<8?Math.max(...this.bands.slice(0,3)):Math.max(...this.bands.slice(4,8));
        amount=clamp(strength*6-(5-key.y))*Math.max(0.35,strength);
      }
      const color=config.colorMode==='colorful'?colorfulColor(config.effect,key,this.phase):config.color;
      frame[key.index]=scaleColor(color,amount<0.005?0:amount);
    }
    return frame;
  }
}
