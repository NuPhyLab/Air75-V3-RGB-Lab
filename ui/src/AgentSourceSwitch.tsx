import {t as tr} from "./i18n";
import {run} from "./primitives";
import type {AppState,Command} from "./types";

export const AGENT_LABELS = {codex:"Codex",claude:"Claude Code"} as const;
export type AgentSource = keyof typeof AGENT_LABELS;
export function agentSource(state:AppState|null):AgentSource {
  return state?.settings.agentSource === "claude" ? "claude" : "codex";
}
/** One integration owns the task and command keys; the other keeps its settings. */
export function AgentSourceSwitch({state,command}:{state:AppState|null;command:Command}) {
  const source=agentSource(state);
  return <section className="codex-mode-panel agent-source-panel" aria-label={tr("任务来源应用")}>
    <div className="codex-mode-heading">
      <div>
        <h2>{tr("任务来源应用")}</h2>
        <p className="muted agent-source-note">{tr("同一时间只有一个应用使用任务键和命令键；另一个的绑定和颜色会保留。")}</p>
      </div>
      <div className="codex-mode-switch" role="group" aria-label={tr("任务来源应用")}>
        {(Object.keys(AGENT_LABELS) as AgentSource[]).map(id=><button key={id}
          aria-pressed={source===id} disabled={!state}
          onClick={()=>run(command({op:"settings",settings:{agentSource:id}}))}>{AGENT_LABELS[id]}</button>)}
      </div>
    </div>
  </section>;
}
