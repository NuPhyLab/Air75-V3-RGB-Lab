import { t as tr } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Brush,
  Check,
  CircleAlert,
  Copy,
  Eraser,
  Heart,
  Paintbrush,
  Pencil,
  Pause,
  Play,
  Plus,
  Redo2,
  Scan,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { Keyboard, lightingPeak } from "./Keyboard";
import { ColorWheel } from "./ColorWheel";
import { GamePanel, GAME_NAMES, canPressGameKey } from "./GamePanel";
import { TriggerPanel } from "./TriggerPanel";
import type { HSV } from "../../shared/color.mjs";
import { Button, run, Switch } from "./primitives";
import { heartColors, DEFAULT_COLOR } from "./presets";
import { blankColors, STUDIO_MODES } from "./types";
import type {
  Animation,
  AppState,
  Command,
  Direction,
  Key,
  Notify,
  Scene,
  StudioMode,
} from "./types";

type Props = {
  mode: StudioMode;
  layout: Key[];
  state: AppState | null;
  command: Command;
  draft: Scene;
  setDraft: (scene: Scene) => void;
  onSave: () => void;
  onBrowsePresets: () => void;
  onEditCodexColors: () => void;
  notify: Notify;
};
const directions: [Direction, string, typeof ArrowUp][] = [
  ["left", "向左", ArrowLeft],
  ["right", "向右", ArrowRight],
  ["up", "向上", ArrowUp],
  ["down", "向下", ArrowDown],
];
const labels: Record<string, string> = {
  static: "静态",
  move: "移动",
  pulse: "呼吸",
  wave: "波浪",
  frames: "逐帧",
};
export function Studio({
  mode: tab,
  layout,
  state,
  command,
  draft,
  setDraft,
  onSave,
  onBrowsePresets,
  onEditCodexColors,
  notify,
}: Props) {
  const previewPeak = useMemo(() => lightingPeak([draft.colors, ...(draft.animation.frames || []).map(frame => frame.colors)]), [draft.colors, draft.animation.frames]);
  const [tool, setTool] = useState<"paint" | "select" | "erase">("paint");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const colorMemory = useRef<HSV | null>(null);
  const [colorScope,setColorScope] = useState("pattern");
  const colorGesture = useRef({active:false,recorded:false});
  const colorTargets = useRef<{signature:string;scope:string;selection:string;indices:number[]}|null>(null);
  const [hex, setHex] = useState(color);
  const [selected, setSelected] = useState<number[]>([]);
  const [live, setLive] = useState(true);
  const [undoStack, setUndo] = useState<string[][]>([]);
  const [redoStack, setRedo] = useState<string[][]>([]);
  const [frameIndex, setFrameIndex] = useState(() => Math.max(0,
    (draft.animation.frames || []).findIndex(frame =>
      frame.colors.every((value, index) => value.toLowerCase() === draft.colors[index]?.toLowerCase()),
    ),
  ));
  const [playBusy, setPlayBusy] = useState(false);
  const [brightness, setBrightness] = useState(70);
  const stroke = useRef(new Set<number>());
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftColorSignature = draft.colors.join("").toLowerCase();
  const lastPreview = useRef(draftColorSignature);
  const mounted = useRef(false);
  useEffect(() => {
    if (state) setBrightness(state.settings.brightness);
  }, [state?.settings.brightness]);
  useEffect(() => {
    setHex(color);
  }, [color]);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (
      !live ||
      !state?.device.connected ||
      state?.firmware?.compatible === false ||
      tab === "game" ||
      tab === "trigger" ||
      state.playback.mode === "game" ||
      state.playback.mode === "agent" ||
      state.playback.mode === "trigger"
    )
      return;
    const signature = draftColorSignature;
    if (signature === lastPreview.current) return;
    const timer = setTimeout(() => {
      lastPreview.current = signature;
      void command({ op: "preview", colors: draft.colors }).catch(() => {
        if (lastPreview.current === signature) lastPreview.current = "";
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [draftColorSignature, live, state?.device.connected, state?.firmware?.compatible, state?.playback.mode, state?.playback.playing, tab, command]);
  const commit = (colors: string[], history = true) => {
    if (history) {
      const previous = draftRef.current.colors.slice();
      setUndo((stack) => [
        ...stack.slice(-49),
        previous,
      ]);
      setRedo([]);
    }
    const updated={ ...draftRef.current, colors };
    draftRef.current=updated;
    setDraft(updated);
  };
  const changeColor = (nextColor:string) => {
    setColor(nextColor);
    if(colorScope === "brush") return;
    const previous=draftRef.current.colors,signature=previous.join("").toLowerCase(),selection=selected.join(",");
    const cached=colorTargets.current;
    let indices:number[];
    if(cached?.signature===signature && cached.scope===colorScope && cached.selection===selection) indices=cached.indices;
    else if(colorScope === "all") indices=layout.map(k=>k.index);
    else if(selected.length) indices=selected;
    else {indices=layout.filter(k=>previous[k.index]?.toLowerCase()!=="#000000").map(k=>k.index);if(!indices.length)indices=layout.map(k=>k.index);}
    const next=[...previous];indices.forEach(i=>next[i]=nextColor.toLowerCase());
    colorTargets.current={signature:next.join("").toLowerCase(),scope:colorScope,selection,indices};
    if(signature===next.join("").toLowerCase()) return;
    commit(next,!colorGesture.current.active || !colorGesture.current.recorded);
    if(colorGesture.current.active)colorGesture.current.recorded=true;
  };
  const startStroke = () => {
    stroke.current = new Set();
    if (tool !== "select") {
      // Capture before touchKey updates the ref in this same pointer event.
      const previous = draftRef.current.colors.slice();
      setUndo((stack) => [
        ...stack.slice(-49),
        previous,
      ]);
      setRedo([]);
    }
  };
  const touchKey = (index: number) => {
    if (stroke.current.has(index)) return;
    stroke.current.add(index);
    if (tool === "select")
      setSelected((keys) =>
        keys.includes(index)
          ? keys.filter((k) => k !== index)
          : [...keys, index],
      );
    else {
      const next = draftRef.current.colors.slice();
      next[index] = tool === "erase" ? "#000000" : color;
      const updated = { ...draftRef.current, colors: next };
      draftRef.current = updated;
      setDraft(updated);
    }
  };
  const undo = () => {
    const previous = undoStack.at(-1);
    if (previous) {
      setRedo((stack) => [...stack, draft.colors]);
      setUndo((stack) => stack.slice(0, -1));
      setDraft({ ...draft, colors: previous });
    }
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (next) {
      setUndo((stack) => [...stack, draft.colors]);
      setRedo((stack) => stack.slice(0, -1));
      setDraft({ ...draft, colors: next });
    }
  };
  const setAnimation = (patch: Partial<Animation>) =>
    setDraft({ ...draft, animation: { ...draft.animation, ...patch } });
  const applyHex = () => {
    const next = hex.startsWith("#") ? hex : `#${hex}`;
    if (/^#[0-9a-f]{6}$/i.test(next)) changeColor(next.toUpperCase());
    else {
      setHex(color);
      notify("颜色格式应为 #DC847B");
    }
  };
  const play = async () => {
    setPlayBusy(true);
    try {
      await command({
        op: draft.animation.effect === "static" ? "preview" : "play",
        colors: draft.colors,
        animation: draft.animation,
      });
    } finally {
      setPlayBusy(false);
    }
  };
  const hardwarePlaying = Boolean(state?.playback.playing && state.playback.mode !== "trigger"),
    paused = state?.playback.mode === "paused";
  const pausedDraft = useRef<{ paused: boolean; signature: string }>({
    paused: false,
    signature: draftColorSignature,
  });
  if (paused && !pausedDraft.current.paused) {
    pausedDraft.current = { paused: true, signature: draftColorSignature };
  } else if (!paused) {
    pausedDraft.current.paused = false;
  }
  const currentColors =
    tab === "game" ||
    (tab === "paint" && live && state?.device.armed && state.playback.mode === "static") ||
    (tab === "trigger" && state?.playback.mode === "trigger" && state.trigger?.armed) ||
    hardwarePlaying ||
    (paused &&
      state?.device.armed &&
      pausedDraft.current.signature === draftColorSignature)
      ? state?.colors || draft.colors
      : draft.colors;
  return (
    <section className="studio-page" data-mode={tab}>
      <header className="page-heading">
        <div>
          <h1>{tr(STUDIO_MODES.find((mode) => mode.id === tab)?.label)}</h1>
          {tr(tab !== "game" ? (
            <div className="work-identity">
              <label className="work-name">
              <input
                className="title-input"
                aria-label={tr("当前作品名称")}
                title={tr("点击修改作品名称")}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={80}
              />
              <Pencil size={12} aria-hidden="true" />
              </label>
              <span>
                {tr(draft.id ? draft.trigger ? "按键触发" : labels[draft.animation.effect] : "尚未保存")}
              </span>
            </div>
          ) : (
            <p>{tr("把键盘变成游乐场，选一个游戏开始。")}</p>
          ))}
        </div>
        <div className="header-actions">
          {tr(tab !== "game" && (
            <>
              <Button onClick={onSave}>{tr("保存作品")}</Button>
              {tr(tab !== "trigger" && (
              <Button
                kind="primary"
                icon={
                  hardwarePlaying ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )
                }
                busy={playBusy}
                disabled={!state?.device.connected || state?.firmware?.compatible === false}
                onClick={() =>
                  run(
                    hardwarePlaying || paused
                      ? command({ op: "pause" })
                      : play(),
                  )
                }
              >
                {tr(hardwarePlaying
                  ? "暂停播放"
                  : paused
                    ? "继续播放"
                    : "播放到键盘")}
              </Button>
              ))}
            </>
          ))}
        </div>
      </header>
      <div className="studio-workspace">
        {tr(state?.playback.lastError && (
          <div className="inline-error" role="alert">
            <CircleAlert size={17} />
            <span>{tr(state.playback.lastError)}</span>
          </div>
        ))}
        <div className="studio-grid">
          <section className="canvas-panel">
            <div className="canvas-toolbar">
              {tr(tab === "trigger" ? (
                <div className="game-title trigger-canvas-title">
                  <Heart size={15} />
                  {tr(state?.trigger?.armed ? "键盘实时灯光" : "待触发的图案")}
                </div>
              ) : tab !== "game" ? (
                <>
                  <div className="tool-group">
                    {tr((
                      [
                        ["paint", "画笔", Paintbrush],
                        ["select", "选择", Scan],
                        ["erase", "橡皮擦", Eraser],
                      ] as const
                    ).map(([value, label, Icon]) => (
                      <button
                        key={value}
                        className={tool === value ? "active" : ""}
                        onClick={() => setTool(value)}
                        aria-pressed={tool === value}
                      >
                        <Icon size={17} />
                        <span>{tr(label)}</span>
                      </button>
                    )))}
                  </div>
                  <div className="history-actions">
                    <Button
                      className="icon-button"
                      aria-label={tr("撤销")}
                      title={tr("撤销")}
                      disabled={!undoStack.length}
                      icon={<Undo2 size={17} />}
                      onClick={undo}
                    />
                    <Button
                      className="icon-button"
                      aria-label={tr("重做")}
                      title={tr("重做")}
                      disabled={!redoStack.length}
                      icon={<Redo2 size={17} />}
                      onClick={redo}
                    />
                  </div>
                </>
              ) : (
                <div className="game-title">
                  <span className="score-dot" />
                  {tr(GAME_NAMES[state?.game.type || "snake"])}
                </div>
              ))}
              <span className="canvas-count">
                {tr(layout.length || "—")} {tr("颗按键灯")}</span>
            </div>
            <div className="keyboard-area" tabIndex={tab === "trigger" ? -1 : undefined}
              onPointerDown={tab === "trigger" ? (event) => {
                event.preventDefault();
                event.currentTarget.focus({ preventScroll: true });
              } : undefined}>
              {tr(layout.length ? (
                <Keyboard
                  layout={layout}
                  colors={currentColors}
                  lightPreview={tab === "animation" && draft.animation.effect !== "static"}
                  lightPreviewPeak={previewPeak}
                  selected={tab === "game" || tab === "trigger" ? [] : selected}
                  onKey={tab === "game" || tab === "trigger" ? undefined : touchKey}
                  onGameKey={
                    tab === "game" &&
                    state?.game.status === "running" &&
                    (state.game.type === "whack" ||
                      state.game.type === "memory")
                      ? (index) => {
                          const code = layout.find(
                            (key) => key.index === index,
                          )?.code;
                          if (code && canPressGameKey(state.game, code))
                            run(
                              command({ op: "gameInput", code, pressed: true }),
                            );
                        }
                      : undefined
                  }
                  onStrokeStart={tab === "game" || tab === "trigger" ? undefined : startStroke}
                  sideColor={
                    state?.device.connected &&
                    typeof state.device.sideColor === "string"
                      ? state.device.sideColor
                      : undefined
                  }
                />
              ) : (
                <div className="layout-loading">{tr("正在读取键盘布局…")}</div>
              ))}
            </div>
            <div
              className={`playback-status ${state?.device.connected ? "" : "disconnected"}`}
            >
              <span
                className={`status-dot ${state?.device.connected ? "green" : ""}`}
              />
              <span className="playback-message">
                {tr(state?.lightPower?.sleeping ? state.lightPower.reason === "duration" ? "亮灯时间已到 · 请在设备页唤醒" : "灯光已休眠 · 操作后自动唤醒" : !state?.device.connected
                  ? tab === "game"
                    ? "连接键盘后开始游戏"
                    : tab === "trigger"
                      ? "连接键盘后启用按键触发"
                    : "连接键盘后可预览；画布可离线编辑"
                  : state.firmware?.compatible === false
                    ? "请先在设备页检查固件；画布可离线编辑"
                  : state.trigger?.armed && state.playback.mode === "trigger"
                    ? state.trigger.flashing
                      ? `正在闪烁 · ${state.trigger.completed} / ${state.trigger.config.count}`
                      : "等待按键 · 键盘保持熄灭"
                    : tab === "trigger"
                      ? "图案预览 · 启用后平时保持熄灭"
                  : tab === "game" && state.game.status !== "idle"
                    ? state.game.status === "paused"
                      ? "游戏已暂停"
                      : state.game.status === "won"
                        ? "游戏通关"
                        : state.game.status === "over"
                          ? "游戏结束"
                          : "游戏进行中"
                    : paused
                      ? "播放已暂停"
                      : hardwarePlaying
                        ? state.playback.mode === "game"
                          ? state.game.status === "paused"
                            ? "游戏已暂停"
                            : state.game.status === "won"
                              ? "游戏通关"
                              : state.game.status === "over"
                                ? "游戏结束"
                                : "游戏进行中"
                          : `正在播放${labels[state.playback.mode] ? " · " + tr(labels[state.playback.mode]) : ""}`
                        : state.device.armed
                          ? state.settings.codexEnabled ? state.settings.codexLightMode === "whole" ? "已发送颜色 · 单任务全键盘" : "已发送颜色 · Codex 灯光跟随绑定键位" : "已发送颜色 · 含键盘亮度"
                          : "键盘已连接，尚未播放")}
              </span>
              {tr(tab !== "game" && tab !== "trigger" && (
                <Switch label={tr("实时预览")} checked={live} onChange={value=>{if(value)lastPreview.current="";setLive(value);}} />
              ))}
              {tr(state?.device.armed && tab !== "game" && tab !== "trigger" && (
                <button
                  className="text-button"
                  onClick={() => run(command({ op: "stop" }))}
                >
                  <Square size={12} />{tr("停止")}</button>
              ))}
            </div>
          </section>
          {tr(tab === "game" ? (
            <GamePanel state={state} command={command} />
          ) : tab === "trigger" ? (
            <TriggerPanel state={state} command={command} draft={draft} setDraft={setDraft}
              layout={layout} notify={notify} onColors={commit} />
          ) : (
            <aside className="inspector paint-inspector">
              <section className="paint-color">
                <div className="section-heading compact color-heading">
                  <h3>{tr("颜色")}</h3>
                  <span>{tr("拖动微调")}</span>
                </div>
                <label className="color-scope">{tr("颜色应用到")}
                  <select aria-label={tr("颜色应用到")} value={colorScope} onChange={e=>setColorScope(e.target.value)}>
                    <option value="pattern">{tr(selected.length ? "选中按键" : "当前图案")}</option>
                    <option value="all">{tr("整把键盘")}</option><option value="brush">{tr("仅画笔")}</option>
                  </select>
                </label>
                {state?.settings.codexEnabled && !(state.bluetooth?.connected&&!state.device.connected) && <div className="color-ownership">
                  <span>{tr(state.settings.codexLightMode === "whole" ? "整把键盘正在显示 Codex 状态" : "Codex 按键使用独立状态颜色")}</span>
                  <button type="button" onClick={onEditCodexColors}>{tr("设置状态颜色")}</button>
                </div>}
                <ColorWheel
                  color={color}
                  onChange={changeColor}
                  onChangeStart={()=>{colorGesture.current={active:true,recorded:false};}}
                  onChangeEnd={()=>{colorGesture.current.active=false;}}
                  memory={colorMemory}
                  entry={<div className="color-entry">
                  <span
                    className="color-preview"
                    style={{ background: color }}
                    role="img"
                    aria-label={tr(`当前颜色 ${color}`)}
                  />
                  <input
                    aria-label={tr("十六进制颜色")}
                    value={hex}
                    onChange={(e) => setHex(e.target.value)}
                    onBlur={applyHex}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyHex();
                    }}
                    maxLength={7}
                  />
                  <Button
                    kind="ghost"
                    className="icon-button"
                    title={tr("复制颜色")}
                    aria-label={tr("复制颜色")}
                    icon={<Copy size={16} />}
                    onClick={() =>
                      run(
                        navigator.clipboard
                          .writeText(color)
                          .then(() => notify("颜色已复制", "success"))
                          .catch(() => notify("无法复制，请选中颜色值复制")),
                      )
                    }
                  />
                </div>}
                />
              </section>
              {tr(tab === "paint" ? <>
              <section className="paint-brightness">
                <div className="section-heading compact">
                  <h3>{tr("键盘亮度")}</h3>
                  <span>{tr(brightness)}%</span>
                </div>
                <input
                  className="range"
                  aria-label={tr("键盘亮度")}
                  type="range"
                  min="0"
                  max="100"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  onPointerUp={() =>
                    run(command({ op: "settings", settings: { brightness } }))
                  }
                  onKeyUp={() =>
                    run(command({ op: "settings", settings: { brightness } }))
                  }
                />
                <p className="dock-hint">{tr("调整整体灯光亮度，不改变画笔颜色。")}</p>
              </section>
              <section className="paint-patterns">
                <h3>{tr("快速图案")}</h3>
                <div className="preset-buttons">
                  <Button
                    icon={<Heart size={16} />}
                    onClick={() => commit(heartColors(layout, color))}
                  >{tr("爱心")}</Button>
                  <Button
                    icon={<Brush size={16} />}
                    onClick={() => commit(blankColors())}
                  >{tr("清空")}</Button>
                </div>
                <button className="text-button preset-library-link" onClick={onBrowsePresets}>{tr("更多图案与灯效")}<ArrowRight size={12} /></button>
              </section>
              </> : <AnimationPanel
                draft={draft}
                setAnimation={setAnimation}
                layout={layout}
                frameIndex={frameIndex}
                setFrameIndex={setFrameIndex}
                onLoadFrame={(colors) => commit(colors)}
              />)}
              {tr((tool === "select" || selected.length > 0) && (
                <section className="selection-panel">
                  <div className="section-heading compact">
                    <h3>{tr("选中按键")}</h3>
                    <span>
                      {tr(selected.length ? `${selected.length} 个` : "")}
                    </span>
                  </div>
                  {tr(selected.length ? (
                    <>
                      <p className="selected-labels">
                        {tr(layout
                          .filter((k) => selected.includes(k.index))
                          .map((k) => k.label)
                          .join(" · "))}
                      </p>
                      <Button
                        className="full-width"
                        icon={<Check size={15} />}
                        onClick={() => {
                          const next = draft.colors.slice();
                          selected.forEach((i) => (next[i] = color));
                          commit(next);
                        }}
                      >{tr("应用当前颜色")}</Button>
                      <div className="selection-actions">
                        <button
                          onClick={() =>
                            setSelected(layout.map((k) => k.index))
                          }
                        >{tr("全选")}</button>
                        <button onClick={() => setSelected([])}>{tr("取消选择")}</button>
                        <button
                          onClick={() => {
                            const next = draft.colors.slice();
                            selected.forEach((i) => (next[i] = "#000000"));
                            commit(next);
                          }}
                        >{tr("熄灭")}</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="muted">{tr("使用「选择」工具，在键盘上选择一个或多个按键。")}</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setTool("select");
                          setSelected(layout.map((k) => k.index));
                        }}
                      >{tr("选择全部")}</button>
                    </>
                  ))}
                </section>
              ))}
            </aside>
          ))}
        </div>
      </div>
    </section>
  );
}

