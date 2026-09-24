import { t as tr, dateLocale } from "./i18n";
import { useState } from "react";
import { STATUS_NAMES, statusColor } from "../../shared/codex-lighting.mjs";
import {codexBindings} from "../../shared/codex-keys.mjs";
import {CodexStatusColors} from "./CodexStatusColors";
import {CodexLightMode} from "./CodexLightMode";
import {CodexKeyRecorder} from "./CodexKeyRecorder";
import {CodexSetup} from './CodexSetup';
import {AgentSourceSwitch} from './AgentSourceSwitch';
import { Activity, ArrowUpRight, CircleHelp, RefreshCw } from "lucide-react";
import { Button, Empty, run, Switch } from "./primitives";
import type { AppState, Command, Task } from "./types";
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const taskId = (task: Task) => String(task.threadId || task.id || "");
const statusNames: Record<string, string> = {
  running: "思考中",
  working: "思考中",
  in_progress: "思考中",
  thinking: "思考中",
  completed: "已完成",
  complete: "已完成",
  idle: "空闲",
  waiting: "等待确认",
  needsInput: "等待输入",
  unknown: "状态未知",
  unassigned: "未绑定",
  needs_attention: "等待确认",
  approval: "等待确认",
  error: "发生错误",
  failed: "发生错误",
  interrupted: "已暂停",
};
function statusClass(value: string) {
  if (["running", "working", "thinking", "in_progress"].includes(value))
    return "thinking";
  if (["completed", "complete"].includes(value)) return "complete";
  if (["error", "failed"].includes(value)) return "error";
  if (["waiting", "needsInput", "needs_attention", "approval"].includes(value))
    return "waiting";
  return "idle";
}
type QuotaWindow = {
  name: string;
  used: number | null;
  resetsAt?: number | string;
};
function quotaWindows(value: unknown): QuotaWindow[] {
  const q = asObject(value),
    result: QuotaWindow[] = [];
  const add = (name: string, v: unknown, includeUnknown = false) => {
    const item = asObject(v);
    const raw = item.usedPercent ?? item.used_percent;
    const remaining = item.remainingPercent ?? item.remaining_percent;
    const used =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : typeof remaining === "number" && Number.isFinite(remaining)
          ? 100 - remaining
          : null;
    if (used === null && !includeUnknown) return;
    const minutes = Number(item.windowDurationMins ?? item.window_minutes ?? 0);
    const duration =
      minutes === 300
        ? "5 小时"
        : minutes === 10080
          ? "每周"
          : minutes > 0
            ? `${minutes / 60} 小时`
            : "";
    result.push({
      name: String(
        item.label || item.name || [name, duration].filter(Boolean).join(" · "),
      ),
      used: used === null ? null : Math.max(0, Math.min(100, used)),
      resetsAt: (item.resetsAt ?? item.resets_at) as
        | number
        | string
        | undefined,
    });
  };
  if (Array.isArray(q.buckets)) {
    q.buckets.forEach((bucket) => {
      const b = asObject(bucket);
      if (Array.isArray(b.windows))
        b.windows.forEach((window) =>
          add(String(b.label || b.id || "Codex"), window, true),
        );
    });
    return result;
  }
  if (Array.isArray(q.windows)) {
    q.windows.forEach((v, i) => add(`额度 ${i + 1}`, v));
    return result;
  }
  const buckets = asObject(q.rateLimitsByLimitId);
  if (Object.keys(buckets).length) {
    Object.entries(buckets).forEach(([id, v]) => {
      const b = asObject(v);
      if (b.primary) add(id === "codex" ? "5 小时" : id, b.primary);
      if (b.secondary)
        add(id === "codex" ? "每周" : `${id} · 每周`, b.secondary);
    });
    return result;
  }
  const base = asObject(q.rateLimits || q);
  if (base.primary) add("5 小时", base.primary);
  if (base.secondary) add("每周", base.secondary);
  if (!result.length) add("可用额度", q);
  return result;
}
function resetText(value?: string | number) {
  if (value === undefined) return "";
  const date = new Date(
    typeof value === "number" && value < 1e12 ? value * 1000 : value,
  );
  return Number.isNaN(date.getTime())
    ? ""
    : `${date.toLocaleString(dateLocale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 重置`;
}
export function Codex({
  state,
  command,
  focusColors,
}: {
  state: AppState | null;
  command: Command;
  focusColors?: boolean;
}) {
  const [shortcutSearch, setShortcutSearch] = useState("");
  const [recording,setRecording] = useState<{group:"task"|"command";index:number}|null>(null);
  const codex = state?.codex,
    settings = state?.settings,
    tasks = codex?.tasks || [],
    slots = settings?.slotIds || [],
    quota = asObject(codex?.quota),
    windows =
      quota.available === false && !quota.stale ? [] : quotaWindows(quota),
    shortcuts = codex?.shortcuts || [],
    native = asObject(state?.native),
    permissions = asObject(native.permissions || state?.native || state?.device.permissions),
    canSendSystemKeys = permissions.accessibility === true && permissions.canPostEvents === true;
  const lighting = asObject(codex?.lighting);
  const restoreError = !settings?.codexEnabled && asObject(codex?.adaptation).status === 'error';
  const wireless=state?.bluetooth?.connected===true&&!state?.device.connected;
  const whole = settings?.codexLightMode === "whole"&&!wireless;
  const TaskContainer = whole ? "details" : "div";
  const taskSource = asObject(codex?.taskSource);
  const source = String(settings?.codexTaskSource ?? "recent");
  const commandIds = (settings?.codexCommandIds ?? ["modelPicker", "newTask", "dictation", "voice", "toggleTerminal", "settings"]) as string[];
  const bindings = codexBindings(settings);
  const keyState = asObject(codex?.keys), keyHost=asObject(keyState.host);
  const executeCommand = (action:string) => run(command({op:'codexAction',action,...(action==='dictation'?{
    phase:keyState.held?'up':'down',source:keyState.held?String(asObject(keyState.held).source):'button'
  }:{})}));
  const failedKeys = Array.isArray(keyHost.failed) ? keyHost.failed as string[] : [];
  const changeKey = (group:"task"|"command",index:number) => <Button kind="ghost" className="codex-change-key"
    aria-label={tr(group === "task" ? `更改任务键 ${index+1}` : `更改命令键 ${index+1}`)} onClick={()=>setRecording({group,index})}>{tr("更改")}</Button>;
  const setSettings = (settings: Record<string, unknown>) => run(command({op:"settings",settings}));
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Codex</h1>
          <p>{tr("把任务的进展，留在指尖。")}</p>
        </div>
        <Button
          icon={<RefreshCw size={16} />}
          onClick={() => run(command({ op: "refreshCodex" }))}
        >{tr("刷新状态")}</Button>
      </header>
      <AgentSourceSwitch state={state} command={command}/>
      <div className="integration-banner">
        <div className="integration-status">
          <Activity size={20} />
          <div>
            <strong>
              {tr(taskSource.available === false ? "任务同步暂不可用" : codex?.available ? "已连接本机 Codex" : "Codex 暂不可用")}
            </strong>
            {(!codex?.available || taskSource.stale || taskSource.available === false) && <p>
              {tr(codex?.available
                ? String(taskSource.stale ? taskSource.reason : "任务状态自动更新；未确认的状态会单独标明。")
                : codex?.reason || "正在读取本机 Codex 状态…")}
            </p>}
          </div>
        </div>
        <Switch
          label={tr("Codex 模式")}
          checked={settings?.codexEnabled || false}
          onChange={(codexEnabled) =>
            run(command(codexEnabled ? {op:"codexAdapt",source:"codex"} : { op: "settings", settings: { codexEnabled:false } }))
          }
        />
      </div>
      {restoreError ? <div className="codex-key-warning" role="alert">
        <p>{tr("Codex 模式已关闭，但原有按键尚未恢复，请重试。")}</p>
        <Button onClick={()=>run(command({op:'codexAdaptRestore'}))}>{tr("重试恢复")}</Button>
      </div> : <p className="muted">{tr(settings?.codexEnabled ? "开启时，绑定按键用于 Codex；关闭后恢复键盘原功能。" : asObject(codex?.adaptation).keycapsMapped ? "普通模式下，F1–F12 对应键帽功能。请保持 NuPhyLab 运行。" : settings?.codexKeycapFallback && asObject(codex?.adaptation).status!=='keycaps' ? "键帽功能尚未就绪，请在设备页检查连接与权限。" : "已关闭 Codex 模式，键盘使用原来的功能。")}</p>}
      {failedKeys.length>0 && <p className="codex-key-warning" role="alert">{tr("这些按键被系统占用，请更换绑定：")}{failedKeys.map(code=>tr(bindings.find(key=>key.code===code)?.label||code)).join("、")}</p>}
      {settings?.codexEnabled && keyState.enabled===false && state?.device.connected && ['game','trigger'].includes(state.playback.mode) && <p className="muted">{tr("游戏与按键触发期间，Codex 快捷控制暂停。")}</p>}
      {settings?.codexEnabled && <CodexSetup state={state} command={command}/>}
      {!wireless && <CodexLightMode state={state} command={command}/>}
      <TaskContainer className={whole ? "product-details codex-task-shortcuts" : undefined}>
      {whole && <summary>{tr("任务快捷键")}</summary>}
      <section className="codex-slots">
        <div className="section-heading">
          <div>
            <h2>{tr("任务与按键")}</h2>
            <p className="muted">{tr("默认 F1–F6，直接按键或点击键帽打开对应任务。")}</p>
          </div>
          <label className="codex-source">{tr("任务来源")}<select aria-label={tr("任务来源")} value={source} onChange={e => setSettings({codexTaskSource:e.target.value})}>
              <option value="recent">{tr("最近任务")}</option><option value="pinned">{tr("固定任务")}</option>
              <option value="priority">{tr("优先任务")}</option><option value="custom">{tr("自定义任务")}</option>
            </select>
          </label>
        </div>
        <div className="micro-legend">
          {tr(Object.entries(STATUS_NAMES).filter(([id]) => id !== "unassigned").map(([id,label]) => <span key={id}><i style={{backgroundColor:statusColor({status:id},settings)}} />{tr(label)}</span>))}
        </div>
        <div className="slot-list">
          {tr(Array.from({ length: 6 }, (_, i) => {
            const resolved = codex?.slots?.[i];
            const task = resolved && typeof resolved === "object" && taskId(resolved) ? resolved : undefined,
              status = String(task?.status || task?.state || "unassigned");
            const color = statusColor(task,settings);
            const selected = Boolean(task && lighting.selectedId === taskId(task));
            return (
              <div className="slot-row" key={i}>
                <div className="codex-key-binding"><button className={`function-key micro-function-key ${selected ? "selected" : ""}`}
                  style={{backgroundColor:color, color:["idle","completed"].includes(status) ? "#151514" : "#fff"}}
                  aria-label={tr(`打开任务 ${i+1}`)} aria-current={selected ? "true" : undefined} disabled={!task}
                  title={tr(wireless ? "打开任务" : "打开此任务并显示灯光反馈")}
                  onClick={() => run(command({op:"codexAction",action:"task",threadId:task ? taskId(task) : ""}))}>{tr(bindings[i].label)}</button>
                  {changeKey("task",i)}
                </div>
                <div className="slot-task">
                  <label htmlFor={`slot-${i}`}>{tr("任务")} {tr(i + 1)}</label>
                  {tr(source === "custom" ? <select
                    id={`slot-${i}`}
                    value={slots[i] || ""}
                    onChange={(e) => {
                      const next = Array.from(
                        { length: 6 },
                        (_, n) => slots[n] || "",
                      );
                      const duplicate = e.target.value ? next.indexOf(e.target.value) : -1;
                      if (duplicate >= 0 && duplicate !== i) next[duplicate] = next[i];
                      next[i] = e.target.value;
                      run(
                        command({
                          op: "settings",
                          settings: { slotIds: next },
                        }),
                      );
                    }}
                  >
                    <option value="">{tr("未绑定")}</option>
                    {tr(tasks.map((t) => (
                      <option key={taskId(t)} value={taskId(t)}>
                        {String(t.title || t.name || "未命名任务")}
                      </option>
                    )))}
                    {tr(slots[i] && !task && (
                      <option value={slots[i]}>{tr("已绑定任务（当前不可用）")}</option>
                    ))}
                  </select> : <strong translate="no" className="micro-task-title" title={String(task?.title || "")}>{String(task?.title || tr(source === "pinned" ? "暂无固定任务" : "暂无任务"))}</strong>)}
                </div>
                <span
                  className={`task-status ${task ? statusClass(status) : ""}`}
                >
                  {tr(selected && <small className="micro-selected-label">{tr("控制中 ·")}</small>)}
                  {tr(task ? task.pendingKind === "approval" ? "等待批准" : STATUS_NAMES[status as keyof typeof STATUS_NAMES] || statusNames[status] || status : "未绑定")}
                </span>
                <Button
                  kind="ghost"
                  icon={<ArrowUpRight size={17} />}
                  disabled={!task || !codex?.available}
                  onClick={() =>
                    run(
                      command({
                        op: "codexAction",
                        action: "task",
                        threadId: task ? taskId(task) : "",
                      }),
                    )
                  }
                >{tr("打开")}</Button>
              </div>
            );
          }))}
        </div>
      </section>
      </TaskContainer>
      <section className="micro-commands">
        <div className="section-heading"><div><h2>{tr("命令键")}</h2><p className="muted">{tr("默认 F7–F12，按键与执行的动作分别设置。")}</p></div></div>
        <div className="micro-command-grid">{commandIds.map((id,i)=><div className="micro-command" key={i}>
          <div className="codex-key-binding"><kbd className="function-key">{tr(bindings[i+6].label)}</kbd>{changeKey("command",i)}</div>
          <select id={`micro-command-${i}`} aria-label={tr(`命令键 ${i+1} 的动作`)} value={id} onChange={e=>{const next=[...commandIds];next[i]=e.target.value;setSettings({codexCommandIds:next});}}>
            {shortcuts.filter(s=>s.available !== false).map(s=><option key={s.id} value={s.id}>{tr(s.label)}</option>)}
          </select>
          <Button kind="ghost" disabled={!canSendSystemKeys || !codex?.available} title={tr(!canSendSystemKeys ? "需要辅助功能权限" : undefined)} onClick={()=>executeCommand(id)}>{tr(id==='dictation'?(keyState.held?"结束听写":"开始听写"):"执行")}</Button>
        </div>)}</div>
        {!canSendSystemKeys && <p className="codex-command-note muted">{tr("命令执行需要辅助功能权限；任务跳转无需此权限。")}</p>}
        {commandIds.includes("dictation") && <p className="codex-command-note muted">{tr("听写时按住对应按键，松开结束。")}</p>}
        <details className="product-details codex-command-note"><summary>{tr("命令键使用说明")}</summary><p>{tr("听写：按住对应按键说话，松开结束；最长 2 分钟。语音对话需要 Codex 当前页面支持，终端需要本地项目。")}</p></details>
      </section>
      {!wireless && <section className="micro-settings">
        <div className="section-heading"><div><h2>{tr("状态灯")}</h2><p className="muted">{tr(whole ? "整把键盘跟随同一个任务的状态。" : "灯光跟随绑定的按键位置。")}</p></div>
          <Button kind="ghost" onClick={() => run(command({op:"lightWake"}))}>{tr(state?.lightPower?.sleeping ? "唤醒灯光" : "重新计时")}</Button>
        </div>
        <div className="codex-light-settings">
          <div className="codex-light-column">
            <h3>{tr("显示效果")}</h3>
            <div className="codex-light-row codex-brightness"><label htmlFor="codex-brightness">{tr("状态灯亮度")}</label><strong>{Number(settings?.codexBrightness ?? 100)}%</strong><input id="codex-brightness" type="range" aria-label={tr("Codex 状态灯亮度")} min="0" max="100" value={Number(settings?.codexBrightness ?? 100)} onChange={e=>setSettings({codexBrightness:Number(e.target.value)})} /></div>
            <div className="codex-light-row"><Switch label={tr("控制任务呼吸")} checked={settings?.codexSelectedPulse !== false} onChange={value=>setSettings({codexSelectedPulse:value})} /></div>
            {!whole && <div className="codex-light-row"><Switch label={tr("命令键状态流光")} checked={Boolean(settings?.codexAmbient)} onChange={value=>setSettings({codexAmbient:value})} /><p>{tr("开启后，命令键显示当前控制任务的提示与思考流光。")}</p></div>}
          </div>
        </div>
        <CodexStatusColors settings={settings ?? {}} command={command} focusOnMount={focusColors} />
        <p className="codex-light-footnote muted">{tr("灯光时间统一在「设备」页设置，Codex 状态灯也一起休眠和唤醒。")}</p>
        {bindings.some(key=>key.ledIndex===null) && <p className="muted">{tr("Del 可执行按键动作，但该位置没有可独立控制的灯。")}</p>}
      </section>}
      {recording && <CodexKeyRecorder title={tr(recording.group === "task" ? `更改任务键 ${recording.index+1}` : `更改命令键 ${recording.index+1}`)}
        command={command} onSave={code=>command({op:"codexBind",...recording,code})} onClose={()=>setRecording(null)} />}
      <div className="codex-bottom">
        <section className="quota-section">
          <div className="section-heading">
            <h2>{tr("Codex 额度")}{tr(Boolean(quota.stale) && (
                <small className="stale-label">{tr("上次读数")}</small>
              ))}
            </h2>
            <CircleHelp size={17} className="muted" />
          </div>
          {tr(windows.length ? (
            <div className="quota-windows">
              {tr(windows.map((window, i) => (
                <div className="quota-window" key={i}>
                  <div>
                    <span>{tr(window.name)}</span>
                    <strong>
                      {tr(window.used === null
                        ? "—"
                        : `${Math.round(100 - window.used)}%`)}
                      <small>{tr("剩余")}</small>
                    </strong>
                  </div>
                  <div className="quota-track">
                    <span
                      style={{
                        width: `${window.used === null ? 0 : 100 - window.used}%`,
                      }}
                    />
                  </div>
                  <p>{tr(resetText(window.resetsAt))}</p>
                </div>
              )))}
            </div>
          ) : (
            <div className="quota-unavailable">
              <span>—</span>
              <p>
                {tr(String(quota.reason || "暂时无法读取额度，没有使用估算值。"))}
              </p>
            </div>
          ))}
          {tr(Boolean(quota.stale) && (
            <p className="quota-stale-note">
              {tr(String(quota.reason || "当前额度无法刷新，这里保留上次读数。"))}
            </p>
          ))}
        </section>
        <section className="shortcut-section">
          <h2>{tr("快捷控制")}</h2>
          <details className="micro-shortcut-catalog"><summary>{tr("查看全部快捷操作")}</summary>
          <input type="search" aria-label={tr("搜索 Codex 快捷操作")} placeholder={tr("搜索快捷操作")} value={shortcutSearch} onChange={e=>setShortcutSearch(e.target.value)} />
          {tr(shortcuts.length ? (
            <div className="shortcut-list">
              {tr(shortcuts.filter(s=>tr(s.label).toLowerCase().includes(shortcutSearch.toLowerCase())).map((shortcut, i) => {
                const action = shortcut.action || shortcut.id || "",
                  approval = ["approve", "decline"].includes(action),
                  taskLink = ["task", "openTask"].includes(action) || /^agent[1-6]$/.test(action),
                  needsPermission = !taskLink && !approval && !canSendSystemKeys;
                return (
                <Button
                  key={shortcut.id || shortcut.action || i}
                  disabled={shortcut.available === false || !codex?.available || approval || needsPermission}
                  title={tr(approval ? "请在 Codex 当前审批卡中操作" : needsPermission ? "需要辅助功能权限" : undefined)}
                  onClick={() => executeCommand(action)}
                >
                  <span>{tr(action==='dictation'&&keyState.held?"结束听写":shortcut.label)}</span>
                  {tr(shortcut.shortcut && <kbd>{tr(shortcut.shortcut)}</kbd>)}
                </Button>
                );
              }))}
            </div>
          ) : (
            <Empty title={tr("快捷动作暂不可用")}>{tr("连接 Codex 后显示可执行的动作。")}</Empty>
          ))}
          </details>
          <p className="muted shortcut-note" hidden={canSendSystemKeys}>
            {tr(!canSendSystemKeys && "发送系统快捷键需要辅助功能权限，请在系统设置中为 NuPhyLab 开启。")}{tr("直接按任务键跳转无需辅助功能权限。")}</p>
        </section>
      </div>
      <details className="micro-coverage"><summary>{tr("与 Codex Micro 的对应范围")}</summary>
        <p>{tr("已提供本机六任务灯、四种任务来源、控制任务呼吸、短时提示／思考流光、亮度、自动息灯和六个自定义命令键。")}</p>
        <p>{tr("“控制中”表示在 NuPhyLab 选择的任务；直接在 Codex 切换页面时，当前无法同步真实焦点。状态依据本机任务事件和进程记录，尚不包含云端任务及部分桌面审批、语音状态。")}</p>
        <p>{tr("Fast、批准／拒绝、直接分叉、按住说话、发送输入、旋钮／摇杆导航和技能直达仍需要 Codex 的界面接口，当前未接入。快捷操作使用已确认的默认键位，Codex 内自定义键位可能影响执行。")}</p>
      </details>
    </>
  );
}
