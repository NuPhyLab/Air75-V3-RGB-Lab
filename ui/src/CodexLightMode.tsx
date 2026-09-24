import {Keyboard,ArrowUpRight} from "lucide-react";
import {STATUS_NAMES,statusColor} from "../../shared/codex-lighting.mjs";
import {Button,run} from "./primitives";
import {t as tr} from "./i18n";
import type {AppState,Command} from "./types";

export function CodexLightMode({state,command}:{state:AppState|null;command:Command}) {
  const settings=state?.settings,whole=settings?.codexLightMode==="whole";
  const tasks=state?.codex.tasks ?? [],id=String(settings?.codexWholeTaskId ?? "");
  const lighting=state?.codex.lighting as {wholeTaskId?:string|null}|undefined;
  const task=tasks.find(t=>t.id===lighting?.wholeTaskId);
  return <section className="codex-mode-panel" aria-label={tr("灯光模式")}>
    <div className="codex-mode-heading"><h2>{tr("灯光模式")}</h2>
      <div className="codex-mode-switch" role="group" aria-label={tr("灯光模式")}>
        {([['keys','多任务灯位'],['whole','单任务全键盘']] as const).map(([mode,label])=><button key={mode}
          aria-pressed={whole===(mode==='whole')} disabled={!state}
          onClick={()=>run(command({op:"settings",settings:{codexLightMode:mode}}))}>{tr(label)}</button>)}
      </div>
    </div>
    {whole && <div className="codex-whole-task">
      <label className="codex-whole-picker">{tr("跟随任务")}<select aria-label={tr("跟随任务")} value={id}
        onChange={e=>run(command({op:"settings",settings:{codexWholeTaskId:e.target.value}}))}>
        <option value="">{tr("自动跟随控制任务")}</option>
        {tasks.map(t=><option key={t.id} value={t.id}>{String(t.title || t.name || tr("未命名任务"))}</option>)}
        {id && !tasks.some(t=>t.id===id) && <option value={id}>{tr("已选任务暂不可用")}</option>}
      </select></label>
      <div className="codex-whole-preview">
        <span className="codex-whole-symbol" aria-hidden="true"><Keyboard size={32} strokeWidth={1.75}/><i style={{backgroundColor:statusColor(task,settings)}}/></span>
        <div><strong translate="no">{task ? String(task.title || task.name || tr("未命名任务")) : tr(id ? "已选任务暂不可用" : "选择一个要跟随的任务")}</strong>
          <p>{tr(task ? STATUS_NAMES[String(task.status)] || "状态未确认" : "尚未跟随任务时，键盘保持熄灯。")}</p></div>
        {task && <Button kind="ghost" icon={<ArrowUpRight size={16}/>} disabled={!state?.codex.available}
          onClick={()=>run(command({op:"codexAction",action:"task",threadId:task.id}))}>{tr("打开任务")}</Button>}
      </div>
      <p className="muted codex-mode-note">{tr("只有一个任务时自动跟随；多个任务时可指定一个，或用任务键选择。")}</p>
    </div>}
  </section>;
}
