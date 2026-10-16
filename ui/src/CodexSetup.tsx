import {useEffect,useState} from 'react';
import {Check, CircleAlert, Keyboard, ArrowUpRight, RotateCcw} from 'lucide-react';
import {Button,Modal,run} from './primitives';
import {t} from './i18n';
import type {AppState,Command} from './types';

type Adaptation={status?:string;ready?:string[];unsupported?:string[];shared?:string[];mapped?:number;error?:string};
export function CodexSetup({state,command,source='codex'}:{state:AppState|null;command:Command;source?:'codex'|'claude'}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const enabled=state?.settings.codexKeyAdaptation===true;
  const a=(state?.codex.adaptation??{}) as Adaptation;
  const host=(state?.codex.keys as {host?:{registered:string[];failed:string[];suspended:boolean}}|undefined)?.host;
  const permissions=state?.native??{},input=permissions.inputMonitoring===true,
    access=permissions.accessibility===true&&permissions.canPostEvents===true;
  const wireless=state?.bluetooth?.connected===true&&!state?.device.connected;
  // An ad-hoc signed build gets a new code identity on every rebuild, so macOS
  // keeps the checkbox but stops honouring the grant. Say what to do about it.
  const adhoc=(state?.build as {adhoc?:boolean}|undefined)?.adhoc===true;
  const staleGrant=adhoc&&(!input||!access);
  const connected=state?.device.connected===true||wireless;
  const registered=host?.registered.length===12 && host.failed.length===0;
  const complete=enabled&&a.status==='ready'&&registered&&host?.suspended!==true&&input&&access;
  const title=!enabled?(wireless?'蓝牙快捷控制':source==='claude'?'让功能键控制 Claude Code':'让功能键控制 Codex'):complete?(wireless?'蓝牙按键适配已就绪':'按键适配已就绪'):a.status==='partial'?'部分按键需要设置':a.status==='permissions'?'完成授权后自动继续':a.status==='waitingDevice'?'等待连接键盘':a.status==='error'?'按键适配未完成':a.status==='paused'?'按键适配已暂停':'正在检查按键适配';
  const act=async(op:string)=>{setBusy(true);try{await command({op});}finally{setBusy(false);}};
  const begin=()=>{setOpen(true);run(act('codexAdapt'));};
  useEffect(()=>{
    if(!open)return;
    const refresh=()=>{void command({op:'refreshPermissions'}).catch(()=>{});};
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  },[open,command]);
  const openDriver=async()=>{
    await act('codexAdaptDriver');
    window.location.assign('https://drive.nuphy.io/');
  };
  const row=(label:string,ok:boolean,detail:string,action?:React.ReactNode)=><div className="codex-setup-row">
    {ok?<Check size={17}/>:<CircleAlert size={17}/>}<div><strong>{t(label)}</strong><p>{t(detail)}</p></div>{action}
  </div>;
  return <>
    <section className="codex-setup-banner" aria-label={t('键盘适配')}>
      <Keyboard size={19}/><div><strong>{t(title)}</strong><p>{t(wireless?'保留任务跳转与命令键；键盘状态灯需要 USB 有线连接。':!enabled?'F1–F12 仍在调亮度或音量？一键检查并适配。':complete?'已记住设置，下次连接自动恢复。':'查看检查结果，完成剩余设置。')}</p></div>
      <Button busy={busy} onClick={enabled?()=>setOpen(true):begin}>{t(wireless?'连接与按键':enabled?'查看适配':'适配这把键盘')}</Button>
    </section>
    {open&&<Modal title={t('键盘适配')} onClose={()=>setOpen(false)}>
      <div className="codex-setup-dialog">
        <p className="muted">{t(wireless?'蓝牙使用已有的任务和命令绑定，不改写键盘键位。':'只适配通过 USB 连接的 Air75 V3，保留你的任务和命令绑定。')}</p>
        {row('键盘连接',connected,wireless?'Air75 V3 蓝牙已连接':connected?'Air75 V3 已连接':'连接 USB 或蓝牙后重新检查。',!connected&&<Button busy={busy} onClick={()=>run(act('refreshBluetooth'))}>{t('检查连接')}</Button>)}
        {row('输入监控',input,input?'已允许':'用于接收并适配功能键。',!input&&<Button onClick={()=>run(command({op:'openPermissionSettings',permission:'inputMonitoring'}))}>{t('允许')}</Button>)}
        {row('辅助功能',access,access?'已允许':source==='claude'?'命令动作不需要此权限；macOS 保留的功能键（如 F11）需要它才能接收。':'用于执行 Codex 命令。',!access&&<Button onClick={()=>run(command({op:'openPermissionSettings',permission:'accessibility'}))}>{t('允许')}</Button>)}
        {wireless ? <>{row('功能键配置',a.status==='ready',a.status==='ready'?'系统已确认蓝牙功能键兼容设置。':'连接并授权后自动检查。')}<div className="codex-setup-help"><p>{t('兼容标准 F1–F12，以及发送 F13–F24 的扩展功能键模式。仍可点击「更改」绑定其他按键。')}</p><p>{t('如果按键仍在调节亮度或音量，请使用标准 F 键的 Fn 组合，或更改绑定。')}</p></div></> : row('功能键配置',a.status==='ready',a.status==='ready'?(a.mapped?'系统已确认功能键转换。':'当前已经是标准功能键。'):a.unsupported?.length?'以下按键需要在官方驱动中设置为对应的标准 F 键。':a.status==='error'?'暂时无法完成，请查看下方原因。':'连接并授权后自动检查。')}
        {!!a.unsupported?.length&&<div className="codex-setup-help"><div className="codex-setup-key-list">{a.unsupported.map(code=><kbd key={code}>{code}</kbd>)}</div><p>{t('官方驱动 → 按键设置 → 当前模式的基础层：将这些位置设为同名 F 键，完成后返回连接。')}</p><Button icon={<ArrowUpRight size={14}/>} busy={busy} onClick={()=>run(openDriver())}>{t('打开官方按键设置')}</Button></div>}
        {row('快捷键注册',registered,host?.failed.length?'部分按键尚未接管；请确认授权后重新检查。':registered?'12 个快捷键已注册。':host?.suspended?'编辑或游戏期间暂时暂停。':'等待应用注册快捷键。')}
        {!!host?.failed.length&&<p className="muted">{host.failed.join(' · ')}</p>}
        {staleGrant&&<div className="codex-setup-help">
          <p>{t('这个安装包使用 ad-hoc 本机签名，重新打包后代码标识会改变。如果系统设置里已经勾选却仍显示未允许，请在该列表中选中 NuPhyLab 点「−」移除，再用「＋」重新添加并勾选。')}</p>
          <p>{t('用 Apple 开发者证书重新打包可以避免这一步；届时授权一次即可长期有效。')}</p>
        </div>}
        {a.error&&<p className="codex-key-warning" role="alert">{t(a.error)}</p>}
        {!!a.shared?.length&&<p className="muted">{t('媒体键转换也会作用于本键盘上执行相同功能的按键或旋钮；关闭适配即可恢复。')}</p>}
        <details className="product-details"><summary>{t('适配说明')}</summary>
          <label>{t('关闭模式后')} <select aria-label={t('关闭模式后的功能')} value={state?.settings.codexKeycapFallback?'keycaps':'device'} onChange={e=>run(command({op:'settings',settings:{codexKeycapFallback:e.target.value==='keycaps'}}))}>
            <option value="device">{t('键盘当前配置')}</option><option value="keycaps">{t('键帽上的原厂功能')}</option>
          </select></label>
          <p>{t('键帽功能兼容用于 F13–F24 扩展层，需要保持 NuPhyLab 运行；退出应用后使用键盘自身配置。')}</p>
          <p>{t('原厂 F4 会临时切换为标准 F4，关闭模式或退出时恢复。意外拔线后，重新接回原 USB 接口即可恢复。')}</p><p>{t(source==='claude'?'就绪表示键位配置和系统注册通过检查；Claude Code 模式的命令都在本机执行。':'就绪表示键位配置和系统注册通过检查；具体命令还取决于 Codex 当前页面与权限。')}</p></details>
        <div className="codex-setup-actions">
          {enabled&&<Button kind="ghost" icon={<RotateCcw size={14}/>} busy={busy} onClick={()=>run(act('codexAdaptRestore'))}>{t('恢复原有按键')}</Button>}
          <Button kind="primary" busy={busy} onClick={enabled?()=>run(act('codexAdaptCheck')):begin}>{t(enabled?'重新检查':'适配这把键盘')}</Button>
        </div>
      </div>
    </Modal>}
  </>;
}
