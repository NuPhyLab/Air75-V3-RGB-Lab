import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Heart, Play, Power } from "lucide-react";
import { DEFAULT_TRIGGER } from "../../shared/trigger.mjs";
import type { HSV } from "../../shared/color.mjs";
import { ColorWheel } from "./ColorWheel";
import { TriggerKeyRecorder } from "./TriggerKeyRecorder";
import { Button, run } from "./primitives";
import { DEFAULT_COLOR, heartColors } from "./presets";
import type { AppState, Command, Key, Notify, Scene, TriggerConfig } from "./types";

export function useTriggerKeys(state: AppState | null, command: Command) {
  const latest = useRef({ state, command });
  latest.current = { state, command };
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const { state, command } = latest.current;
      const trigger = state?.trigger;
      if (
        event.defaultPrevented || state?.playback.mode !== "trigger" ||
        !trigger?.armed || trigger.monitor !== "window" ||
        event.code !== trigger.config.code || event.repeat ||
        event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
      ) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable || target.closest(
          "input,textarea,select,button,a,[role='slider'],[role='textbox'],[role='dialog'],[contenteditable='true']",
        )
      )) return;
      run(command({ op: "triggerKey", code: event.code }));
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, []);
}

export function TriggerPanel({
  state, command, draft, setDraft, layout, notify, onColors,
}: {
  state: AppState | null;
  command: Command;
  draft: Scene;
  setDraft: (scene: Scene) => void;
  layout: Key[];
  notify: Notify;
  onColors: (colors: string[], history?: boolean) => void;
}) {
  const config = draft.trigger || DEFAULT_TRIGGER;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const trigger = state?.trigger;
  const armed = Boolean(trigger?.armed && state?.playback.mode === "trigger");
  const [busy, setBusy] = useState(false);
  const [color, setColor] = useState(
    draft.colors.find((value) => value.toLowerCase() !== "#000000")?.toUpperCase() || DEFAULT_COLOR,
  );
  const [hex, setHex] = useState(color);
  const colorMemory = useRef<HSV | null>(null);
  const signature = draft.colors.join("").toLowerCase();
  const emittedSignature = useRef(signature);
  const mask = useRef(draft.colors.map((value, index) => value.toLowerCase() !== "#000000" ? index : -1).filter((index) => index >= 0));
  if (signature !== emittedSignature.current) {
    mask.current = draft.colors.map((value, index) => value.toLowerCase() !== "#000000" ? index : -1).filter((index) => index >= 0);
    emittedSignature.current = signature;
  }
  useEffect(() => { setHex(color); }, [color]);
  const setConfig = (patch: Partial<TriggerConfig>) =>
    setDraft({ ...draft, trigger: { ...config, ...patch } });
  const recolor = (next: string) => {
    setColor(next);
    const lit = new Set(mask.current);
    const colors = draft.colors.map((value, index) => lit.has(index) ? next : value);
    emittedSignature.current = colors.join("").toLowerCase();
    onColors(colors, false);
  };
  const applyHex = () => {
    const next = hex.startsWith("#") ? hex : `#${hex}`;
    if (/^#[0-9a-f]{6}$/i.test(next)) recolor(next.toUpperCase());
    else { setHex(color); notify("颜色格式应为 #DC847B"); }
  };
  const perform = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await command(body); }
    finally { setBusy(false); }
  };
  const arm = async () => {
    const settings = { ...config };
    const colors = draft.colors.slice();
    await perform({ op: "triggerArm", colors, trigger: settings });
    setDraft({ ...draftRef.current, trigger: draftRef.current.trigger || settings });
  };
  const hasPattern = draft.colors.some((value) => value.toLowerCase() !== "#000000");
  return (
    <aside className="inspector trigger-inspector">
      <section className="trigger-color">
        <div className="section-heading compact color-heading"><h3>{tr("图案颜色")}</h3><span>{tr("已亮按键一起换色")}</span></div>
        <ColorWheel color={color} onChange={recolor} memory={colorMemory}
          entry={
            <div className="color-entry">
              <span className="color-preview" style={{ background: color }} />
              <input aria-label={tr("触发图案颜色")} value={hex} maxLength={7} onChange={(event) => setHex(event.target.value)} onBlur={applyHex}
                onKeyDown={(event) => { if (event.key === "Enter") applyHex(); }} />
              <Button kind="ghost" className="icon-button" title={tr("使用默认爱心")} aria-label={tr("使用默认爱心")} icon={<Heart size={16} />}
                onClick={() => onColors(heartColors(layout, color))} />
            </div>
          }
        />
      </section>
      <section className="trigger-settings">
        <div className="section-heading compact"><h3>{tr("闪烁设置")}</h3></div>
        <div className="trigger-fields">
          <TriggerKeyRecorder value={config.code} onChange={(code) => setConfig({ code })} />
          <label>{tr("闪烁次数")}<input aria-label={tr("闪烁次数")} type="number" min="1" max="20" value={config.count}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 20) setConfig({ count: value });
              }} />
          </label>
        </div>
        <label className="trigger-speed">{tr("闪烁速度")}<span>{tr(`每次 ${(config.intervalMs / 1000).toFixed(1)} 秒`)}</span>
          <input className="range" aria-label={tr("闪烁速度")} type="range" min="200" max="2000" step="100" value={2200 - config.intervalMs}
            onChange={(event) => setConfig({ intervalMs: 2200 - Number(event.target.value) })} />
        </label>
        <div className="trigger-speed-ends"><span>{tr("慢")}</span><span>{tr("快")}</span></div>
      </section>
      <section className="trigger-actions-panel">
        <div className="section-heading compact"><h3>{tr("触发控制")}</h3></div>
        <div className="trigger-actions">
          <Button kind="primary" busy={busy} icon={<Power size={14} />} disabled={!state?.device.connected || state?.firmware?.compatible === false || !hasPattern}
            onClick={() => run(arm())}>{tr(armed ? "应用设置" : "启用触发")}</Button>
          {tr(armed && <Button busy={busy} onClick={() => run(perform({ op: "triggerStop" }))}>{tr("关闭触发")}</Button>)}
          {tr(armed && <Button className="trigger-test" kind="ghost" busy={busy} icon={<Play size={13} />} disabled={trigger?.flashing}
            onClick={() => run(perform({ op: "triggerFire" }))}>{tr("试闪一次")}</Button>)}
        </div>
        <p className="trigger-state-note" role="status">
          {tr(armed ? trigger?.monitor === "global" ? "全局监听 · 按键仍正常输入" : "窗口内监听 · 点击图案后按键" : "启用后，平时保持熄灭。")}
        </p>
        <details className="trigger-help"><summary>{tr("配色与触发说明")}</summary><p>{tr("单键配色在「绘制」中设置。按键后闪烁，结束后熄灭；启用后修改需点击「应用设置」。")}</p></details>
        {tr(trigger?.warning && <details className="trigger-warning"><summary>{tr("全局监听提示")}</summary><p>{tr(trigger.warning)}</p></details>)}
        {tr(!hasPattern && <p className="trigger-warning">{tr("当前没有亮起的按键，先选一个图案。")}</p>)}
      </section>
    </aside>
  );
}
