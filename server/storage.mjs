import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LED_COUNT, defaultAnimation } from "../shared/layout.mjs";
import { GAME_TYPES, validateGameType } from "../shared/games.mjs";
import { validateTrigger } from "../shared/trigger.mjs";
import { validateStatusColors } from "../shared/codex-lighting.mjs";
import { DEFAULT_LIGHT_TIME_MS, validLightTime } from "../shared/lighting-power.mjs";
export function validateColors(colors) {
  if (
    !Array.isArray(colors) ||
    colors.length !== LED_COUNT ||
    colors.some((c) => typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))
  )
    throw new Error("颜色数据必须包含 84 个有效的 RGB 颜色");
  return colors.map((c) => c.toLowerCase());
}
export function validateAnimation(a = {}, { legacy = false } = {}) {
  if (!a || typeof a !== "object" || Array.isArray(a))
    throw new Error("动画格式无效");
  const out = { ...defaultAnimation };
  if (a.effect !== undefined) {
    // Preserve old artwork when loading/importing a removed effect.
    const effect = legacy && a.effect === "rainbow" ? "static" : a.effect;
    if (!["static", "move", "pulse", "wave", "frames"].includes(effect))
      throw new Error("不支持这个动画类型");
    out.effect = effect;
  }
  if (a.direction !== undefined) {
    if (!["left", "right", "up", "down"].includes(a.direction))
      throw new Error("移动方向无效");
    out.direction = a.direction;
  }
  if (a.speed !== undefined) {
    if (!Number.isFinite(a.speed) || a.speed < 1 || a.speed > 10)
      throw new Error("速度应在 1–10 之间");
    out.speed = a.speed;
  }
  if (a.loop !== undefined) {
    if (typeof a.loop !== "boolean") throw new Error("循环设置无效");
    out.loop = a.loop;
  }
  if (a.frames !== undefined) {
    if (!Array.isArray(a.frames) || a.frames.length > 120)
      throw new Error("最多保存 120 帧");
    out.frames = a.frames.map((f) => {
      if (
        !f ||
        !Number.isFinite(f.duration) ||
        f.duration < 80 ||
        f.duration > 10000
      )
        throw new Error("每帧时长应为 80–10000 毫秒");
      return {
        colors: validateColors(f.colors),
        duration: Math.round(f.duration),
      };
    });
  }
  if (out.effect === "frames" && !out.frames.length)
    throw new Error("请先添加至少一帧");
  return out;
}
export function validateScene(scene, now = new Date().toISOString()) {
  if (
    !scene ||
    typeof scene !== "object" ||
    typeof scene.name !== "string" ||
    !scene.name.trim() ||
    scene.name.length > 80
  )
    throw new Error("作品名称应为 1–80 个字符");
  if (
    scene.id !== undefined &&
    (typeof scene.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(scene.id))
  )
    throw new Error("作品 ID 无效");
  return {
    id: scene.id ?? randomUUID(),
    name: scene.name.trim(),
    colors: validateColors(scene.colors),
    animation: validateAnimation(scene.animation, { legacy: true }),
    ...(scene.trigger !== undefined ? { trigger: validateTrigger(scene.trigger) } : {}),
    createdAt:
      typeof scene.createdAt === "string" &&
      Number.isFinite(Date.parse(scene.createdAt))
        ? scene.createdAt
        : now,
    updatedAt: now,
  };
}
import {DEFAULT_TASK_KEYS, DEFAULT_COMMAND_KEYS, validateCodexKeys} from '../shared/codex-keys.mjs';
import {DEFAULT_CLAUDE_TASK_KEYS, DEFAULT_CLAUDE_COMMAND_KEYS, validateClaudeKeys} from '../shared/claude-keys.mjs';
import {validateClaudeStatusColors} from '../shared/claude-lighting.mjs';
import {DEFAULT_CLAUDE_COMMAND_IDS, CLAUDE_TASK_ACTIONS, isClaudeCommandId} from './claude-actions.mjs';
import {DEFAULT_AUDIO,validateAudio} from "../shared/audio-reactive.mjs";
export const defaultSettings = {
  audio: {...DEFAULT_AUDIO},
  codexTaskKeys: [...DEFAULT_TASK_KEYS],
  codexCommandKeys: [...DEFAULT_COMMAND_KEYS],
  language: "zh-CN",
  lightDurationMs: DEFAULT_LIGHT_TIME_MS,
  lightIdleMs: DEFAULT_LIGHT_TIME_MS,
  brightness: 70,
  codexEnabled: false,
  codexKeyAdaptation: false,
  codexKeycapFallback: false,
  quotaSideEnabled: false,
  slotIds: [],
  autoConnect: true,
  codexTaskSource: "recent",
  codexLightMode: "keys",
  codexWholeTaskId: "",
  codexBrightness: 100,
  codexSelectedPulse: true,
  codexAmbient: false,
  codexCommandIds: ["modelPicker", "newTask", "dictation", "voice", "toggleTerminal", "settings"],
  agentSource: "codex",
  claudeEnabled: false,
  claudeTaskKeys: [...DEFAULT_CLAUDE_TASK_KEYS],
  claudeCommandKeys: [...DEFAULT_CLAUDE_COMMAND_KEYS],
  claudeTaskSource: "recent",
  claudeSlotIds: [],
  claudeLightMode: "keys",
  claudeWholeTaskId: "",
  claudeBrightness: 100,
  claudeSelectedPulse: true,
  claudeAmbient: false,
  claudeTaskAction: "openSession",
  claudeCommandIds: [...DEFAULT_CLAUDE_COMMAND_IDS],
};
export function validateSettings(input, previous = defaultSettings) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("设置格式无效");
  const s = { ...previous };
  for (const [k, v] of Object.entries(input)) {
    if (k === "audio") {
      s.audio = validateAudio(v,previous.audio ?? DEFAULT_AUDIO);
    } else if (k === "agentSource") {
      if (!["codex", "claude"].includes(v)) throw new Error("任务来源应用无效");
      s[k] = v;
    } else if (k === "brightness" || k === "codexBrightness" || k === "claudeBrightness") {
      if (!Number.isFinite(v) || v < 0 || v > 100)
        throw new Error("亮度应在 0–100 之间");
      s[k] = v;
    } else if (
      ["codexEnabled", "codexKeyAdaptation", "codexKeycapFallback", "quotaSideEnabled", "autoConnect", "codexSelectedPulse", "codexAmbient",
        "claudeEnabled", "claudeSelectedPulse", "claudeAmbient"].includes(k)
    ) {
      if (typeof v !== "boolean") throw new Error("开关设置无效");
      s[k] = v;
    } else if (k === "codexStatusColors") {
      s[k]=validateStatusColors(v,previous.codexStatusColors);
    } else if (k === "claudeStatusColors") {
      s[k]=validateClaudeStatusColors(v,previous.claudeStatusColors);
    } else if (k === "claudeTaskSource") {
      if (!["recent", "active", "attention", "custom"].includes(v)) throw new Error("会话来源无效");
      s[k] = v;
    } else if (k === "claudeTaskAction") {
      if (!CLAUDE_TASK_ACTIONS.includes(v)) throw new Error("会话跳转动作无效");
      s[k] = v;
    } else if (k === "claudeCommandIds") {
      if (!Array.isArray(v) || v.length !== 6 || v.some(id => typeof id !== "string" || !isClaudeCommandId(id)))
        throw new Error("命令键配置无效");
      s[k] = [...v];
    } else if (k === "claudeSlotIds") {
      if (!Array.isArray(v) || v.length > 6 || v.some(id => typeof id !== "string" || (id && !/^[A-Za-z0-9_.:-]{1,80}$/.test(id))))
        throw new Error("会话绑定格式无效");
      s[k] = [...v];
    } else if (k === "claudeWholeTaskId") {
      if (typeof v !== "string" || v.length > 80 || (v && !/^[A-Za-z0-9_.:-]+$/.test(v))) throw new Error("会话绑定格式无效");
      s[k] = v;
    } else if (k === "claudeLightMode") {
      if (!["keys","whole"].includes(v)) throw new Error("灯光模式无效");
      s[k] = v;
    } else if (k === "claudeTaskKeys" || k === "claudeCommandKeys") {
      s[k] = Array.isArray(v) ? [...v] : v;
    } else if (k === "codexLightMode") {
      if (!["keys","whole"].includes(v)) throw new Error("灯光模式无效");
      s[k] = v;
    } else if (k === "codexWholeTaskId") {
      if (typeof v !== "string" || v.length > 100 || (v && !/^[a-zA-Z0-9_-]+$/.test(v))) throw new Error("任务绑定格式无效");
      s[k] = v;
    } else if (k === "codexTaskSource") {
      if (!["recent", "pinned", "priority", "custom"].includes(v)) throw new Error("任务来源无效");
      s[k] = v;
    // Accept legacy fields for existing libraries; rendering ignores them.
    } else if (["codexAutoOffMs", "lightDurationMs", "lightIdleMs", "codexHintMs"].includes(k)) {
      if (!validLightTime(v, {allowOff:k !== "codexHintMs", maximum:k === "codexHintMs" ? 600000 : 86400000})) throw new Error("时间应为 1 秒至 24 小时，提示亮灯最长 10 分钟；0 表示关闭定时。");
      s[k] = v;
    } else if (k === "language") {
      if (!["zh-CN", "en"].includes(v)) throw new Error("不支持的界面语言");
      s[k] = v;
    } else if (k === "codexCommandIds") {
      if (!Array.isArray(v) || v.length !== 6 || v.some(id => typeof id !== "string" || !/^[a-zA-Z0-9.]{1,80}$/.test(id))) throw new Error("命令键配置无效");
      s[k] = [...v];
    } else if (k === "codexTaskKeys" || k === "codexCommandKeys") {
      s[k] = Array.isArray(v) ? [...v] : v;
    } else if (k === "slotIds") {
      if (
        !Array.isArray(v) ||
        v.length > 6 ||
        v.some((i) => typeof i !== "string" || i.length > 100)
      )
        throw new Error("任务绑定格式无效");
      s[k] = v;
    } else throw new Error("不支持的设置项：" + k);
  }
  validateCodexKeys(s);
  validateClaudeKeys(s);
  return s;
}
export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, "library.json");
    this.data = {
      version: 1,
      scenes: [],
      settings: { ...defaultSettings },
      bestScore: 0,
      gameBestScores: Object.fromEntries(GAME_TYPES.map((type) => [type, 0])),
    };
    this.warning = null;
  }
  async load() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    try {
      const data = JSON.parse(await readFile(this.file, "utf8"));
      if (
        data.version !== 1 ||
        !Array.isArray(data.scenes) ||
        data.scenes.length > 200
      )
        throw new Error("作品库版本或格式不支持");
      const oldBest = Number.isFinite(data.bestScore) ? Math.max(0, Math.floor(data.bestScore)) : 0;
      const gameBestScores = Object.fromEntries(GAME_TYPES.map((type) => {
        const value = data.gameBestScores?.[type];
        return [type, Number.isInteger(value) && value >= 0 ? value : type === "snake" ? oldBest : 0];
      }));
      this.data = {
        version: 1,
        scenes: data.scenes.map((s) => validateScene(s, s.updatedAt)),
        settings: validateSettings({
          ...data.settings,
          ...(!data.settings?.codexTaskSource && data.settings?.slotIds?.some(Boolean)
            ? {codexTaskSource:"custom"} : {}),
        }),
        bestScore: gameBestScores.snake,
        gameBestScores,
      };
    } catch (e) {
      if (e.code !== "ENOENT") {
        this.warning =
          "作品库读取失败，原文件已保留；当前使用空白工作区。" + e.message;
        this.readOnly = true;
      }
    }
    return this;
  }
  async commit(next) {
    if (this.readOnly)
      throw new Error(
        "原作品库格式异常，已保留原文件。请在设备页面查看存储位置并备份后修复。",
      );
    const tmp = this.file + ".tmp";
    await writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(tmp, this.file);
    this.data = next;
  }
  async saveScene(scene) {
    const entry = validateScene(scene),
      scenes = [...this.data.scenes];
    const i = scenes.findIndex((s) => s.id === entry.id);
    if (i >= 0) {
      entry.createdAt = scenes[i].createdAt;
      scenes[i] = entry;
    } else {
      if (scenes.length >= 200) throw new Error("作品库最多保存 200 个作品");
      scenes.unshift(entry);
    }
    await this.commit({ ...this.data, scenes });
    return entry;
  }
  async deleteScene(id) {
    if (!this.data.scenes.some((s) => s.id === id))
      throw new Error("找不到这个作品");
    await this.commit({
      ...this.data,
      scenes: this.data.scenes.filter((s) => s.id !== id),
    });
  }
  async importScenes(input) {
    if (!Array.isArray(input) || !input.length || input.length > 200)
      throw new Error("请选择包含 1–200 个作品的文件");
    const imported = input.map((s) =>
      validateScene({ ...s, id: randomUUID() }),
    );
    if (this.data.scenes.length + imported.length > 200)
      throw new Error("导入后作品数量超过 200");
    await this.commit({
      ...this.data,
      scenes: [...imported, ...this.data.scenes],
    });
    return { count: imported.length };
  }
  async settings(patch) {
    const settings = validateSettings(patch, this.data.settings);
    await this.commit({ ...this.data, settings });
    return settings;
  }
  async bestScore(score, type = "snake") {
    validateGameType(type);
    if (!Number.isInteger(score) || score < 0) throw new Error("游戏纪录无效");
    if (score > (this.data.gameBestScores[type] ?? 0))
      await this.commit({
        ...this.data,
        bestScore: type === "snake" ? score : this.data.bestScore,
        gameBestScores: { ...this.data.gameBestScores, [type]: score },
      });
  }
}
