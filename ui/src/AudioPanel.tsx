import {useEffect,useRef,useState} from 'react';
import {AudioLines,Mic,Monitor,Play,Square,SlidersHorizontal,ArrowUpRight,Check} from 'lucide-react';
import {Keyboard} from './Keyboard';
import {ColorWheel} from './ColorWheel';
import {Button,run} from './primitives';
import {t} from './i18n';
import type {AppState,Command,Key} from './types';
import type {HSV} from '../../shared/color.mjs';
import {AUDIO_EFFECTS} from '../../shared/audio-effects.mjs';
import type {AudioEffect} from '../../shared/audio-effects.mjs';
export type AudioConfig={source:'system'|'microphone';deviceId:string;effect:AudioEffect;colorMode:'single'|'colorful';color:string;sensitivity:number;noiseFloor:number};
export type AudioState={active:boolean;available:boolean;systemSupported:boolean;status:string;error:string|null;level:number;bands:number[];devices:{id:string;name:string}[]};
const defaults:AudioConfig={source:'system',deviceId:'',effect:'pulse',colorMode:'single',color:'#6f9e85',sensitivity:1.5,noiseFloor:-55};
const errorText:Record<string,string>={microphonePermission:'请允许 NuPhyLab 使用麦克风，然后重新开始。',inputUnavailable:'麦克风不可用，请检查连接或选择其他设备。',systemCapture:'系统声音暂不可用，请检查录音权限后重试。',systemPermission:'请允许 NuPhyLab 录制系统声音，然后重新开始。',systemFormat:'当前输出设备的音频格式暂不支持，请切换输出设备。',systemUnsupported:'系统声音需要 macOS 14.2 或更新版本，请改用麦克风',keyboardDisconnected:'键盘已断开，声音采集已停止。',lightingFailed:'灯效输出已停止，请检查键盘连接后重试。',captureStopped:'声音采集已中断，请重新开始。'};
export function AudioPanel({state,layout,command}:{state:AppState|null;layout:Key[];command:Command}){
  const saved=state?.settings.audio as AudioConfig|undefined;
  const audio=state?.audio as AudioState|undefined;
  const [config,setConfig]=useState<AudioConfig>(saved??defaults),[busy,setBusy]=useState(false);
  const saving=useRef(false);
  const memory=useRef<HSV|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),patch=useRef<Partial<AudioConfig>>({});
  useEffect(()=>{if(saved && !saving.current && !Object.keys(patch.current).length)setConfig(saved)},[saved]);
  const flush=async()=>{if(timer.current)clearTimeout(timer.current);const value=patch.current;patch.current={};if(Object.keys(value).length){saving.current=true;try{await command({op:'settings',settings:{audio:value}})}finally{saving.current=false}}};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);const value=patch.current;patch.current={};if(Object.keys(value).length)void command({op:'settings',settings:{audio:value}}).catch(()=>{});},[command]);
  const change=(value:Partial<AudioConfig>)=>{setConfig(c=>({...c,...value}));patch.current={...patch.current,...value};if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>run(flush()),180)};
  const start=async()=>{setBusy(true);try{await flush();await command({op:audio?.active?'audioStop':'audioStart'})}finally{setBusy(false)}};
  const permission=async()=>{
    const bridge=(window as Window & {webkit?:{messageHandlers?:{audioControl?:{postMessage:(value:unknown)=>Promise<unknown>}}}}).webkit?.messageHandlers?.audioControl;
    if(bridge)await bridge.postMessage({permission:config.source==='microphone'?'microphone':'system'});
  };
  const status=audio?.status==='paused'?'随键盘休眠':audio?.status==='requesting'?'等待声音权限':audio?.status==='starting'?'正在连接声音':audio?.active?'正在聆听':'尚未开始';
  const unavailable=!state?.device.connected?'声音律动需要 USB 有线连接':!audio?.available?'请在 NuPhyLab 桌面应用中使用声音律动':config.source==='system'&&!audio.systemSupported?'系统声音需要 macOS 14.2 或更新版本，请改用麦克风':null;
  return <section className="audio-page studio-page">
    <header className="page-heading"><div><h1>{t('声音律动')}</h1><p>{t('让声音，在键盘上流动。')}</p></div><Button kind="primary" icon={audio?.active?<Square size={16}/>:<Play size={16}/>} busy={busy} disabled={!audio?.active&&!!unavailable} onClick={()=>run(start())}>{t(audio?.active?'停止律动':'开始律动')}</Button></header>
    {unavailable&&<div className="wireless-notice" role="status">{t(unavailable)}</div>}
    {audio?.error&&<div className="audio-error" role="alert"><span>{t(errorText[audio.error]??errorText.captureStopped)}</span>{['microphonePermission','systemPermission','systemCapture'].includes(audio.error)&&<Button icon={<ArrowUpRight size={14}/>} onClick={()=>run(permission())}>{t('系统设置')}</Button>}</div>}
    <div className="audio-stage">
      <div className="audio-stage-heading"><span><AudioLines size={16}/>{t(status)}</span>{audio?.status==='paused'&&<Button kind="ghost" onClick={()=>run(command({op:'lightWake'}))}>{t('唤醒灯光')}</Button>}<div className="audio-meter" role="meter" aria-label={t('声音电平')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((audio?.level??0)*100)}><i style={{width:`${(audio?.level??0)*100}%`}}/></div></div>
      <div className="keyboard-area"><Keyboard layout={layout} colors={audio?.active?state?.colors??[]:Array(84).fill('#000000')} sideColor="#000000"/></div>
      <p className="audio-caption">{t(audio?.active?'主键区正在跟随声音，Codex 快捷键仍可使用。':'播放音乐，或让麦克风听见你的声音。')}</p>
    </div>
    <section className="audio-effect-picker" aria-label={t('律动效果')}>
      <h3>{t('律动效果')}<span>{AUDIO_EFFECTS.length}</span></h3>
      <div className="audio-effects">{AUDIO_EFFECTS.map(({id,label,description})=><button key={id} aria-pressed={config.effect===id} title={t(description)} onClick={()=>change({effect:id})}><span>{t(label)}</span>{config.effect===id&&<Check size={14} aria-hidden="true"/>}</button>)}</div>
      <p className="audio-effect-description">{t(AUDIO_EFFECTS.find(effect=>effect.id===config.effect)?.description??AUDIO_EFFECTS[0].description)}</p>
    </section>
    <div className="audio-controls">
      <section><h3>{t('声音来源')}</h3><div className="audio-source" role="group" aria-label={t('声音来源')}>
        <button aria-pressed={config.source==='system'} disabled={!!audio?.active} onClick={()=>change({source:'system'})}><Monitor size={16}/>{t('系统声音')}</button>
        <button aria-pressed={config.source==='microphone'} disabled={!!audio?.active} onClick={()=>change({source:'microphone'})}><Mic size={16}/>{t('麦克风')}</button>
      </div>{config.source==='microphone'?<label className="form-field"><span>{t('输入设备')}</span><select aria-label={t('输入设备')} disabled={!!audio?.active} value={config.deviceId} onChange={e=>change({deviceId:e.target.value})}><option value="">{t('系统默认麦克风')}</option>{config.deviceId&&!audio?.devices.some(d=>d.id===config.deviceId)&&<option value={config.deviceId}>{t('所选设备已断开')}</option>}{audio?.devices.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label>:<p className="muted">{t('直接跟随电脑播放的声音，戴耳机也可以。')}</p>}</section>
      <section className="audio-color"><h3>{t('颜色')}</h3>
        <div className="audio-source" role="group" aria-label={t('颜色模式')}>
          <button aria-pressed={config.colorMode!=='colorful'} onClick={()=>change({colorMode:'single'})}><i className="audio-color-dot" style={{background:config.color}} aria-hidden="true"/>{t('单色')}</button>
          <button aria-pressed={config.colorMode==='colorful'} onClick={()=>change({colorMode:'colorful'})}><i className="audio-color-dot audio-color-gradient" aria-hidden="true"/>{t('彩色')}</button>
        </div>
        {config.colorMode==='colorful'?<div className="audio-palette"><div className="audio-color-gradient" aria-hidden="true"/><p className="muted">{t('多种颜色随声音流动，安静时熄灭。')}</p></div>:<ColorWheel color={config.color} onChange={color=>change({color})} memory={memory}/>}
      </section>
    </div>
    <details className="audio-adjust"><summary><SlidersHorizontal size={15}/>{t('调整响应')}</summary><div className="audio-sliders"><label><span>{t('灵敏度')}<output>{config.sensitivity.toFixed(2)}×</output></span><input aria-label={t('灵敏度')} type="range" min="0.25" max="4" step="0.05" value={config.sensitivity} onChange={e=>change({sensitivity:Number(e.target.value)})}/></label><label><span>{t('忽略低于此音量的声音')}<output>{config.noiseFloor} dB</output></span><input aria-label={t('噪声门限')} type="range" min="-80" max="-20" step="1" value={config.noiseFloor} onChange={e=>change({noiseFloor:Number(e.target.value)})}/></label></div></details>
    {['ripple','comet','heartbeat'].includes(config.effect)&&<p className="muted">{t('想跟上更轻的鼓点，可在「调整响应」中提高灵敏度；跳动太密时调低。')}</p>}
    <p className="audio-footnote">{t('声音仅在本机分析，不保存或上传。灯光时间沿用设备页设置；休眠时暂停采集。')}</p>
  </section>;
}
