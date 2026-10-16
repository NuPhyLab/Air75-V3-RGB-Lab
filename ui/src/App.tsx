import { t as tr } from "./i18n";
import { useCallback, useEffect, useState } from "react";
import {useCodexKeys} from './codexKeys';
import {
  Check,
  CircleAlert,
  SquareTerminal,
  Folder,
  Keyboard,
  PenLine,
  LayoutGrid,
  Play,
  Heart,
  Gamepad2,
  AudioLines,
  Settings,
  X,
} from "lucide-react";
import { useAirApi } from "./api";
import {AudioPanel} from "./AudioPanel";
import { Studio } from "./Studio";
import { Library } from "./Library";
import { Codex } from "./Codex";
import { ClaudeCode } from "./ClaudeCode";
import { agentSource, AGENT_LABELS } from "./AgentSourceSwitch";
import { Device } from "./Device";
import { useTriggerKeys } from "./TriggerPanel";
import { validateTrigger } from "../../shared/trigger.mjs";
import { Button, Modal, run } from "./primitives";
import { presets } from "./presets";
import { blankColors, DEFAULT_ANIMATION, STUDIO_MODES } from "./types";
import type { Scene, StudioMode } from "./types";
import {useLanguage, setLanguage, type Language} from "./i18n";
type Page = "studio" | "library" | "codex" | "device" | "audio";
// One navigation entry, named after whichever integration is currently selected.
const MODE_ICONS = { paint: PenLine, animation: Play, trigger: Heart, game: Gamepad2 };
const cloneScene = (scene: Scene): Scene => JSON.parse(JSON.stringify(scene));
const modeForScene = (scene: Scene): StudioMode =>
  scene.trigger ? "trigger" : scene.animation.effect === "static" ? "paint" : "animation";
