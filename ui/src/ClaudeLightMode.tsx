import {Keyboard,ArrowUpRight} from "lucide-react";
import {CLAUDE_STATUS_NAMES,claudeStatusColor} from "../../shared/claude-lighting.mjs";
import {Button,run} from "./primitives";
import {t as tr} from "./i18n";
import type {AppState,Command} from "./types";

export function ClaudeLightMode({state,command}:{state:AppState|null;command:Command}) {
  const settings=state?.settings,whole=settings?.claudeLightMode==="whole";
  const tasks=state?.claude?.tasks ?? [],id=String(settings?.claudeWholeTaskId ?? "");
  const lighting=(state?.claude?.lighting ?? {}) as {wholeTaskId?:string|null};
  const task=tasks.find(item=>item.id===lighting.wholeTaskId);
  return <section className="codex-mode-panel" aria-label={tr("灯光模式")}>
    <div className="codex-mode-heading"><h2>{tr("灯光模式")}</h2>
      <div className="codex-mode-switch" role="group" aria-label={tr("灯光模式")}>
        {([["keys","多任务灯位"],["whole","单任务全键盘"]] as const).map(([mode,label])=><button key={mode}
          aria-pressed={whole===(mode==="whole")} disabled={!state}
          onClick={()=>run(command({op:"settings",settings:{claudeLightMode:mode}}))}>{tr(label)}</button>)}
      </div>
    </div>
    {whole && <div className="codex-whole-task">
      <label className="codex-whole-picker">{tr("跟随会话")}<select aria-label={tr("跟随会话")} value={id}
        onChange={e=>run(command({op:"settings",settings:{claudeWholeTaskId:e.target.value}}))}>
        <option value="">{tr("自动跟随控制会话")}</option>
        {tasks.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.title || tr("Claude Code 会话"))}</option>)}
        {id && !tasks.some(item=>item.id===id) && <option value={id}>{tr("已选会话暂不可用")}</option>}
      </select></label>
      <div className="codex-whole-preview">
        <span className="codex-whole-symbol" aria-hidden="true"><Keyboard size={32} strokeWidth={1.75}/><i style={{backgroundColor:claudeStatusColor(task,settings)}}/></span>
        <div><strong translate="no">{task ? String(task.title || tr("Claude Code 会话")) : tr(id ? "已选会话暂不可用" : "选择一个要跟随的会话")}</strong>
          <p>{tr(task ? CLAUDE_STATUS_NAMES[String(task.status)] || "状态未确认" : "尚未跟随会话时，键盘保持熄灯。")}</p></div>
        {task && <Button kind="ghost" icon={<ArrowUpRight size={16}/>} disabled={!state?.claude?.available}
          onClick={()=>run(command({op:"claudeAction",action:"task",sessionId:String(task.id)}))}>{tr("打开会话")}</Button>}
      </div>
      <p className="muted codex-mode-note">{tr("只有一个会话时自动跟随；多个会话时可指定一个，或用任务键选择。")}</p>
    </div>}
  </section>;
}
