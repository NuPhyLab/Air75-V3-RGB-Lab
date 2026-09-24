import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { TRIGGER_KEYS } from "../../shared/trigger.mjs";
import { Button } from "./primitives";

type RecordedKey = (typeof TRIGGER_KEYS)[number];

export function TriggerKeyRecorder({ value, onChange }: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const candidate = useRef<RecordedKey | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const selected = TRIGGER_KEYS.find(key => key.code === value);

  useEffect(() => {
    if (!recording) return;
    candidate.current = null;
    root.current?.focus();
    const cancel = () => {
      candidate.current = null;
      setRecording(false);
      setMessage("已取消，保留原按键。");
    };
    const keyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || candidate.current) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        setMessage("请单独按一个键，不要同时按修饰键。");
        return;
      }
      const key = TRIGGER_KEYS.find(key => key.code === event.code);
      if (!key) {
        setMessage("这个按键暂不支持，请换一个键。");
        return;
      }
      candidate.current = key;
      setMessage(`已识别 ${tr(key.label)}，松开按键即可。`);
    };
    const keyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const key = candidate.current;
      if (!key || event.code !== key.code) return;
      candidate.current = null;
      // Finish on release so Space/Enter cannot activate the button again.
      latest.current(key.code);
      setRecording(false);
      setMessage(`已改为 ${tr(key.label)}。`);
      button.current?.focus();
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) cancel();
    };
    const visibility = () => { if (document.visibilityState === "hidden") cancel(); };
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      candidate.current = null;
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [recording]);

  return (<>
    <div className="trigger-key-field">
      <span id="trigger-key-label">{tr("触发按键")}</span>
      <div ref={root} tabIndex={-1} role="group" aria-labelledby="trigger-key-label"
        aria-describedby="trigger-key-message"
        className={`trigger-key-recorder ${recording ? "is-recording" : ""}`}>
        <kbd aria-label={tr(`当前触发按键：${tr(selected?.label || value)}`)}>
          {tr(recording ? "请按键…" : selected?.label || value)}
        </kbd>
        <Button kind="ghost" aria-label={tr(recording ? "取消更改触发按键" : "更改触发按键")}
          onClick={(event) => {
            button.current = event.currentTarget;
            candidate.current = null;
            setRecording(!recording);
            setMessage(recording ? "已取消，保留原按键。" : "按下要使用的单个按键。Esc、Tab 也可录入。");
          }}>
          {tr(recording ? "取消" : "更改")}
        </Button>
      </div>
    </div>
    <p id="trigger-key-message" className="trigger-key-message" role="status">{tr(message)}</p>
  </>);
}