const restoreTrigger = (value: unknown) => {
  if (value === undefined) return undefined;
  try { return validateTrigger(value); }
  catch { return undefined; }
};
export default function App() {
  const language = useLanguage();
  const [draftSession, setDraftSession] = useState(0);
  const [studioMode, setStudioMode] = useState<StudioMode>("paint");
  const [focusCodexColors,setFocusCodexColors] = useState(false);
  const [page, setPage] = useState<Page>("studio"),
    [draft, setDraft] = useState<Scene>({
      name: "一颗小心意",
      colors: blankColors(),
      animation: { ...DEFAULT_ANIMATION },
    }),
    [draftReady, setDraftReady] = useState(false);
  const [toast, setToast] = useState<{
      id: number;
      message: string;
      kind: "error" | "success";
    } | null>(null),
    [saveOpen, setSaveOpen] = useState(false),
    [saveName, setSaveName] = useState(""),
    [saveBusy, setSaveBusy] = useState(false),
    [saveCopy, setSaveCopy] = useState(false);
  const notify = useCallback(
    (message: string, kind: "error" | "success" = "error") =>
      setToast({ id: Date.now(), message, kind }),
    [],
  );
  const { state, layout, serviceError, command, exiting } = useAirApi(notify);
  useEffect(()=>{if(page!=="codex")setFocusCodexColors(false);},[page]);
  useCodexKeys(state,command,notify);
  useEffect(()=>{const value=state?.settings.language;if(value === "en" || value === "zh-CN") setLanguage(value);},[state?.settings.language]);
  useEffect(()=>{
    if (!state?.settings.lightIdleMs) return;
    let last = -Infinity;
    const activity=()=>{if(performance.now()-last<250)return;last=performance.now();void command({op:"lightActivity"}).catch(()=>{});};
    window.addEventListener("pointerdown",activity);window.addEventListener("keydown",activity);
    return ()=>{window.removeEventListener("pointerdown",activity);window.removeEventListener("keydown",activity);};
  },[state?.settings.lightIdleMs,command]);
  useTriggerKeys(state, command);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!layout.length || draftReady) return;
    let restored = presets(layout)[0];
    try {
      const saved = localStorage.getItem("air-studio-draft-v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed.colors) &&
          parsed.colors.length === 84 &&
          parsed.colors.every(
            (c: unknown) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c),
          ) &&
          parsed.animation &&
          parsed.name
        )
          restored = {
            ...parsed,
            trigger: restoreTrigger(parsed.trigger),
            animation: {
              ...parsed.animation,
              effect:
                parsed.animation.effect === "rainbow"
                  ? "static"
                  : parsed.animation.effect,
            },
          };
      }
    } catch {}
    setDraft(restored);
    setStudioMode(modeForScene(restored));
    setDraftReady(true);
    setDraftSession((value) => value + 1);
  }, [layout, draftReady]);
  useEffect(() => {
    if (draftReady)
      try {
        localStorage.setItem("air-studio-draft-v1", JSON.stringify(draft));
      } catch {}
  }, [draft, draftReady]);
  const openSave = () => {
    setSaveName(draft.name);
    setSaveCopy(false);
    setSaveOpen(true);
  };
  const save = async () => {
    if (!saveName.trim()) return;
    setSaveBusy(true);
    try {
      const scene = {
        ...draft,
        name: saveName.trim(),
        ...(saveCopy ? { id: undefined } : {}),
      };
      const raw = await command({ op: "saveScene", scene });
      const value = raw as
        | { savedScene?: Scene; scene?: Scene; id?: string }
        | undefined;
      const saved =
        value?.savedScene ||
        value?.scene ||
        (value?.id ? (value as Scene) : undefined);
      setDraft(saved?.colors ? saved : { ...scene, id: saved?.id || scene.id });
      setSaveOpen(false);
      notify("作品已保存到这台 Mac", "success");
    } finally {
      setSaveBusy(false);
    }
  };
  const load = (scene: Scene) => {
    run(
      (async () => {
        if (
          state &&
          (state.playback.mode !== "idle" ||
            state.game.status !== "idle" ||
            state.device.armed)
        )
          await command({ op: "stop" });
        setDraft(cloneScene(scene));
        setStudioMode(modeForScene(scene));
        setDraftSession((value) => value + 1);
        setPage("studio");
      })(),
    );
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-symbol" src="/nuphy-studio.png" alt="" width={32} height={32} />
          <span>NuPhyLab</span>
        </div>
        <nav aria-label={tr("主导航")}>
          <div className="studio-nav-group">
            <button
              className={`studio-nav-parent ${["studio","audio"].includes(page) ? "section-active" : ""}`}
              onClick={() => setPage("studio")}
              aria-controls="studio-subnav"
            >
              <LayoutGrid className="nav-icon" size={18} strokeWidth={1.75} />
              <span>{tr("创作台")}</span>
            </button>
            <div id="studio-subnav" className="studio-subnav" role="group" aria-label={tr("创作台功能")}>
              {tr(STUDIO_MODES.map(({ id, label }) => { const Icon = MODE_ICONS[id]; return (
                <button
                  key={id}
                  className={`studio-nav-child ${page === "studio" && studioMode === id ? "active" : ""}`}
                  aria-current={page === "studio" && studioMode === id ? "page" : undefined}
                  onClick={() => { setStudioMode(id); setPage("studio"); }}
                >
                  <Icon className="nav-icon" size={18} strokeWidth={1.75} />
                  <span>{tr(label)}</span>
                </button>
              ); }))}
              <button className={`studio-nav-child ${page === "audio" ? "active" : ""}`} aria-current={page === "audio" ? "page" : undefined} onClick={()=>setPage("audio")}><AudioLines className="nav-icon" size={18} strokeWidth={1.75}/><span>{tr("声音律动")}</span></button>
            </div>
          </div>
          {tr((
            [
              ["library", "作品库", Folder],
              ["codex", AGENT_LABELS[agentSource(state)], SquareTerminal],
              ["device", "设备", Settings],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon className="nav-icon" size={18} strokeWidth={1.75} />
              <span>{tr(label)}</span>
            </button>
          )))}
        </nav>
        <label className="language-selector" translate="no">
          <span>语言 / Language</span>
          <select aria-label="Language / 语言" value={language} onChange={e=>run(command({op:"settings",settings:{language:e.target.value as Language}}))}>
            <option value="zh-CN">简体中文</option><option value="en">English</option>
          </select>
        </label>
        <button className="sidebar-device" onClick={() => setPage("device")}>
          <Keyboard className="nav-icon" size={18} strokeWidth={1.75} />
          <span>
            Air75 V3
            <small>
              <i
                className={`status-dot ${state?.device.connected || state?.bluetooth?.connected ? "green" : ""}`}
              />
              {tr(state?.device.connected ? "已连接" : state?.bluetooth?.connected ? "蓝牙已连接" : state?.device.autoConnecting ? "等待连接" : "未连接")}
            </small>
          </span>
        </button>
      </aside>
      <main>
        {exiting && <div className="wireless-notice" role="status">{tr("正在恢复键盘并退出…")}</div>}
        {tr(serviceError && (
          <div className="service-error" role="status">
            <CircleAlert size={16} />
            <span>{tr("本地服务未响应：")}{tr(serviceError)}</span>
          </div>
        ))}
        <div className="page-content" inert={exiting}>
          {state?.bluetooth?.connected && !state.device.connected && ['studio','library'].includes(page) && <div className="wireless-notice" role="status"><strong>{tr("蓝牙已连接 · 灯光需接线")}</strong><p>{tr("可以编辑、预览和保存作品；播放到键盘、按键灯效及灯光游戏需要 USB 有线连接。")}</p></div>}
          {tr(page !== "device" && state?.device.connected &&
            (state.firmware?.status === "updateAvailable" || state.firmware?.compatible === false) && (
            <div className="firmware-notice" role="status">
              <CircleAlert size={17} />
              <span>{tr(state.firmware.status === "updateAvailable"
                ? `Air75 V3 有新固件 ${state.firmware.latest}，当前为 ${state.firmware.current}。`
                : "已识别键盘，但逐键灯效协议检查未通过。请更新 NuPhyLab 并查看设备详情。")}</span>
              <Button kind="ghost" onClick={() => setPage("device")}>{tr("查看更新")}</Button>
            </div>
          ))}
          {tr(page === "studio" && (
            <Studio
              key={draftSession}
              mode={studioMode}
              layout={layout}
              state={state}
              command={command}
              draft={draft}
              setDraft={setDraft}
              onSave={openSave}
              onBrowsePresets={() => setPage("library")}
              onEditCodexColors={()=>{setFocusCodexColors(true);setPage("codex");}}
              notify={notify}
            />
          ))}{tr(" ")}
          {page === "audio" && <AudioPanel state={state} layout={layout} command={command}/>}
          {tr(page === "library" && (
            <Library
              layout={layout}
              state={state}
              command={command}
              onLoad={load}
              onNew={() =>
                load({
                  name: "未命名作品",
                  colors: blankColors(),
                  animation: { ...DEFAULT_ANIMATION },
                })
              }
              notify={notify}
            />
          ))}{tr(" ")}
          {tr(page === "codex" && (agentSource(state) === "claude"
            ? <ClaudeCode state={state} command={command} notify={notify} focusColors={focusCodexColors} />
            : <Codex state={state} command={command} focusColors={focusCodexColors} />))}{tr(" ")}
          {tr(page === "device" && (
            <Device
              state={state}
              command={command}
              serviceError={serviceError}
            />
          ))}
        </div>
      </main>
      {tr(toast && (
        <div
          className={`toast ${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          {tr(toast.kind === "success" ? (
            <Check size={17} />
          ) : (
            <CircleAlert size={17} />
          ))}
          <span>{tr(toast.message)}</span>
          <button onClick={() => setToast(null)} aria-label={tr("关闭提示")}>
            <X size={16} />
          </button>
        </div>
      ))}
      {tr(saveOpen && (
        <Modal title={tr("保存作品")} onClose={() => setSaveOpen(false)}>
          <label className="form-field">{tr("作品名称")}<input
              autoFocus
              aria-label={tr("保存作品名称")}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter") run(save());
              }}
            />
          </label>
          {tr(draft.id && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={saveCopy}
                onChange={(e) => setSaveCopy(e.target.checked)}
              />{tr("另存为新作品")}</label>
          ))}
          <p className="muted">{tr("图案、配色和灯效设置会一起保存。")}</p>
          <div className="modal-actions">
            <Button onClick={() => setSaveOpen(false)}>{tr("取消")}</Button>
            <Button
              kind="primary"
              busy={saveBusy}
              disabled={!saveName.trim()}
              onClick={() => run(save())}
            >{tr("保存作品")}</Button>
          </div>
        </Modal>
      ))}
    </div>
  );
}
