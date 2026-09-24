import { t as tr } from "./i18n";
import { Button, run } from "./primitives";
import { DurationField } from "./DurationField";
import type { AppState, Command } from "./types";
export function LightingTimers({state, command}:{state:AppState|null;command:Command}) {
  const power=state?.lightPower;
  return <section className="lighting-timers">
    <div className="section-heading"><div><h2>{tr("灯光时间")}</h2><p className="muted">{tr("统一控制主灯、侧灯和 Codex 状态灯。")}</p></div>
      <Button disabled={!state?.device.armed} onClick={()=>run(command({op:"lightWake"}))}>{tr(power?.sleeping ? "唤醒灯光" : "重新计时")}</Button>
    </div>
    <div className="timer-grid">
      <DurationField label={tr("每次亮灯时长")} value={Number(state?.settings.lightDurationMs ?? 0)} onChange={lightDurationMs=>command({op:"settings",settings:{lightDurationMs}})} />
      <DurationField label={tr("空闲多久后休眠")} value={Number(state?.settings.lightIdleMs ?? 0)} onChange={lightIdleMs=>command({op:"settings",settings:{lightIdleMs}})} />
    </div>
    <p className="muted">{tr("设为 0 或选择「不限」，关闭对应计时。")}</p>
    <details className="product-details timer-guide"><summary>{tr("计时说明")}</summary>
      <p>{tr("输入时间后按回车或点击其他位置保存，0 表示不限；范围为 1 秒至 24 小时。")}</p>
      <p>{tr("定时熄灯后点击唤醒或重新播放。空闲休眠后，使用键盘、鼠标或操作本应用会自动唤醒；不记录按键内容。休眠时动画和游戏暂停推进。")}</p>
    </details>
    {power?.systemIdleAvailable === false && <p className="inline-error">{tr("系统空闲时间暂不可读，当前仅根据本应用内的操作判断空闲。")}</p>}
    {power?.sleeping && <p className="timer-status" role="status">{tr(power.reason === "duration" ? "亮灯时间已到 · 灯光已熄灭" : "空闲休眠中 · 等待操作唤醒")}</p>}
  </section>;
}
