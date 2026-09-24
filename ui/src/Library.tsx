import { t as tr, dateLocale } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Import,
  MoreHorizontal,
  Pencil,
  Play,
  Pause,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { exportScenes } from "./api";
import { Keyboard, lightingPeak } from "./Keyboard";
import { Button, Empty, Modal, run } from "./primitives";
import { presetCatalog } from "./presets";
import { renderAnimation } from "../../shared/render-animation.mjs";
import type { Preset } from "../../shared/presets.mjs";
import type { AppState, Command, Key, Notify, Scene } from "./types";
const effectNames: Record<string, string> = {
  static: "静态",
  move: "移动",
  pulse: "呼吸",
  wave: "波浪",
  frames: "逐帧",
};
export function Library({
  state,
  layout,
  onLoad,
  onNew,
  command,
  notify,
}: {
  state: AppState | null;
  layout: Key[];
  onLoad: (scene: Scene) => void;
  onNew: () => void;
  command: Command;
  notify: Notify;
}) {
  const [search, setSearch] = useState(""),
    [rename, setRename] = useState<Scene | null>(null),
    [name, setName] = useState(""),
    [deleting, setDeleting] = useState<Scene | null>(null),
    [menu, setMenu] = useState<string | undefined>(),
    [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"saved" | "presets">("presets");
  const [category, setCategory] = useState<"all" | "pattern" | "motion">("all");
  const [previewId, setPreviewId] = useState<string>();
  const catalog = useMemo(() => layout.length ? presetCatalog(layout) : [], [layout]);
  const matchingPresets = catalog.filter((preset) =>
    (category === "all" || preset.category === category) &&
    `${tr(preset.name)} ${tr(preset.description)} ${tr(preset.name)}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  useEffect(() => { setPreviewId(undefined); }, [source, category, search]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setPreviewId(undefined); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  const openPreset = (preset: Preset) => {
    setPreviewId(undefined);
    // Preset identity belongs to the catalog; each saved edit gets a fresh scene ID.
    onLoad({ name: tr(preset.name), colors: preset.colors, animation: preset.animation });
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const scenes = state?.scenes || [],
    filtered = scenes.filter((scene) =>
      scene.name.toLowerCase().includes(search.toLowerCase()),
    );
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const list = Array.isArray(value)
        ? value
        : Array.isArray(value.scenes)
          ? value.scenes
          : value.colors
            ? [value]
            : null;
      if (!list) throw new Error("文件里没有可导入的作品");
      await command({ op: "importScenes", scenes: list });
      setSource("saved");
      setSearch("");
      setPreviewId(undefined);
      notify(`已导入 ${list.length} 个作品`, "success");
    } catch (error) {
      if (error instanceof SyntaxError)
        notify("无法读取 JSON 文件，请检查文件格式");
      else if (error instanceof Error) notify(error.message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const renameScene = async () => {
    if (!rename || !name.trim()) return;
    setBusy(true);
    try {
      await command({
        op: "saveScene",
        scene: { ...rename, name: name.trim() },
      });
      setRename(null);
      notify("作品已重命名", "success");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{tr("作品库")}</h1>
          <p>{tr("收好灵感，下次继续。")}</p>
        </div>
        <div className="header-actions">
          <Button
            icon={<Import size={16} />}
            onClick={() => fileInput.current?.click()}
          >{tr("导入")}</Button>
          <Button
            icon={<Download size={16} />}
            disabled={!scenes.length}
            onClick={() => exportScenes(scenes, tr("NuPhyLab-作品.json"))}
          >{tr("导出全部")}</Button>
          <Button kind="primary" icon={<Plus size={16} />} onClick={onNew}>{tr("新建作品")}</Button>
        </div>
      </header>
      <input
        ref={fileInput}
        type="file" aria-label={tr("导入")}
        accept=".json,application/json"
        className="visually-hidden"
        onChange={(e) => run(importFile(e.target.files?.[0]))}
      />
      <div className="library-toolbar">
        <div className="library-sources" role="group" aria-label={tr("作品来源")}>
          <button className={source === "presets" ? "active" : ""} aria-pressed={source === "presets"}
            onClick={() => { setSource("presets"); setSearch(""); }}>{tr("默认预设")}<span>{tr(catalog.length)}</span></button>
          <button className={source === "saved" ? "active" : ""} aria-pressed={source === "saved"}
            onClick={() => { setSource("saved"); setSearch(""); }}>{tr("我的作品")}<span>{tr(scenes.length)}</span></button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label={tr(source === "presets" ? "搜索预设" : "搜索作品")}
            placeholder={tr(source === "presets" ? "搜索图案或灯效" : "搜索作品")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {tr(source === "presets" ? (
        <section className="preset-library" aria-label={tr("默认预设")}>
          <div className="preset-library-toolbar">
            <div className="preset-filters" role="group" aria-label={tr("预设分类")}>
              {tr(([["all", "全部"], ["pattern", "动态图形"], ["motion", "氛围灯效"]] as const).map(([id, label]) => (
                <button key={id} className={category === id ? "active" : ""} aria-pressed={category === id}
                  onClick={() => setCategory(id)}>{tr(label)}</button>
              )))}
            </div>
            <p>{tr("先预览，再使用；配色和效果都可以继续修改。")}</p>
          </div>
          {tr(!layout.length ? <Empty icon={<FolderOpen size={28} />} title={tr("正在读取键盘布局")}>{tr("布局就绪后显示预设图案。")}</Empty> : matchingPresets.length ? <div className="preset-grid">
            {tr(matchingPresets.map((preset) => (
              <article className="preset-card" key={preset.id}>
                <button className="preset-art" aria-label={tr(`打开预设 ${tr(preset.name)}`)}
                  onClick={() => openPreset(preset)}>
                  <PresetKeyboard preset={preset} layout={layout} active={previewId === preset.id} />
                </button>
                <div className="preset-info">
                  <div className="preset-title"><h3>{tr(preset.name)}</h3><span>{tr(preset.animation.effect === "pulse" ? "呼吸" : "循环")}</span></div>
                  <p>{tr(preset.description)}</p>
                  <div className="preset-card-actions">
                    <button className="preset-preview" aria-pressed={previewId === preset.id} aria-label={tr(`${tr(previewId === preset.id ? "停止预览" : "预览灯效")} ${tr(preset.name)}`)}
                      onClick={() => setPreviewId(previewId === preset.id ? undefined : preset.id)}>
                      {tr(previewId === preset.id ? <Pause size={13} /> : <Play size={13} />)}
                      {tr(previewId === preset.id ? "停止预览" : "页面预览")}
                    </button>
                    <Button kind="ghost" onClick={() => openPreset(preset)} aria-label={tr(`使用预设 ${tr(preset.name)}`)}>
                      {tr("使用灯效")}
                    </Button>
                  </div>
                </div>
              </article>
            )))}
          </div> : <Empty icon={<Search size={28} />} title={tr("没有找到预设")}>{tr("换一个关键词，或切换分类试试。")}</Empty>)}
          <p className="preset-preview-note">{tr("页面预览不会改变键盘灯光。使用后进入创作台，可保存为自己的作品。")}</p>
        </section>
      ) : filtered.length ? (
        <div className="scene-grid">
          {tr(filtered.map((scene) => (
            <article key={scene.id} className="scene-card">
              <button
                className="scene-art"
                onClick={() => onLoad(scene)}
                aria-label={tr(`打开作品 ${scene.name}`)}
              >
                <Keyboard layout={layout} colors={scene.colors} mini />
              </button>
              <div className="scene-card-info">
                <div>
                  <h3 translate="no">{scene.name}</h3>
                  <p>
                    {tr(scene.trigger ? "按键触发" : effectNames[scene.animation.effect] ||
                      scene.animation.effect)}
                    {tr(!scene.trigger && scene.animation.effect === "frames"
                      ? ` · ${scene.animation.frames?.length || 0} 帧`
                      : "")}
                    {tr(scene.updatedAt
                      ? ` · ${new Date(scene.updatedAt).toLocaleDateString(dateLocale(), { month: "numeric", day: "numeric" })}`
                      : "")}
                  </p>
                </div>
                <div className="scene-menu">
                  <Button
                    kind="ghost"
                    className="icon-button"
                    icon={<MoreHorizontal size={20} />}
                    aria-label={tr(`作品 ${scene.name} 的更多操作`)}
                    onClick={() =>
                      setMenu(menu === scene.id ? undefined : scene.id)
                    }
                  />
                  {tr(menu === scene.id && (
                    <div className="dropdown">
                      <button
                        onClick={() => {
                          setRename(scene);
                          setName(scene.name);
                          setMenu(undefined);
                        }}
                      >
                        <Pencil size={15} />{tr("重命名")}</button>
                      <button
                        onClick={() => {
                          exportScenes([scene], `${scene.name}.json`);
                          setMenu(undefined);
                        }}
                      >
                        <Download size={15} />{tr("导出作品")}</button>
                      <button
                        className="danger-text"
                        onClick={() => {
                          setDeleting(scene);
                          setMenu(undefined);
                        }}
                      >
                        <Trash2 size={15} />{tr("删除作品")}</button>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          )))}
        </div>
      ) : (
        <Empty
          icon={<FolderOpen size={34} />}
          title={tr(search ? "没有找到作品" : "还没有保存的作品")}
        >
          {tr(search
            ? "换一个名字试试。"
            : "在创作台绘制图案，点击「保存作品」就会出现在这里。")}
        </Empty>
      ))}
      {tr(rename && (
        <Modal title={tr("重命名作品")} onClose={() => setRename(null)}>
          <label className="form-field">{tr("作品名称")}<input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter") run(renameScene());
              }}
            />
          </label>
          <div className="modal-actions">
            <Button onClick={() => setRename(null)}>{tr("取消")}</Button>
            <Button
              kind="primary"
              busy={busy}
              disabled={!name.trim()}
              onClick={() => run(renameScene())}
            >{tr("保存名称")}</Button>
          </div>
        </Modal>
      ))}
      {tr(deleting && (
        <Modal title={tr("删除作品")} onClose={() => setDeleting(null)}>
          <p>{tr("删除「")}<span translate="no">{deleting.name}</span>{tr("」？已导出的文件会保留。")}</p>
          <div className="modal-actions">
            <Button onClick={() => setDeleting(null)}>{tr("取消")}</Button>
            <Button
              kind="danger"
              onClick={() =>
                run(
                  command({ op: "deleteScene", id: deleting.id }).then(() => {
                    setDeleting(null);
                    notify("作品已删除", "success");
                  }),
                )
              }
            >{tr("删除")}</Button>
          </div>
        </Modal>
      ))}
    </>
  );
}

function PresetKeyboard({ preset, layout, active }: { preset: Preset; layout: Key[]; active: boolean }) {
  const [colors, setColors] = useState(preset.colors);
  const peak = useMemo(() => lightingPeak([preset.colors, ...preset.animation.frames.map(frame => frame.colors)]), [preset]);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const update = () => setColors(renderAnimation(preset.colors, preset.animation, performance.now() - start));
    update();
    const timer = window.setInterval(update, 60);
    return () => window.clearInterval(timer);
  }, [active, preset]);
  return <Keyboard layout={layout} colors={active ? colors : preset.colors} lightPreview lightPreviewPeak={peak} mini />;
}
