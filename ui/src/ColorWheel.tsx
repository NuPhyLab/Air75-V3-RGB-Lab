import { t as tr } from "./i18n";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode, RefObject } from "react";
import {
  hexToHsv,
  hsvToHex,
  pointToHueSaturation,
} from "../../shared/color.mjs";
import type { HSV } from "../../shared/color.mjs";

type Props = {
  color: string;
  onChange: (color: string) => void;
  memory: RefObject<HSV | null>;
  entry?: ReactNode;
  onChangeStart?:()=>void;
  onChangeEnd?:()=>void;
};

export function ColorWheel({ color, onChange, memory, entry, onChangeStart, onChangeEnd }: Props) {
  const valueId = useId();
  const [hsv, setHsv] = useState(() =>
    memory.current && hsvToHex(memory.current) === color.toUpperCase()
      ? memory.current
      : hexToHsv(color, memory.current?.h, memory.current?.s),
  );
  const current = useRef(hsv);
  const emittedColor = useRef(color.toUpperCase());
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    if (color.toUpperCase() === emittedColor.current) {
      memory.current = current.current;
      return;
    }
    const next = hexToHsv(color, current.current.h, current.current.s);
    current.current = next;
    memory.current = next;
    emittedColor.current = color.toUpperCase();
    setHsv(next);
  }, [color, memory]);

  const update = (next: HSV) => {
    current.current = next;
    memory.current = next;
    setHsv(next);
    emittedColor.current = hsvToHex(next);
    onChange(emittedColor.current);
  };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = pointToHueSaturation(
      event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2,
      rect.width / 2,
      current.current.h,
    );
    update({ ...current.current, ...next });
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const next = { ...current.current };
    switch (event.key) {
      case "ArrowLeft":
        next.h = (next.h - step + 360) % 360;
        break;
      case "ArrowRight":
        next.h = (next.h + step) % 360;
        break;
      case "ArrowUp":
        next.s = Math.min(1, next.s + step / 100);
        break;
      case "ArrowDown":
        next.s = Math.max(0, next.s - step / 100);
        break;
      case "Home":
        next.s = 0;
        break;
      case "End":
        next.s = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    update(next);
  };
  const angle = (hsv.h * Math.PI) / 180;

  return (
    <div className="continuous-color">
      <div
        className="color-wheel"
        role="slider"
        tabIndex={0}
        aria-label={tr("连续色盘")}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuetext={tr(`色相 ${Math.round(hsv.h)} 度，饱和度 ${Math.round(hsv.s * 100)}%`)}
        title={tr("拖动选择颜色；左右键调色相，上下键调饱和度，Shift 加速")}
        onKeyDown={keyDown}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          activePointer.current = event.pointerId;
          onChangeStart?.();
          point(event);
        }}
        onPointerMove={(event) => {
          if (activePointer.current === event.pointerId) point(event);
        }}
        onPointerUp={(event) => {
          if (activePointer.current !== event.pointerId) return;
          point(event);
          activePointer.current = null;
          onChangeEnd?.();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { activePointer.current = null; onChangeEnd?.(); }}
        onLostPointerCapture={() => { activePointer.current = null; onChangeEnd?.(); }}
      >
        <span
          className="color-wheel-handle"
          aria-hidden="true"
          style={{
            left: `${50 + Math.cos(angle) * hsv.s * 50}%`,
            top: `${50 + Math.sin(angle) * hsv.s * 50}%`,
            background: hsvToHex({ ...hsv, v: 1 }),
          }}
        />
      </div>
      <div className="color-controls">
        {tr(entry)}
        <div className="color-value-heading">
          <label htmlFor={valueId}>{tr("明暗")}</label>
          <span>{tr(Math.round(hsv.v * 100))}%</span>
        </div>
        <input
          id={valueId}
          className="color-value-range"
          aria-label={tr("颜色明暗")}
          type="range"
          min="0"
          max="100"
          step="any"
          value={hsv.v * 100}
          style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
          onPointerDown={()=>onChangeStart?.()}
          onPointerUp={()=>onChangeEnd?.()}
          onPointerCancel={()=>onChangeEnd?.()}
          onChange={(event) => update({ ...current.current, v: Number(event.target.value) / 100 })}
          onKeyDown={(event) => {
            const delta = event.shiftKey ? 10 : 1;
            let value = current.current.v * 100;
            if (["ArrowLeft", "ArrowDown"].includes(event.key)) value -= delta;
            else if (["ArrowRight", "ArrowUp"].includes(event.key)) value += delta;
            else if (event.key === "Home") value = 0;
            else if (event.key === "End") value = 100;
            else return;
            event.preventDefault();
            update({ ...current.current, v: Math.max(0, Math.min(100, value)) / 100 });
          }}
        />
      </div>
    </div>
  );
}
