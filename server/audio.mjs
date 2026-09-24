import {randomUUID} from 'node:crypto';
import {AudioReactive,validateAudioFeature} from '../shared/audio-reactive.mjs';
export class AudioSession {
  constructor(now=()=>performance.now()) {
    this.now=now;this.renderer=new AudioReactive();this.session=null;this.status='idle';this.error=null;
    this.native={available:false,systemSupported:false,devices:[],microphonePermission:false};this.nativeAt=-Infinity;
    this.lastSample=-Infinity;this.lastPacket=-Infinity;this.startedAt=0;this.paused=false;
  }
  inventory(value) {
    if(typeof value.systemSupported!=='boolean' || !Array.isArray(value.devices) || value.devices.length>100 || value.devices.some(d=>typeof d.id!=='string'||d.id.length>256||typeof d.name!=='string'||d.name.length>256))throw new Error('声音设备列表无效');
    this.native={available:true,systemSupported:value.systemSupported,devices:value.devices.map(d=>({id:d.id,name:d.name})),microphonePermission:value.microphonePermission===true};this.nativeAt=this.now();
  }
  start(config) {
    if(this.now()-this.nativeAt>12000)throw new Error('请在 NuPhyLab 桌面应用中使用声音律动');
    if(config.source==='system'&&!this.native.systemSupported)throw new Error('系统声音需要 macOS 14.2 或更新版本，请改用麦克风');
    if(config.source==='microphone'&&config.deviceId&&!this.native.devices.some(d=>d.id===config.deviceId))throw new Error('所选麦克风已断开，请重新选择');
    this.session=randomUUID();this.status='starting';this.error=null;this.startedAt=this.now();this.lastPacket=this.now();this.lastSample=-Infinity;this.paused=false;this.renderer.reset();
  }
  stop(error=null){this.session=null;this.paused=false;this.status=error?'error':'idle';this.error=error;this.renderer.reset();this.lastSample=-Infinity}
  ingest(packet) {
    if(!this.session || packet.session!==this.session || this.paused)return false;
    if(!['requesting','listening','error'].includes(packet.status))throw new Error('声音采集状态无效');
    const errors=['microphonePermission','inputUnavailable','systemCapture','systemFormat','systemPermission','systemUnsupported'];
    if(packet.status==='error') {this.error=errors.includes(packet.error)?packet.error:'systemCapture';this.status='error';return true}
    if(this.error)return false;
    if(packet.rms!==undefined){this.renderer.feed(validateAudioFeature(packet));this.lastSample=this.now()}
    this.status=packet.status;this.lastPacket=this.now();return true;
  }
  suspend(paused){
    if(paused===this.paused)return;
    this.paused=paused;this.renderer.reset();this.lastSample=-Infinity;this.lastPacket=this.now();
    if(!paused){this.status='starting';this.startedAt=this.now()}
  }
  expired(){return this.session&&!this.paused&&(this.error || this.now()-this.nativeAt>12000 || (this.status==='listening'&&this.now()-this.lastPacket>6000) || this.now()-this.startedAt>120000&&this.status!=='listening')}
  snapshot(config) {
    return {active:!!this.session,session:this.session,status:this.paused?'paused':this.status,error:this.error,level:this.renderer.level,bands:this.renderer.bands,
      ...this.native,available:this.native.available&&this.now()-this.nativeAt<12000,
      capture:{enabled:!!this.session&&!this.paused&&!this.error,session:this.session,source:config.source,deviceId:config.deviceId}};
  }
  render(config){return this.renderer.render(config,this.now(),this.now()-this.lastSample>350)}
}
