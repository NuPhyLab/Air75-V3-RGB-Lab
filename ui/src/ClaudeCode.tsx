import {useState} from "react";
import {t as tr, dateLocale} from "./i18n";
import {CLAUDE_STATUS_NAMES,claudeStatusColor} from "../../shared/claude-lighting.mjs";
import {claudeBindings} from "../../shared/claude-keys.mjs";
import {ClaudeStatusColors} from "./ClaudeStatusColors";
import {ClaudeLightMode} from "./ClaudeLightMode";
import {ClaudeSetup} from "./ClaudeSetup";
import {CodexKeyRecorder} from "./CodexKeyRecorder";
import {CodexSetup} from "./CodexSetup";
import {AgentSourceSwitch} from "./AgentSourceSwitch";
import {Activity,ArrowUpRight,CircleHelp,RefreshCw,RotateCcw} from "lucide-react";
import {Button,run,Switch} from "./primitives";
import type {AppState,Command,Notify,Task} from "./types";

function asObject(value:unknown):Record<string,unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
const STATUS_CLASS:Record<string,string> = {
  running:"thinking", awaitingApproval:"waiting", awaitingInput:"complete", error:"error", ended:"idle", unknown:"idle",
};
const TASK_ACTIONS = [
  ["openSession","打开对应会话"],
  ["focusApp","切换到 Claude 应用"],
  ["revealProject","打开项目文件夹"],
  ["copyResume","复制恢复命令"],
  ["selectOnly","仅选中会话"],
] as const;
function relative(value?:string|null) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleString(dateLocale(),{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
export function ClaudeCode({state,command,notify,focusColors}:{state:AppState|null;command:Command;notify:Notify;focusColors?:boolean}) {
  const [recording,setRecording]=useState<{group:"task"|"command";index:number}|null>(null);
  const [shortcutSearch,setShortcutSearch]=useState("");
  const claude=state?.claude,settings=state?.settings;
  const tasks=(claude?.tasks ?? []) as Task[];
  const slots=(claude?.slots ?? []) as (Task|null)[];
  const hooks=asObject(claude?.hooks);
  const lighting=asObject(claude?.lighting);
  const taskSource=asObject(claude?.taskSource);
  const quota=asObject(claude?.quota);
  const app=asObject(claude?.app);
  const commands=(claude?.commands ?? []) as {id:string;label:string;available?:boolean;reason?:string}[];
  const bindings=claudeBindings(settings);
  const keyState=asObject(claude?.keys ?? state?.codex.keys),keyHost=asObject(keyState.host);
  const permissions=asObject(asObject(state?.native).permissions || state?.native);
  const canSendSystemKeys=permissions.accessibility===true && permissions.canPostEvents===true;
  // A bound ordinary key is captured system-wide while the mode is on, so it
  // stops typing. Say so before the user wonders why a key went dead.
  const ordinaryKeys=bindings.filter(key=>!/^F([1-9]|1[0-2])$/.test(key.code));
  // The recorder saves on key release, so one stray press silently rebinds.
  const defaultKeys=bindings.every((key,index)=>key.code===`F${index+1}`);
  const failedKeys=Array.isArray(keyHost.failed) ? keyHost.failed as string[] : [];
  const source=String(settings?.claudeTaskSource ?? "recent");
  const bound=(settings?.claudeSlotIds ?? []) as string[];
  const commandIds=(settings?.claudeCommandIds ?? []) as string[];
  const wireless=state?.bluetooth?.connected===true && !state?.device.connected;
  const whole=settings?.claudeLightMode==="whole" && !wireless;
  const TaskContainer = whole ? "details" : "div";
  const setSettings=(value:Record<string,unknown>)=>run(command({op:"settings",settings:value}));
  const act=(body:Record<string,unknown>)=>command(body).catch((error:unknown)=>{
    notify(error instanceof Error ? error.message : tr("这个操作暂不可用"));
  });
  const changeKey=(group:"task"|"command",index:number)=><Button kind="ghost" className="codex-change-key"
    aria-label={tr(group==="task" ? `更改任务键 ${index+1}` : `更改命令键 ${index+1}`)} onClick={()=>setRecording({group,index})}>{tr("更改")}</Button>;
  return <>
    <header className="page-heading">
      <div>
        <h1>Claude Code</h1>
        <p>{tr("把本机会话的状态，留在指尖。")}</p>
      </div>
      <Button icon={<RefreshCw size={16}/>} onClick={()=>run(command({op:"refreshClaude"}))}>{tr("刷新状态")}</Button>
    </header>
    <AgentSourceSwitch state={state} command={command}/>
    <div className="integration-banner">
      <div className="integration-status">
        <Activity size={20}/>
        <div>
          <strong>{tr(claude?.available ? "已连接本机 Claude Code" : hooks.installed ? "会话状态暂不可用" : "尚未接入 Claude Code")}</strong>
          <p>{tr(claude?.available
            ? (taskSource.sessions ? "状态来自本机钩子事件与 Claude Code 的会话记录。" : String(taskSource.reason ?? "本机当前没有可显示的 Claude Code 会话"))
            : String(claude?.reason ?? "正在读取本机 Claude Code 状态…"))}</p>
        </div>
      </div>
      <Switch label={tr("Claude Code 模式")} checked={settings?.claudeEnabled===true}
        onChange={value=>run(command(value ? {op:"codexAdapt",source:"claude"} : {op:"settings",settings:{claudeEnabled:false}}))}/>
    </div>
    <p className="muted">{tr(settings?.claudeEnabled ? "开启时，绑定按键用于 Claude Code；关闭后恢复键盘原功能。" : "已关闭 Claude Code 模式，键盘使用原来的功能。")}</p>
    {failedKeys.length>0 && <div className="codex-key-warning" role="alert">
      <p>{tr("这些按键被系统占用，请更换绑定：")}{failedKeys.map(code=>tr(bindings.find(key=>key.code===code)?.label || code)).join("、")}</p>
      {failedKeys.some(code=>/^F([1-9]|1[0-2])$/.test(code)) && <p>{tr(canSendSystemKeys
        ? "macOS 保留了这些功能键；请改绑其他按键。"
        : "macOS 保留了这些功能键（例如 F11 的「显示桌面」）。授予辅助功能权限后 NuPhyLab 才能接收它们，也可以直接改绑其他按键。")}</p>}
      {!canSendSystemKeys && <Button onClick={()=>run(command({op:"openPermissionSettings",permission:"accessibility"}))}>{tr("允许辅助功能")}</Button>}
    </div>}
    <ClaudeSetup state={state} command={command}/>
    {settings?.claudeEnabled && <CodexSetup state={state} command={command} source="claude"/>}
    {!wireless && <ClaudeLightMode state={state} command={command}/>}
    <TaskContainer className={whole ? "product-details codex-task-shortcuts" : undefined}>
    {whole && <summary>{tr("会话快捷键")}</summary>}
    <section className="codex-slots">
      <div className="section-heading">
        <div>
          <h2>{tr("会话与按键")}</h2>
          <p className="muted">{tr("默认 F1–F6，直接按键或点击键帽选中并跳转到对应会话。")}</p>
        </div>
        <Button kind="ghost" icon={<RotateCcw size={14}/>} disabled={defaultKeys}
          title={tr(defaultKeys ? "任务键与命令键已是默认的 F1–F12" : undefined)}
          onClick={()=>setSettings({claudeTaskKeys:["F1","F2","F3","F4","F5","F6"],claudeCommandKeys:["F7","F8","F9","F10","F11","F12"]})}>{tr("恢复默认按键")}</Button>
        <label className="codex-source">{tr("会话来源")}<select aria-label={tr("会话来源")} value={source} onChange={e=>setSettings({claudeTaskSource:e.target.value})}>
          <option value="recent">{tr("最近会话")}</option><option value="active">{tr("仅进行中")}</option>
          <option value="attention">{tr("需要关注优先")}</option><option value="custom">{tr("自定义会话")}</option>
        </select></label>
      </div>
      <div className="micro-legend">
        {Object.entries(CLAUDE_STATUS_NAMES).filter(([id])=>id!=="unassigned").map(([id,label])=>
          <span key={id}><i style={{backgroundColor:claudeStatusColor({status:id},settings)}}/>{tr(label)}</span>)}
      </div>
      <div className="slot-list">
        {Array.from({length:6},(_,i)=>{
          const task=slots[i]?.id ? slots[i] : undefined;
          const status=String(task?.status ?? "unassigned");
          const selected=Boolean(task && lighting.selectedId===task.id);
          return <div className="slot-row" key={i}>
            <div className="codex-key-binding">
              <button className={`function-key micro-function-key ${selected ? "selected" : ""}`}
                style={{backgroundColor:claudeStatusColor(task,settings),color:["awaitingInput","ended"].includes(status) ? "#151514" : "#fff"}}
                aria-label={tr(`打开会话 ${i+1}`)} aria-current={selected ? "true" : undefined} disabled={!task}
                onClick={()=>run(act({op:"claudeAction",action:"task",sessionId:String(task?.id ?? "")}))}>{tr(bindings[i].label)}</button>
              {changeKey("task",i)}
            </div>
            <div className="slot-task">
              <label htmlFor={`claude-slot-${i}`}>{tr("会话")} {i+1}</label>
              {source==="custom" ? <select id={`claude-slot-${i}`} value={bound[i] || ""}
                onChange={e=>{
                  const next=Array.from({length:6},(_,n)=>bound[n] || "");
                  const duplicate=e.target.value ? next.indexOf(e.target.value) : -1;
                  if (duplicate>=0 && duplicate!==i) next[duplicate]=next[i];
                  next[i]=e.target.value;
                  setSettings({claudeSlotIds:next});
                }}>
                <option value="">{tr("未绑定")}</option>
                {tasks.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.title || tr("Claude Code 会话"))}</option>)}
                {bound[i] && !task && <option value={bound[i]}>{tr("已绑定会话（当前不可用）")}</option>}
              </select> : <strong translate="no" className="micro-task-title" title={String(task?.cwd ?? "")}>
                {String(task?.title ?? tr(source==="active" ? "暂无进行中的会话" : "暂无会话"))}</strong>}
              {task && <small className="claude-slot-detail">{tr(String(task.evidence ?? ""))}{task.eventAt ? ` · ${relative(String(task.eventAt))}` : ""}</small>}
            </div>
            <span className={`task-status ${task ? STATUS_CLASS[status] ?? "idle" : ""}`}>
              {selected && <small className="micro-selected-label">{tr("控制中 ·")}</small>}
              {tr(task ? CLAUDE_STATUS_NAMES[status] ?? status : "未绑定")}
            </span>
            <Button kind="ghost" icon={<ArrowUpRight size={17}/>} disabled={!task}
              onClick={()=>run(act({op:"claudeAction",action:"task",sessionId:String(task?.id ?? "")}))}>{tr("打开")}</Button>
          </div>;
        })}
      </div>
      {ordinaryKeys.length>0 && <p className="codex-key-warning" role="status">
        {tr("这些绑定是普通按键，开启本模式时会被全局接管，期间无法用它们正常输入：")}
        {ordinaryKeys.map(key=>tr(key.label)).join("、")}
      </p>}
      <label className="codex-source claude-task-action">{tr("任务键跳转")}<select aria-label={tr("任务键跳转")}
        value={String(settings?.claudeTaskAction ?? "openSession")} onChange={e=>setSettings({claudeTaskAction:e.target.value})}>
        {TASK_ACTIONS.map(([id,label])=><option key={id} value={id}>{tr(label)}</option>)}
      </select></label>
      {!app.installed && <p className="muted">{tr("这台电脑上没有找到 Claude 桌面应用，「切换到 Claude 应用」不可用。")}</p>}
    </section>
    </TaskContainer>
    <section className="micro-commands">
      <div className="section-heading"><div><h2>{tr("命令键")}</h2><p className="muted">{tr("默认 F7–F12，按键与执行的动作分别设置。")}</p></div></div>
      <div className="micro-command-grid">{Array.from({length:6},(_,i)=><div className="micro-command" key={i}>
        <div className="codex-key-binding"><kbd className="function-key">{tr(bindings[i+6].label)}</kbd>{changeKey("command",i)}</div>
        <select aria-label={tr(`命令键 ${i+1} 的动作`)} value={commandIds[i] ?? "none"} onChange={e=>{
          const next=Array.from({length:6},(_,n)=>commandIds[n] ?? "none");next[i]=e.target.value;setSettings({claudeCommandIds:next});
        }}>
          {commands.filter(item=>item.available!==false).map(item=><option key={item.id} value={item.id}>{tr(item.label)}</option>)}
        </select>
        <Button kind="ghost" onClick={()=>run(act({op:"claudeAction",action:commandIds[i] ?? "none"}))}>{tr("执行")}</Button>
      </div>)}</div>
      <p className="codex-command-note muted">{tr("命令键只在 NuPhyLab 内部切换会话、跳转或刷新状态，不会向 Claude Code 发送按键或输入。")}</p>
    </section>
    {!wireless && <section className="micro-settings">
      <div className="section-heading"><div><h2>{tr("状态灯")}</h2><p className="muted">{tr(whole ? "整把键盘跟随同一个会话的状态。" : "灯光跟随绑定的按键位置。")}</p></div>
        <Button kind="ghost" onClick={()=>run(command({op:"lightWake"}))}>{tr(state?.lightPower?.sleeping ? "唤醒灯光" : "重新计时")}</Button>
      </div>
      <div className="codex-light-settings">
        <div className="codex-light-column">
          <h3>{tr("显示效果")}</h3>
          <div className="codex-light-row codex-brightness"><label htmlFor="claude-brightness">{tr("状态灯亮度")}</label><strong>{Number(settings?.claudeBrightness ?? 100)}%</strong>
            <input id="claude-brightness" type="range" aria-label={tr("Claude Code 状态灯亮度")} min="0" max="100"
              value={Number(settings?.claudeBrightness ?? 100)} onChange={e=>setSettings({claudeBrightness:Number(e.target.value)})}/></div>
          <div className="codex-light-row"><Switch label={tr("控制会话呼吸")} checked={settings?.claudeSelectedPulse!==false} onChange={value=>setSettings({claudeSelectedPulse:value})}/></div>
          {!whole && <div className="codex-light-row"><Switch label={tr("命令键状态流光")} checked={Boolean(settings?.claudeAmbient)} onChange={value=>setSettings({claudeAmbient:value})}/>
            <p>{tr("开启后，命令键显示当前控制会话的提示与运行流光。")}</p></div>}
        </div>
      </div>
      <ClaudeStatusColors settings={settings ?? {}} command={command} focusOnMount={focusColors}/>
      <p className="codex-light-footnote muted">{tr("灯光时间统一在「设备」页设置，Claude Code 状态灯也一起休眠和唤醒。")}</p>
      {bindings.some(key=>key.ledIndex===null) && <p className="muted">{tr("Del 可执行按键动作，但该位置没有可独立控制的灯。")}</p>}
    </section>}
    {recording && <CodexKeyRecorder title={tr(recording.group==="task" ? `更改任务键 ${recording.index+1}` : `更改命令键 ${recording.index+1}`)}
      command={command} onSave={code=>command({op:"claudeBind",...recording,code})} onClose={()=>setRecording(null)}/>}
    <div className="codex-bottom">
      <section className="quota-section">
        <div className="section-heading"><h2>{tr("账户额度")}</h2><CircleHelp size={17} className="muted"/></div>
        <div className="quota-unavailable">
          <span>—</span>
          <p>{tr(String(quota.reason ?? "Claude Code 暂不支持读取账户剩余额度"))}</p>
        </div>
        <p className="quota-stale-note">{tr(String(quota.detail ?? ""))}</p>
      </section>
      <section className="shortcut-section">
        <h2>{tr("可执行的操作")}</h2>
        <details className="micro-shortcut-catalog"><summary>{tr("查看全部操作")}</summary>
          <input type="search" aria-label={tr("搜索 Claude Code 操作")} placeholder={tr("搜索操作")} value={shortcutSearch} onChange={e=>setShortcutSearch(e.target.value)}/>
          <div className="shortcut-list">
            {commands.filter(item=>tr(item.label).toLowerCase().includes(shortcutSearch.toLowerCase())).map(item=>
              <Button key={item.id} disabled={item.available===false} title={item.available===false ? tr(String(item.reason ?? "")) : undefined}
                onClick={()=>run(act({op:"claudeAction",action:item.id}))}><span>{tr(item.label)}</span></Button>)}
          </div>
          {commands.filter(item=>item.available===false).map(item=>
            <p className="muted shortcut-note" key={`${item.id}-reason`}>{tr(item.label)}{tr("：")}{tr(String(item.reason ?? ""))}</p>)}
        </details>
      </section>
    </div>
    <details className="micro-coverage"><summary>{tr("支持范围与限制")}</summary>
      <p>{tr("状态来自 NuPhyLab 安装的本地 Claude Code 钩子，加上 Claude Code 自己维护的本机会话记录。运行中、等待权限确认、本轮结束、出错、会话结束都对应真实事件；证据不足时显示「状态未确认」。")}</p>
      <p>{tr("Claude 停止本轮响应只表示这一轮结束，不代表整个项目完成；单次工具失败也不会把会话标成失败。")}</p>
      <p>{tr("桌面应用的会话可以切换到 Claude 应用；在终端里运行的会话无法可靠定位窗口，相关跳转会明确禁用，NuPhyLab 不会向终端发送按键。")}</p>
      <p>{tr("NuPhyLab 不会代替你批准或拒绝权限请求，也不会向会话发送输入。账户剩余额度没有可供第三方应用读取的官方接口，因此显示为暂不支持。")}</p>
    </details>
  </>;
}