function AnimationPanel({
  draft,
  setAnimation,
  layout,
  frameIndex,
  setFrameIndex,
  onLoadFrame,
}: {
  draft: Scene;
  setAnimation: (patch: Partial<Animation>) => void;
  layout: Key[];
  frameIndex: number;
  setFrameIndex: (n: number) => void;
  onLoadFrame: (colors: string[]) => void;
}) {
  const animation = draft.animation,
    frames = animation.frames || [];
  const framePeak = useMemo(() => lightingPeak(frames.map(frame => frame.colors)), [frames]);
  return (
    <section className="animation-panel">
      <div className="animation-settings">
        <label>{tr("效果")}<select
            aria-label={tr("动画效果")}
            value={animation.effect}
            onChange={(e) =>
              setAnimation({ effect: e.target.value as Animation["effect"] })
            }
          >
            {tr(Object.entries(labels).map(([value, label]) => (
              <option value={value} key={value}>
                {tr(label)}
              </option>
            )))}
          </select>
        </label>
        {tr(animation.effect === "move" && (
        <div className="direction-field">
          <span>{tr("方向")}</span>
          <div className="direction-group">
            {tr(directions.map(([value, label, Icon]) => (
              <button
                aria-label={tr(label)}
                title={tr(label)}
                key={value}
                className={animation.direction === value ? "active" : ""}
                onClick={() => setAnimation({ direction: value })}
              >
                <Icon size={17} />
              </button>
            )))}
          </div>
        </div>
        ))}
        <label className="speed-field">{tr("速度")}<span>{tr(animation.speed)}</span>
          <input
            aria-label={tr("动画速度")}
            disabled={animation.effect === "static"}
            type="range"
            min="1"
            max="10"
            value={animation.speed}
            onChange={(e) => setAnimation({ speed: Number(e.target.value) })}
          />
        </label>
        <Switch
          label={tr("循环播放")}
          checked={animation.loop}
          onChange={(loop) => setAnimation({ loop })}
        />
      </div>
      {tr(animation.effect === "frames" && (
        <div className="frames-editor">
          <div className="section-heading">
            <h3>{tr("逐帧动画")}<span className="muted">{tr(frames.length)} {tr("帧")}</span>
            </h3>
            <Button
              icon={<Plus size={15} />}
              disabled={frames.length >= 120}
              title={tr(frames.length >= 120 ? "最多 120 帧" : undefined)}
              onClick={() => {
                setAnimation({
                  frames: [
                    ...frames,
                    { colors: draft.colors.slice(), duration: 500 },
                  ],
                });
                setFrameIndex(frames.length);
              }}
            >{tr("从画布添加一帧")}</Button>
          </div>
          <div className="frame-list">
            {tr(frames.map((frame, index) => (
              <div
                className={`frame-item ${frameIndex === index ? "active" : ""}`}
                key={index}
              >
                <button
                  className="frame-preview"
                  onClick={() => {
                    setFrameIndex(index);
                    onLoadFrame(frame.colors.slice());
                  }}
                  aria-label={tr(`编辑第 ${index + 1} 帧`)}
                >
                  <Keyboard layout={layout} colors={frame.colors} lightPreview lightPreviewPeak={framePeak} mini />
                  <span>{tr(`第 ${index + 1} 帧`)}</span>
                </button>
                <label>{tr("时长")}<FrameDuration
                    value={frame.duration}
                    index={index}
                    onChange={(duration) =>
                      setAnimation({
                        frames: frames.map((f, i) =>
                          i === index ? { ...f, duration } : f,
                        ),
                      })
                    }
                  />
                  <span>ms</span>
                </label>
                <div className="frame-actions">
                  <button
                    onClick={() =>
                      setAnimation({
                        frames: frames.map((f, i) =>
                          i === index
                            ? { ...f, colors: draft.colors.slice() }
                            : f,
                        ),
                      })
                    }
                  >{tr("更新画面")}</button>
                  <button
                    aria-label={tr(`复制第 ${index + 1} 帧`)}
                    title={tr("复制帧")}
                    disabled={frames.length >= 120}
                    onClick={() =>
                      setAnimation({
                        frames: [
                          ...frames.slice(0, index + 1),
                          {
                            colors: frame.colors.slice(),
                            duration: frame.duration,
                          },
                          ...frames.slice(index + 1),
                        ],
                      })
                    }
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    aria-label={tr(`删除第 ${index + 1} 帧`)}
                    title={tr("删除帧")}
                    onClick={() => {
                      setAnimation({
                        frames: frames.filter((_, i) => i !== index),
                      });
                      setFrameIndex(Math.max(0, index - 1));
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )))}
            {tr(!frames.length && (
              <p className="muted">{tr("先在画布绘制，再添加为第一帧。点击帧可编辑，绘制后用「更新画面」保存这一帧。")}</p>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function FrameDuration({
  value,
  index,
  onChange,
}: {
  value: number;
  index: number;
  onChange: (value: number) => void;
}) {
  const [input, setInput] = useState(String(value));
  useEffect(() => setInput(String(value)), [value]);
  const commit = () => {
    const duration = Math.round(
      Math.max(80, Math.min(10000, Number(input) || 80)),
    );
    setInput(String(duration));
    onChange(duration);
  };
  return (
    <input
      aria-label={tr(`第 ${index + 1} 帧时长`)}
      type="number"
      min="80"
      max="10000"
      value={input}
      onChange={(event) => setInput(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
