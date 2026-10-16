import http from "node:http";
import {AudioSession} from "./audio.mjs";
import {startFrameLoop} from "./frame-loop.mjs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Store, validateColors, validateAnimation } from "./storage.mjs";
import { Hardware } from "./hardware.mjs";
import {KeyAdaptation} from './key-adaptation.mjs';
import {KeyCapture} from './key-capture.mjs';
import {BluetoothInput} from './bluetooth-input.mjs';
import { FirmwareChecker, FIRMWARE_URL } from "./firmware.mjs";
import { CodexAdapter, describeAction } from "./codex.mjs";
import {CodexKeyGestures,PhysicalPressGate,resolveCodexShortcut} from './codex-shortcuts.mjs';
import { CodexLights, StableTaskSlots, resolveWholeTask } from "../shared/codex-lighting.mjs";
import {codexBindings, rebindCodexKey} from '../shared/codex-keys.mjs';
import { ClaudeCodeAdapter } from "./claude-code.mjs";
import { ClaudeLights, resolveClaudeSlots, resolveClaudeWholeTask, CLAUDE_ATTENTION_RANK } from "../shared/claude-lighting.mjs";
import { claudeBindings, rebindClaudeKey } from "../shared/claude-keys.mjs";
import { LightingPower } from "../shared/lighting-power.mjs";
import { layout, blank, defaultAnimation } from "../shared/layout.mjs";
import { validateGameType } from "../shared/games.mjs";
import { GameSession } from "./games.mjs";
import { TriggerEffect } from "./trigger.mjs";
import { TRIGGER_KEYS, validateTrigger } from "../shared/trigger.mjs";
import {
  renderAnimation,
  animationDuration,
  scaleColor,
} from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir =
  process.env.AIR_STUDIO_DATA ??
  path.join(os.homedir(), "Library/Application Support/Air Studio");
const port = Number(process.env.AIR_STUDIO_PORT || process.env.AIR_STUDIO_PREFERRED_PORT || 0),
  token = process.env.AIR_STUDIO_TOKEN ?? randomBytes(32).toString("hex");
const store = await new Store(dataDir).load();
// Written by scripts/package.mjs. Absent when running from source.
const build = await readFile(path.join(root, "signing.json"), "utf8")
  .then(text => { const value = JSON.parse(text); return { version: String(value.version ?? ""), platform: process.platform, arch: process.arch, adhoc: value.adhoc === true, identity: String(value.identity ?? ""), packagedAt: String(value.packagedAt ?? "") }; })
  .catch(() => ({ adhoc: false, identity: "", packagedAt: "" }));
const hardware = new Hardware(
  process.env.AIR_STUDIO_HID ?? path.join(root, "bin/HIDBridge"),
  path.join(dataDir, "original-lighting.json"),
);
const codex = new CodexAdapter();
const keyAdaptation = new KeyAdaptation(hardware);
const bluetoothInput = new BluetoothInput(hardware);
const codexPresses=new PhysicalPressGate();
const codexGestures=new CodexKeyGestures({
  send:request=>hardware.request('shortcut',request).catch(error=>{
    if(error.code==='ACCESSIBILITY_REQUIRED') throw new Error('发送系统快捷键需要辅助功能权限，请在系统设置中为 NuPhyLab 开启。');
    throw error;
  }),
  resolve:action=>resolveCodexShortcut(action,{blockedCodes:codexBindings(store.data.settings).map(key=>key.code)})
});
// Read user-editable shortcuts only. Keep the button/physical key instructions
// in sync when Codex switches between hold-to-talk and tap-to-toggle.
void codexGestures.inspectDictation(describeAction('dictation'));
setInterval(()=>void codexGestures.inspectDictation(describeAction('dictation')),2000).unref();
const codexLights = new CodexLights();
const claude = new ClaudeCodeAdapter({ dataDir });
const claudeLights = new ClaudeLights();
const lightPower = new LightingPower();
let lightSleepStarted = null, lastIdlePoll = -Infinity, systemIdleAvailable = null;
codex.track?.([...(store.data.settings.slotIds ?? []),store.data.settings.codexWholeTaskId]);
claude.track([...(store.data.settings.claudeSlotIds ?? []),store.data.settings.claudeWholeTaskId]);
const firmware = new FirmwareChecker();
const game = new GameSession(store.data.gameBestScores);
const trigger = new TriggerEffect();
const audio = new AudioSession();
let triggerMonitor = "off", triggerWarning = null, triggerGeneration = 0;
let colors = blank(),
  baseColors = blank(),
  animation = { ...defaultAnimation },
  started = 0,
  lastGameTick = 0,
  lastFrame = "",
  stopping = false,
  busy = false,
  explicitDisconnect = false,
  commandTail = Promise.resolve(),
  lastStatusCheck = -Infinity,
  lastQuotaColor = null,
  quotaChanged = -Infinity,
  integrationsSuspended = false,
  gameSideMuted = false;
let playback = {
  mode: "idle",
  playing: false,
  fps: 0,
  framesSent: 0,
  lastError: null,
};
let suspendedScene = null,
  pendingSceneRestore = false,
  frameTimes = [];
const recordWarnings = new Map();
const recordRetryAt = new Map();
const taskSlots = new StableTaskSlots();
const slots = () => {
  const snap = codex.snapshot();
  const tasks = snap.tasks ?? [];
  return taskSlots.resolve(tasks, store.data.settings);
};
// One integration owns the task and command keys at a time; both keep their own
// bindings, slots, colours and lighting settings while the other is inactive.
const agentSource = () => (store.data.settings.agentSource === "claude" ? "claude" : "codex");
const agentEnabled = () =>
  agentSource() === "claude" ? store.data.settings.claudeEnabled === true : store.data.settings.codexEnabled === true;
const agentBindings = () =>
  agentSource() === "claude" ? claudeBindings(store.data.settings) : codexBindings(store.data.settings);
const claudeTasks = () => claude.snapshot().tasks ?? [];
const claudeSlots = () => resolveClaudeSlots(claudeTasks(), store.data.settings);
const claudeSelected = () => claudeTasks().find((task) => task.id === claudeLights.selectedId) ?? null;
let codexKeyHost = null, codexKeyEvent = null, codexKeyEventId = 0;
let codexKeyRevision = 0, codexKeySignature = '';
let codexSetupRevision = 0;
const keyCapture = new KeyCapture();
const functionKeys = Array.from({length:12},(_,i)=>`F${i+1}`);
const bluetoothOnly = () => !hardware.state.connected && bluetoothInput.value.connected;
const codexPlaying = () => hardware.state.connected && ['game','trigger'].includes(playback.mode);
function codexKeysState() {
  const config={source:agentSource(),bindings:agentBindings(),capturing:keyCapture.active,enabled:agentEnabled() && !keyCapture.active && !codexPlaying()
    && (!store.data.settings.codexKeyAdaptation || (hardware.state.connected && !explicitDisconnect) || bluetoothOnly())};
  const signature=JSON.stringify(config);
  if(signature!==codexKeySignature){codexKeySignature=signature;codexKeyRevision++;}
  return {...config,revision:codexKeyRevision,setupRevision:codexSetupRevision,
    host:codexKeyHost && Date.now()-codexKeyHost.updatedAt<15000 ? codexKeyHost : null, lastEvent:codexKeyEvent,
    held:codexGestures.held,dictation:codexGestures.dictation};
}
function syncKeyAdaptation(force=false) {
  return keyAdaptation.sync({enabled:keyCapture.active || store.data.settings.codexKeyAdaptation || store.data.settings.codexKeycapFallback,
    keycapFallback:store.data.settings.codexKeycapFallback,
    active:keyCapture.active || (codexKeysState().enabled && codexKeysState().host?.suspended!==true),
    connected:hardware.state.connected && !explicitDisconnect,
    bluetooth:bluetoothOnly(),
    bluetoothIdentity:bluetoothInput.signature,
    bindings:keyCapture.active ? functionKeys : agentBindings().map(key=>key.code)},force);
}
async function refreshBluetooth(force=false) {
  const previous=bluetoothInput.signature;
  await bluetoothInput.refresh(force);
  if(previous!==bluetoothInput.signature) {
    codexSetupRevision++;
    codexPresses.reset();
    await codexGestures.release();
    // Refresh permission information even for users who use standard keys
    // without opting into the USB media-key adaptation layer.
    if(bluetoothOnly()) hardware.state.permissions=await hardware.request('permissions');
  }
  return bluetoothInput.snapshot();
}
function state() {
  const codexState=codex.snapshot();
  const wholeTask=resolveWholeTask(codexState.tasks ?? [],store.data.settings,codexLights.selectedId);
  const claudeState=claude.snapshot();
  const claudeWhole=resolveClaudeWholeTask(claudeState.tasks ?? [],store.data.settings,claudeLights.selectedId);
  return {
    device: {
      ...hardware.state,
      sideColor: lastQuotaColor,
      storagePath: dataDir,
      storageWarning: store.warning,
      unmappedIndices: [83],
      autoConnecting: !hardware.state.connected && store.data.settings.autoConnect && !explicitDisconnect,
      connectionPaused: explicitDisconnect,
    },
    audio: audio.snapshot(store.data.settings.audio),
    bluetooth: bluetoothInput.snapshot(),
    native: hardware.state.permissions ?? {
      inputMonitoring: null,
      accessibility: null,
    },
    playback,
    build,
    lightPower: {...lightPower.snapshot(store.data.settings), systemIdleAvailable},
    colors,
    scenes: store.data.scenes,
    settings: store.data.settings,
    claude: { ...claudeState, slots: claudeSlots(),
      lighting: {...claudeLights.snapshot(),sleeping:lightPower.sleeping,mode:store.data.settings.claudeLightMode,wholeTaskId:claudeWhole?.id ?? null},
      taskAction: store.data.settings.claudeTaskAction ?? "focusApp", active: agentSource()==="claude" },
    codex: { ...codexState, active: agentSource()==="codex", slots: slots(), lighting: {...codexLights.snapshot(),sleeping:lightPower.sleeping,mode:store.data.settings.codexLightMode,wholeTaskId:wholeTask?.id ?? null}, keys:codexKeysState(), adaptation:keyAdaptation.snapshot() },
    game: { ...game.snapshot(), recordWarning: recordWarnings.get(game.type) ?? null },
    trigger: { ...trigger.snapshot(), monitor: triggerMonitor, warning: triggerWarning },
    firmware: firmware.snapshot(hardware.state),
  };
}
async function output(input) {
  let out = [...input];
  if (agentEnabled() && !["game", "trigger", "audio"].includes(playback.mode))
    out = agentSource() === "claude"
      ? claudeLights.render(out, claudeSlots(), store.data.settings, claudeTasks())
      : codexLights.render(out, slots(), store.data.settings, codex.snapshot().tasks ?? []);
  out = out.map(c => scaleColor(c, store.data.settings.brightness / 100));
  if (lightPower.sleeping) out = blank();
  const signature = out.join("");
  if (signature === lastFrame) return;
  await hardware.paint(out);
  colors = out;
  lastFrame = signature;
  playback.framesSent++;
  const now = performance.now();
  frameTimes.push(now);
  frameTimes = frameTimes.filter((t) => now - t < 2000);
  playback.fps = Math.round((frameTimes.length / 2) * 10) / 10;
}
function invalidateLightingCache() {
  gameSideMuted = false;
  lastQuotaColor = null;
  quotaChanged = -Infinity;
  lastFrame = "";
}
async function reconcileHardwareError() {
  try {
    await hardware.status();
  } catch {
    hardware.state.connected = false;
    hardware.state.armed = false;
  }
  if (!hardware.state.connected || !hardware.state.armed)
    invalidateLightingCache();
}
async function activate() {
  if (hardware.state.capabilities?.perKey === false)
    throw new Error("当前设备未通过逐键灯效协议检查，请在设备页查看详情并更新 NuPhyLab。");
  integrationsSuspended = false;
  if (!hardware.state.armed) invalidateLightingCache();
  await hardware.arm();
  if (lightSleepStarted !== null) { started += performance.now() - lightSleepStarted; lightSleepStarted = null; }
  lightPower.wake();
  lastFrame = "";
  playback.lastError = null;
}
async function updateSide(args) {
  const result = await hardware.request("side", args);
  if (result.state) hardware.state.state = result.state;
  return result;
}
async function muteGameSide() {
  if (gameSideMuted) return;
  await updateSide({ color: "#000000", brightness: 0 });
  gameSideMuted = true;
  lastQuotaColor = null;
}
async function restoreGameSide() {
  if (!gameSideMuted) return;
  if (hardware.state.connected) await updateSide({ restore: true });
  gameSideMuted = false;
  lastQuotaColor = null;
  quotaChanged = -Infinity;
}
async function disableTrigger() {
  const wasGlobal = triggerMonitor === "global";
  trigger.cancel();
  triggerGeneration++;
  triggerMonitor = "off";
  triggerWarning = null;
  // Disable local dispatch first, including already queued native events.
  if (wasGlobal && hardware.child) {
    try { await hardware.request("triggerMonitor", { enabled: false }); }
    catch (error) { triggerWarning = "按键监听停止未确认：" + error.message; }
  }
}
async function fireTrigger() {
  if (playback.mode !== "trigger" || !trigger.armed || !hardware.state.connected)
    return trigger.snapshot();
  if (trigger.fire(performance.now())) {
    lightPower.wake();
    playback.playing = true;
    await output(trigger.render(performance.now()));
  }
  return trigger.snapshot();
}
async function stop() {
  audio.stop();
  await codexGestures.release();
  lightPower.wake();
  lightSleepStarted = null;
  await disableTrigger();
  integrationsSuspended = true;
  playback.playing = false;
  playback.mode = "idle";
  game.status = "idle";
  suspendedScene = null;
  pendingSceneRestore = false;
  lastFrame = "";
  await hardware.restore();
  playback.lastError = null;
  invalidateLightingCache();
  colors = blank();
  return hardware.state;
}
async function persistGameScore() {
  if (game.bestScore <= (store.data.gameBestScores[game.type] ?? 0)) return;
  if (performance.now() < (recordRetryAt.get(game.type) ?? 0)) return;
  try {
    await store.bestScore(game.bestScore, game.type);
    recordWarnings.delete(game.type);
    recordRetryAt.delete(game.type);
  } catch {
    recordWarnings.set(game.type, "本局可继续，最高纪录暂未保存到磁盘。");
    recordRetryAt.set(game.type, performance.now() + 30000);
  }
}
async function restorePendingScene() {
  if (!pendingSceneRestore || !hardware.state.connected) return;
  const suspended = integrationsSuspended;
  try {
    await activate();
    started = performance.now() - (playback.elapsed ?? 0);
    await output(renderAnimation(baseColors, animation, playback.elapsed ?? 0));
    pendingSceneRestore = false;
  } finally {
    integrationsSuspended = suspended;
  }
}
async function pauseGame(paused) {
  if (!["running", "paused"].includes(game.status)) return game.snapshot();
  const shouldPause = paused ?? game.status === "running";
  if (shouldPause) {
    game.status = "paused";
    playback.playing = false;
  } else {
    await activate();
    await muteGameSide();
    game.status = "running";
    playback.playing = true;
    lastGameTick = performance.now();
    await output(game.render());
  }
  return game.snapshot();
}
async function tick() {
  if (busy || stopping) return;
  busy = true;
  try {
    if (audio.expired()) {
      const error=audio.error ?? "captureStopped";
      try {await stop();} finally {audio.stop(error);}
    }
    await refreshBluetooth();
    await syncKeyAdaptation();
    if (!hardware.state.connected) {
      if (audio.session) {audio.stop("keyboardDisconnected");playback.playing=false;playback.mode="idle";}
      lastGameTick = performance.now();
      invalidateLightingCache();
      if (trigger.armed) {
        await disableTrigger();
        playback.playing = false;
        colors = blank();
        integrationsSuspended = true;
        triggerWarning = "键盘连接已断开，请重新连接后启用触发。";
      }
      if (game.status === "running" && playback.mode === "game") {
        game.status = "paused";
        playback.playing = false;
      }
      if (
        !explicitDisconnect &&
        store.data.settings.autoConnect &&
        performance.now() - lastStatusCheck > 2000
      ) {
        lastStatusCheck = performance.now();
        try {
          await hardware.connect();
          void firmware.refresh();
          invalidateLightingCache();
          if (hardware.state.capabilities?.perKey === false) return;
          if (pendingSceneRestore) await restorePendingScene();
          else if (playback.mode === "game") {
            await activate();
            await muteGameSide();
            await output(game.render());
          } else if (playback.playing) await activate();
          else if (agentEnabled() && !integrationsSuspended) {
            await activate();
            playback.mode = "static";
            await output(baseColors);
          }
        } catch {}
      }
      return;
    }
    void firmware.refresh();
    if (hardware.state.capabilities?.perKey === false) {
      if (performance.now() - lastStatusCheck > 4000) {
        lastStatusCheck = performance.now();
        await hardware.status();
      }
      return;
    }
    if (hardware.state.armed && playback.mode !== "idle") {
      const now = performance.now();
      if (store.data.settings.lightIdleMs > 0 && now - lastIdlePoll >= 500) {
        lastIdlePoll = now;
        try {
          const idle = await hardware.request("systemIdle");
          systemIdleAvailable = Number.isFinite(idle.idleMs) && idle.idleMs >= 0;
          if (systemIdleAvailable) lightPower.observeSystemIdle(idle.idleMs);
        } catch { systemIdleAvailable = false; }
      }
      if (agentEnabled()) {
        const watched = agentSource() === "claude"
          ? (store.data.settings.claudeLightMode === "whole"
              ? [resolveClaudeWholeTask(claudeTasks(),store.data.settings,claudeLights.selectedId)] : claudeSlots())
          : (store.data.settings.codexLightMode === "whole"
              ? [resolveWholeTask(codex.snapshot().tasks ?? [],store.data.settings,codexLights.selectedId)] : slots());
        lightPower.observeCodex(JSON.stringify(watched.map(t=>t && [t.id,t.status,t.pendingKind])));
      }
      lightPower.update(store.data.settings);
      if(playback.mode === "audio") audio.suspend(lightPower.sleeping);
      if (lightPower.sleeping) {
        lightSleepStarted ??= performance.now();
        lastGameTick = performance.now();
        if (trigger.armed) { trigger.render(performance.now()); playback.playing = trigger.flashing; }
        await muteGameSide();
        await output(blank());
        if (performance.now() - lastStatusCheck > 4000) { lastStatusCheck = performance.now(); await hardware.status(); }
        return;
      }
      if (lightSleepStarted !== null) {
        started += performance.now() - lightSleepStarted;
        lastGameTick = performance.now();
        lightSleepStarted = null;
        if (!["game", "trigger", "audio"].includes(playback.mode)) await restoreGameSide();
        lastFrame = "";
        if (["static", "paused"].includes(playback.mode)) await output(playback.mode === "paused" ? renderAnimation(baseColors, animation, playback.elapsed ?? 0) : baseColors);
      }
    }
    if (playback.mode === "trigger" && trigger.armed) {
      if (!hardware.state.armed) await activate();
      await muteGameSide();
      await output(trigger.render(performance.now()));
      playback.playing = trigger.flashing;
    } else if (playback.mode === "audio" && audio.session) {
      await output(audio.render(store.data.settings.audio));
    } else if (playback.playing) {
      if (!hardware.state.armed) await activate();
      let frame;
      if (playback.mode === "game") {
        await muteGameSide();
        if (game.status === "running" || game.flashing) {
          const now = performance.now();
          game.tick(now - lastGameTick);
          lastGameTick = now;
          await persistGameScore();
        }
        frame = game.render();
        if (["over", "won"].includes(game.status)) playback.playing = game.flashing;
      } else {
        const elapsed = performance.now() - started;
        frame = renderAnimation(baseColors, animation, elapsed);
        if (elapsed >= animationDuration(animation)) {
          playback.playing = false;
          playback.mode = "paused";
          playback.elapsed = elapsed;
        }
      }
      await output(frame);
    } else if (
      hardware.state.armed &&
      agentEnabled() &&
      ["static", "paused"].includes(playback.mode)
    )
      await output(playback.mode === "paused" ? renderAnimation(baseColors, animation, playback.elapsed ?? 0) : baseColors);
    if (performance.now() - lastStatusCheck > 4000) {
      lastStatusCheck = performance.now();
      await hardware.status();
    }
    if (
      store.data.settings.quotaSideEnabled &&
      !["game", "trigger", "audio"].includes(playback.mode) &&
      !integrationsSuspended &&
      hardware.state.connected &&
      performance.now() - quotaChanged > 60000
    ) {
      const quota = codex.snapshot().quota;
      const buckets =
        quota?.available && !quota.stale ? (quota.buckets ?? []) : [];
      const bucket = buckets.find((b) => b.id === "codex") ?? buckets[0];
      const remaining = Math.min(
        ...(bucket?.windows ?? [])
          .filter((w) => Number.isFinite(w.remainingPercent))
          .map((w) => w.remainingPercent),
      );
      if (Number.isFinite(remaining)) {
        const color =
          remaining <= 10 ? "#c86d6d" : remaining <= 30 ? "#d6ac60" : "#6f9e85";
        if (color !== lastQuotaColor) {
          await updateSide({ color, brightness: 50 });
          lastQuotaColor = color;
        }
        quotaChanged = performance.now();
      } else if (lastQuotaColor) {
        await updateSide({ restore: true });
        lastQuotaColor = null;
        quotaChanged = performance.now();
      }
    }
  } catch (e) {
    playback.lastError = e.message;
    if(playback.mode === "audio") {audio.stop("lightingFailed");playback.mode="idle";playback.playing=false;}
    await reconcileHardwareError();
    if (playback.mode === "trigger") {
      await disableTrigger().catch(() => {});
      playback.playing = false;
      colors = blank();
      integrationsSuspended = true;
      triggerWarning = "灯效输出中断，请重新启用触发。";
    } else if (playback.mode === "game" && game.status === "running") {
      game.status = "paused";
      playback.playing = false;
    } else if (hardware.state.connected) playback.playing = false;
  } finally {
    busy = false;
  }
}
const timer = startFrameLoop(tick);
async function serialized(fn) {
  const run = async () => {
    if (stopping) throw new Error("软件正在退出");
    while (busy) await new Promise((r) => setTimeout(r, 10));
    if (stopping) throw new Error("软件正在退出");
    busy = true;
    try {
      return await fn();
    } catch (error) {
      await reconcileHardwareError();
      if (playback.mode === "trigger" && (!hardware.state.armed || !hardware.state.connected)) {
        await disableTrigger().catch(() => {});
        playback.playing = false;
        colors = blank();
        playback.lastError = error.message;
        triggerWarning = "灯效输出中断，请重新启用触发。";
        integrationsSuspended = true;
      }
      if (playback.mode === "audio" && (!hardware.state.armed || !hardware.state.connected)) {
        audio.stop("lightingFailed");playback.mode="idle";playback.playing=false;integrationsSuspended=true;
      }
      if (playback.mode === "game" && (!hardware.state.armed || !hardware.state.connected)) {
        if (game.status === "running") game.status = "paused";
        playback.playing = false;
      }
      throw error;
    } finally {
      busy = false;
    }
  };
  const result = commandTail.then(run, run);
  commandTail = result.catch(() => {});
  return result;
}
async function command(req) {
  if(bluetoothOnly() && ['audioStart','preview','play','triggerArm','gameStart','lightWake','codexWake','checkFirmware','prepareFirmwareUpdate'].includes(req.op))
    throw new Error('蓝牙模式保留 Codex 快捷键；灯光播放与固件设置请使用 USB 有线连接。');
  if (["preview", "play", "gameInput", "gameStart", "gamePause", "triggerKey", "codexAction", "codexSelect", "codexSlot",
    "claudeAction", "claudeSelect", "claudeSlot"].includes(req.op)) lightPower.activity();
  switch (req.op) {
    case "audioInventory": audio.inventory(req); return {};
    case "audioPacket": return {accepted:audio.ingest(req)};
    case "audioStart": {
      if(!hardware.state.connected) throw new Error("声音律动需要 USB 有线连接");
      audio.start(store.data.settings.audio);
      try {
        await disableTrigger();
        game.status="idle";suspendedScene=null;pendingSceneRestore=false;
        await activate();
        playback={...playback,mode:"audio",playing:true};
        await muteGameSide();
        await output(blank());
      } catch(error) {audio.stop("lightingFailed");playback.mode="idle";playback.playing=false;integrationsSuspended=true;colors=blank();throw error;}
      return audio.snapshot(store.data.settings.audio);
    }
    case "audioStop": return playback.mode==="audio" ? stop() : audio.stop();
    case "refreshBluetooth":
      await refreshBluetooth(true);
      await syncKeyAdaptation(true);
      return bluetoothInput.snapshot();
    case "lightActivity":
      lightPower.activity();
      return lightPower.snapshot(store.data.settings);
    case "lightWake":
      lightPower.wake();
      codexLights.wake();
      return lightPower.snapshot(store.data.settings);
    case "checkFirmware":
      if (!hardware.state.connected) throw new Error("请先连接键盘，再检查固件。");
      void firmware.refresh(true);
      return firmware.snapshot(hardware.state);
    case "prepareFirmwareUpdate":
      await stop();
      await hardware.disconnect();
      explicitDisconnect = true;
      return { url: FIRMWARE_URL };
    case "openPermissionSettings": {
      if (!["inputMonitoring", "accessibility"].includes(req.permission))
        throw new Error("不支持这个权限设置");
      const result = await hardware.request("openPermissionSettings", {
        permission: req.permission,
      });
      hardware.state.permissions = result.permissions;
      return result;
    }
    case "refreshPermissions": {
      const permissions = await hardware.request("permissions");
      hardware.state.permissions = permissions;
      return permissions;
    }
    case "connect": {
      explicitDisconnect = false;
      integrationsSuspended = false;
      const result = await hardware.connect();
      void firmware.refresh();
      invalidateLightingCache();
      if (hardware.state.capabilities?.perKey === false) return result;
      if (pendingSceneRestore) await restorePendingScene();
      else if (playback.mode === "game") {
        await activate();
        await muteGameSide();
        await output(game.render());
      } else if (store.data.settings.codexEnabled && !["trigger","audio"].includes(playback.mode)) {
        await activate();
        playback.mode = "static";
        await output(baseColors);
      }
      return result;
    }
    case "disconnect":
      await stop();
      await hardware.disconnect();
      explicitDisconnect = true;
      return hardware.state;
    case "restore":
    case "stop":
      return stop();
    case "pause":
      if (playback.mode === "idle") return playback;
      if (["trigger","audio"].includes(playback.mode)) return stop();
      if (playback.mode === "game") {
        return pauseGame();
      }
      playback.playing = !playback.playing;
      if (playback.playing) {
        lightPower.wake();
        lightSleepStarted = null;
        await restoreGameSide();
        lastFrame = "";
        started = performance.now() - (playback.elapsed ?? 0);
        playback.mode = animation.effect === "static" ? "static" : "animation";
      } else {
        playback.elapsed = (lightSleepStarted ?? performance.now()) - started;
        playback.mode = "paused";
      }
      return playback;
    case "preview":
      audio.stop();
      baseColors = validateColors(req.colors);
      await disableTrigger();
      animation = { ...defaultAnimation };
      await restoreGameSide();
      game.status = "idle";
      suspendedScene = null;
      pendingSceneRestore = false;
      await activate();
      playback = { ...playback, mode: "static", playing: false };
      await output(baseColors);
      return playback;
    case "play":
      audio.stop();
      baseColors = validateColors(req.colors);
      animation = validateAnimation(req.animation);
      await disableTrigger();
      await restoreGameSide();
      suspendedScene = null;
      pendingSceneRestore = false;
      await activate();
      game.status = "idle";
      started = performance.now();
      playback = {
        ...playback,
        mode: animation.effect === "static" ? "static" : "animation",
        playing: true,
        elapsed: 0,
      };
      await output(renderAnimation(baseColors, animation, 0));
      return playback;
    case "saveScene":
      return { savedScene: await store.saveScene(req.scene) };
    case "deleteScene":
      await store.deleteScene(req.id);
      return {};
    case "importScenes":
      return store.importScenes(req.scenes);
    case "settings": {
      await codexGestures.release();
      codexPresses.reset();
      const old = store.data.settings;
      if(audio.session && req.settings.audio && (req.settings.audio.source !== undefined && req.settings.audio.source!==old.audio.source || req.settings.audio.deviceId !== undefined && req.settings.audio.deviceId!==old.audio.deviceId)) await stop();
      const settings = await store.settings(req.settings);
      codex.track?.([...(settings.slotIds ?? []),settings.codexWholeTaskId]);
      claude.track([...(settings.claudeSlotIds ?? []),settings.claudeWholeTaskId]);
      if (Object.keys(req.settings).some(key=>key.startsWith("codex") || key === "slotIds")) codexLights.wake();
      if (Object.keys(req.settings).some(key=>key.startsWith("claude") || key === "agentSource")) claudeLights.wake();
      // Switching integrations releases any key the other one was holding.
      if (req.settings.agentSource !== undefined && req.settings.agentSource !== old.agentSource) {
        await codexGestures.release();
        codexPresses.reset();
        codexSetupRevision++;
      }
      const previousAgentEnabled = old.agentSource === "claude" ? old.claudeEnabled : old.codexEnabled;
      const startsAgentLighting = agentEnabled() && (!previousAgentEnabled || settings.agentSource !== old.agentSource)
        && !["game", "trigger", "audio"].includes(playback.mode);
      // Starting task lighting is a new lighting session even when a previous
      // scene still owns the device. Do not inherit that scene's elapsed timer.
      // Colour/binding edits and repeated polls must not restart the timer.
      if (settings.lightDurationMs !== old.lightDurationMs || settings.lightIdleMs !== old.lightIdleMs || startsAgentLighting) lightPower.wake();
      if (
        old.quotaSideEnabled &&
        !settings.quotaSideEnabled &&
        !["game", "trigger", "audio"].includes(playback.mode) &&
        hardware.state.connected
      ) {
        await updateSide({ restore: true });
        lastQuotaColor = null;
      }
      if (settings.quotaSideEnabled !== old.quotaSideEnabled)
        quotaChanged = -Infinity;
      if (
        (settings.codexEnabled && !old.codexEnabled) ||
        (settings.claudeEnabled && !old.claudeEnabled) ||
        (settings.agentSource !== old.agentSource) ||
        (settings.quotaSideEnabled && !old.quotaSideEnabled)
      )
        integrationsSuspended = false;
      lastFrame = "";
      if (
        agentEnabled() &&
        !["game", "trigger", "audio"].includes(playback.mode) &&
        !integrationsSuspended &&
        hardware.state.connected &&
        !hardware.state.armed
      ) {
        await activate();
        playback.mode = "static";
      }
      if (hardware.state.armed && ["static", "paused"].includes(playback.mode))
        await output(playback.mode === "paused" ? renderAnimation(baseColors, animation, playback.elapsed ?? 0) : baseColors);
      await syncKeyAdaptation();
      return settings;
    }
    case "triggerArm": {
      await codexGestures.release();
      const pattern = validateColors(req.colors);
      const config = validateTrigger(req.trigger);
      if (!pattern.some((c, i) => i < 83 && c !== "#000000"))
        throw new Error("请先绘制图案，或选择默认爱心");
      if (!hardware.state.connected) throw new Error("请先连接 Air75 V3");
      audio.stop();
      await disableTrigger();
      game.status = "idle";
      suspendedScene = null;
      pendingSceneRestore = false;
      try {
        await activate();
        await muteGameSide();
        trigger.start(pattern, config);
        playback = { ...playback, mode: "trigger", playing: false };
        await output(blank());
        try {
          await hardware.request("triggerMonitor", {
            enabled: true,
            keyCode: TRIGGER_KEYS.find((key) => key.code === config.code).keyCode,
          });
          triggerMonitor = "global";
        } catch (error) {
          if (error.code !== "INPUT_MONITORING_REQUIRED") throw error;
          triggerMonitor = "window";
          triggerWarning = "macOS 未允许全局按键监听，当前仅在此窗口内触发。";
        }
      } catch (error) {
        await stop().catch(() => {});
        throw error;
      }
      return state().trigger;
    }
    case "triggerFire":
      if (!trigger.armed) throw new Error("请先启用按键触发");
      return fireTrigger();
    case "triggerKey":
      if (triggerMonitor !== "window" || req.code !== trigger.snapshot().config.code)
        return trigger.snapshot();
      return fireTrigger();
    case "triggerStop":
      if (playback.mode === "trigger" || trigger.armed) return stop();
      return playback;
    case "gameSelect":
      validateGameType(req.gameType);
      if (["running", "paused"].includes(game.status))
        throw new Error("请先结束当前游戏");
      if (playback.mode === "game") await command({ op: "gameStop" });
      return game.select(req.gameType);
    case "gameRestart":
      // Repeated or queued Return presses must never restart a live round.
      if (playback.mode !== "game" || !["over", "won"].includes(game.status)) return game.snapshot();
      return command({ op: "gameStart", gameType: game.type, speed: req.speed ?? game.speed });
    case "gameStart":
      await codexGestures.release();
      validateGameType(req.gameType ?? game.type);
      if (
        !Number.isInteger(req.speed ?? 4) ||
        (req.speed ?? 4) < 1 ||
        (req.speed ?? 4) > 10
      )
        throw new Error("游戏速度应为 1–10");
      if (["trigger","audio"].includes(playback.mode)) await stop();
      if (playback.mode !== "game")
        suspendedScene = {
          integrationsSuspended,
          baseColors: [...baseColors],
          animation: { ...animation },
          playback: { ...playback },
          elapsed: playback.playing
            ? performance.now() - started
            : (playback.elapsed ?? 0),
        };
      await activate();
      await muteGameSide();
      game.start(req.speed ?? 4, req.gameType ?? game.type);
      pendingSceneRestore = false;
      playback = { ...playback, mode: "game", playing: true };
      lastGameTick = performance.now();
      await output(game.render());
      return game.snapshot();
    case "gameInput":
      if (req.pressed !== undefined && typeof req.pressed !== "boolean")
        throw new Error("游戏按键状态无效");
      if (req.code !== undefined && (typeof req.code !== "string" || req.code.length > 32))
        throw new Error("游戏按键无效");
      if (lightPower.sleeping && req.pressed !== false) return game.snapshot();
      game.input({ direction: req.direction, code: req.code, pressed: req.pressed ?? true });
      await persistGameScore();
      if (playback.mode === "game" && hardware.state.armed) {
        await output(game.render());
        if (["over", "won"].includes(game.status)) playback.playing = game.flashing;
      }
      return game.snapshot();
    case "gamePause":
      if (req.paused !== undefined && typeof req.paused !== "boolean")
        throw new Error("暂停状态无效");
      return pauseGame(req.paused);
    case "gameStop": {
      await restoreGameSide();
      game.status = "idle";
      if (suspendedScene) {
        const previous = suspendedScene;
        suspendedScene = null;
        baseColors = previous.baseColors;
        animation = previous.animation;
        playback = previous.playback;
        playback.elapsed = previous.elapsed;
        started = performance.now() - previous.elapsed;
        lastFrame = "";
        integrationsSuspended = previous.integrationsSuspended;
        if (playback.mode === "idle") await stop();
        else {
          pendingSceneRestore = true;
          await restorePendingScene();
        }
        integrationsSuspended = previous.integrationsSuspended;
        if (!integrationsSuspended) quotaChanged = -Infinity;
      } else await stop();
      return playback;
    }
    case "codexWake": // Older clients also wake the whole keyboard.
      lightPower.wake();
      return {...codexLights.snapshot(),sleeping:lightPower.sleeping};
    case "codexSelect": {
      if (!slots().some(task => task?.id === req.threadId)) throw new Error("任务不在当前六个槽位中");
      codexLights.select(req.threadId);
      return codexLights.snapshot();
    }
    case "codexBind":
      return command({op:'settings',settings:rebindCodexKey(store.data.settings,req.group,req.index,req.code)});
    case "codexCapture": {
      const wasActive=keyCapture.active;
      keyCapture.update(req.session,req.active);
      if (keyCapture.active && !wasActive) { await codexGestures.release(); codexPresses.reset(); }
      const adaptation=await syncKeyAdaptation();
      return {capturing:keyCapture.active,adaptation};
    }
    case "codexAdapt": {
      codexSetupRevision++;
      await refreshBluetooth(true);
      // Enabling one integration hands the keys over atomically, so the other
      // can never be left switched on by a partially applied change.
      const target = req.source === "claude" ? "claude" : "codex";
      await command({op:'settings',settings:{codexKeyAdaptation:true,agentSource:target,
        codexEnabled:target==="codex",claudeEnabled:target==="claude"}});
      if(explicitDisconnect && !bluetoothOnly()) { try { await command({op:'connect'}); } catch {} }
      return syncKeyAdaptation(true);
    }
    case "codexAdaptRestore":
      await keyAdaptation.release();
      await command({op:'settings',settings:{codexEnabled:false,claudeEnabled:false,codexKeyAdaptation:false}});
      return keyAdaptation.snapshot();
    case "codexAdaptCheck":
      codexSetupRevision++;
      await refreshBluetooth(true);
      return syncKeyAdaptation(true);
    case "codexAdaptDriver":
      await keyAdaptation.release('paused');
      await command({op:'disconnect'});
      return {url:'https://drive.nuphy.io/'};
    case "codexKeyStatus": {
      const allowed = new Set(agentBindings().map(key=>key.code));
      if (!Array.isArray(req.registered) || !Array.isArray(req.failed) || [...req.registered,...req.failed].some(code=>!allowed.has(code))) throw new Error('按键状态无效');
      codexKeyHost={registered:req.registered,failed:req.failed,suspended:req.suspended===true,updatedAt:Date.now()};
      await syncKeyAdaptation();
      return {received:true};
    }
    case "codexKey": {
      if(req.phase==='up') {codexPresses.up(req.code);return codexGestures.release(req.code);}
      if(req.phase!==undefined && req.phase!=='down') throw new Error('按键阶段无效');
      const index=agentBindings().findIndex(key=>key.code===req.code);
      if(index<0) throw new Error('这个按键尚未绑定');
      if(req.phase==='down'&&!codexPresses.down(req.code))return {ignored:true,reason:'duplicate-press'};
      try {
        const result=await command({op:agentSource()==='claude'?'claudeSlot':'codexSlot',index,phase:req.phase,source:req.code});
        codexKeyEvent={id:++codexKeyEventId,code:req.code,ok:true};
        return result;
      } catch(error) {
        codexKeyEvent={id:++codexKeyEventId,code:req.code,ok:false,error:error.message};
        throw error;
      }
    }
    case "codexSlot": {
      if (agentSource() !== "codex" || !codexKeysState().enabled || !Number.isInteger(req.index) || req.index < 0 || req.index > 11) throw new Error("命令键未启用");
      codexLights.wake();
      if (req.index < 6) {
        await codexGestures.release();
        const task = slots()[req.index];
        if (!task) throw new Error("这个任务键尚未绑定");
        return command({op:"codexAction",action:"task",threadId:task.id});
      }
      return command({op:"codexAction",action:store.data.settings.codexCommandIds[req.index-6],phase:req.phase,source:req.source});
    }
    case "readColors":
      return hardware.request("readColors");
    case "verifyColors": {
      if (!hardware.state.connected || !hardware.state.armed) throw new Error("请先连接键盘并播放灯效");
      const actual = await hardware.request("readColors");
      const expected = colors.map((color,index) => actual.customColorScale === 200
        ? '#'+[1,3,5].map((start,channel)=>{
            let value=Math.floor(parseInt(color.slice(start,start+2),16)*200/255);
            if(index===83&&channel>0)value=Math.floor(value*150/255);
            return value.toString(16).padStart(2,'0');
          }).join('') : color);
      const mismatches = expected.flatMap((color,index) => color.toLowerCase() === actual.colors?.[index]?.toLowerCase() ? [] : [index]);
      return {matches:mismatches.length === 0,checked:84,mismatches,expected,actual:actual.colors?.slice(0,84)};
    }
    case "refreshCodex":
      return codex.refresh();
    case "codexAction": {
      if(req.phase==='up') return codexGestures.release(req.source??'button');
      const action = codex.action(
        req.action === "task" ? "openTask" : req.action,
        { threadId: req.threadId },
      );
      if (!action.available)
        throw new Error(action.reason ?? "这个快捷操作暂不可用");
      if (action.type === "deepLink") {
        await codexGestures.release();
        const threadId = decodeURIComponent(new URL(action.url).pathname.slice(1));
        const result = await hardware.request("shortcut", {
          action: "task",
          threadId,
        });
        codexLights.select(threadId);
        return result;
      }
      if (action.requiresVerifiedApprovalContext)
        throw new Error(
          "请在 Codex 的当前审批卡中批准或拒绝；此处无法确认审批上下文",
        );
      codexLights.wake();
      return codexGestures.execute(action,{phase:req.phase,source:req.source});
    }
    case "refreshClaude":
      return claude.refresh();
    case "claudeHookStatus":
      return claude.hookStatus();
    case "claudeHookInstall": {
      // process.execPath is preferred; the packaged runtime and common install
// locations are kept as fallbacks in case this bundle is moved later.
      const result = await claude.install({ nodeCandidates: [process.execPath, path.join(root, "runtime/node")] });
      await syncKeyAdaptation();
      return result;
    }
    case "claudeHookRemove":
      return claude.remove({ purgeSpool: req.purgeSpool !== false });
    case "claudeWake":
      lightPower.wake();
      claudeLights.wake();
      return {...claudeLights.snapshot(),sleeping:lightPower.sleeping};
    case "claudeSelect": {
      if (!claudeSlots().some(task => task?.id === req.sessionId)) throw new Error("这个会话不在当前六个灯位中");
      claudeLights.select(req.sessionId);
      return claudeLights.snapshot();
    }
    case "claudeBind":
      return command({op:'settings',settings:rebindClaudeKey(store.data.settings,req.group,req.index,req.code)});
    case "claudeSlot": {
      if (agentSource() !== "claude" || !codexKeysState().enabled || !Number.isInteger(req.index) || req.index < 0 || req.index > 11)
        throw new Error("命令键未启用");
      claudeLights.wake();
      if (req.index < 6) {
        const task = claudeSlots()[req.index];
        if (!task) throw new Error("这个任务键尚未绑定会话");
        return command({op:"claudeAction",action:"task",sessionId:task.id});
      }
      return command({op:"claudeAction",action:store.data.settings.claudeCommandIds[req.index-6]});
    }
    case "claudeAction": {
      if (req.phase === 'up') return {released:false};
      const tasks = claudeTasks();
      const session = req.sessionId ? tasks.find(task => task.id === req.sessionId) ?? null : null;
      if (req.sessionId && !session) throw new Error("这个会话已不在当前列表中");
      if (req.action === "task") {
        if (!session) throw new Error("这个任务键尚未绑定会话");
        claudeLights.select(session.id);
        const choice = store.data.settings.claudeTaskAction ?? "focusApp";
        if (choice === "selectOnly") return {selected:session.id};
        const descriptor = claude.action(choice, {session});
        if (!descriptor.available) throw new Error(descriptor.reason ?? "这个操作暂不可用");
        return {...await claude.execute(descriptor), selected:session.id};
      }
      const descriptor = claude.action(req.action, {session: session ?? claudeSelected() ?? claudeSlots().find(Boolean) ?? null});
      if (!descriptor.available) throw new Error(descriptor.reason ?? "这个操作暂不可用");
      if (descriptor.type === "local") return claudeLocalCommand(req.action);
      claudeLights.wake();
      return claude.execute(descriptor);
    }
    default:
      throw new Error("不支持的操作");
  }
}
/** Commands NuPhyLab can answer on its own; none of them reach Claude Code. */
async function claudeLocalCommand(id) {
  const available = claudeSlots().filter(Boolean);
  switch (id) {
    case "none":
      return {handled:true};
    case "refresh":
      return claude.refresh();
    case "wakeLights":
      lightPower.wake();
      claudeLights.wake();
      return lightPower.snapshot(store.data.settings);
    case "toggleLightMode":
      return command({op:"settings",settings:{claudeLightMode:store.data.settings.claudeLightMode==="whole"?"keys":"whole"}});
    case "nextTask":
    case "prevTask": {
      if (!available.length) throw new Error("当前没有可切换的会话");
      const index = available.findIndex(task => task.id === claudeLights.selectedId);
      const target = index < 0 ? 0 : index + (id === "nextTask" ? 1 : -1);
      const next = available[((target % available.length) + available.length) % available.length];
      claudeLights.select(next.id);
      return {selected:next.id};
    }
    case "nextAttention": {
      const ranked=[...available].sort((a,b)=>(CLAUDE_ATTENTION_RANK[a.status] ?? 6)-(CLAUDE_ATTENTION_RANK[b.status] ?? 6));
      const target=ranked.find(task=>["awaitingApproval","error","awaitingInput"].includes(task.status));
      if (!target) throw new Error("当前没有需要关注的会话");
      claudeLights.select(target.id);
      return {selected:target.id};
    }
    default:
      throw new Error("这个操作暂不可用");
  }
}
hardware.on("shortcut", (event) => {
  if (!agentEnabled()) return;
  if (agentSource() === "claude") {
    const session = event.action === "slot" ? claudeSlots()[event.index] : null;
    if (session)
      serialized(() => command({ op: "claudeAction", action: "task", sessionId: session.id })).catch((e) => {
        playback.lastError = e.message;
      });
    return;
  }
  const task = event.action === "slot" ? slots()[event.index] : null;
  if (task)
    serialized(() =>
      command({ op: "codexAction", action: "task", threadId: task.id }),
    ).catch((e) => {
      playback.lastError = e.message;
    });
});
hardware.on("triggerKey", (event) => {
  const generation = triggerGeneration;
  if (triggerMonitor !== "global" || !trigger.armed || trigger.flashing) return;
  const selected = TRIGGER_KEYS.find((key) => key.code === trigger.snapshot().config.code);
  if (event.keyCode !== selected?.keyCode) return;
  serialized(() => generation === triggerGeneration ? fireTrigger() : undefined)
    .catch((error) => { playback.lastError = error.message; });
});
const uiDir = process.env.AIR_STUDIO_UI ?? path.join(root, "ui/dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};
function json(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  const expected = `127.0.0.1:${server.address()?.port}`;
  if (req.headers.host !== expected) {
    json(res, 403, { ok: false, error: "仅允许本机访问" });
    return;
  }
  let url;
  try {
    url = new URL(req.url, `http://${expected}`);
  } catch {
    json(res, 400, { ok: false, error: "地址无效" });
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (stopping) {
      json(res, 503, { ok: false, error: "软件正在恢复键盘并退出" });
      return;
    }
    if (
      req.headers["x-air-token"] !== token ||
      (req.headers.origin && req.headers.origin !== `http://${expected}`)
    ) {
      json(res, 403, { ok: false, error: "本机连接已过期，请重新打开窗口" });
      return;
    }
    try {
      if (req.method === "GET" && url.pathname === "/api/state")
        return json(res, 200, state());
      if (req.method === "GET" && url.pathname === "/api/layout")
        return json(res, 200, layout);
      if (req.method === "POST" && url.pathname === "/api/command") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8 * 1024 * 1024) {
            json(res, 413, { ok: false, error: "文件过大，最大 8 MB" });
            return;
          }
        }
        let value;
        try {
          value = JSON.parse(body);
        } catch {
          throw new Error("数据不是有效的 JSON");
        }
        const result = await serialized(() => command(value));
        return json(res, 200, { ok: true, result });
      }
      return json(res, 404, { ok: false, error: "接口不存在" });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const requested = decodeURIComponent(url.pathname);
    if (requested.includes("\0")) throw new Error("invalid path");
    let filename = path.resolve(uiDir, "." + requested);
    if (
      !filename.startsWith(path.resolve(uiDir) + path.sep) &&
      filename !== path.resolve(uiDir)
    )
      throw new Error("invalid path");
    if (requested === "/" || !path.extname(filename))
      filename = path.join(uiDir, "index.html");
    let body = await readFile(filename);
    if (path.extname(filename) === ".html") {
      body = body
        .toString()
        .replace('<html lang="zh-CN">', `<html lang="${store.data.settings.language}">`)
        .replace(
          "<head>",
          `<head><script>window.__AIR_TOKEN__=${JSON.stringify(token)}</script>`,
        );
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
      );
    }
    res.writeHead(200, {
      "Content-Type":
        mime[path.extname(filename)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("NuPhyLab 界面尚未构建。请运行 npm run build。");
  }
});
server.once("error", error => {
  if (error.code === "EADDRINUSE" && !process.env.AIR_STUDIO_PORT && process.env.AIR_STUDIO_PREFERRED_PORT) server.listen(0, "127.0.0.1");
  else { console.error(error.message); process.exitCode = 1; void shutdown(); }
});
server.once("listening", async () => {
  const address = server.address();
  const info = {
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    pid: process.pid,
    token,
  };
  await writeFile(path.join(dataDir, "runtime.json"), JSON.stringify(info), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({ event: "ready", port: address.port, url: info.url }),
  );
  codex.start().catch((e) => {
    playback.lastError = "Codex 读取暂不可用：" + e.message;
  });
  claude.start().catch((e) => {
    playback.lastError = "Claude Code 读取暂不可用：" + e.message;
  });
});
server.listen(port, "127.0.0.1");
hardware.on("diagnostic", detail => process.stderr.write(`[HIDBridge] ${detail}`));
async function shutdown() {
  if (stopping) return;
  stopping = true;
  audio.stop();
  playback.playing = false;
  timer.stop();
  firmware.close();
  server.close();
  let exitCode = process.exitCode || 0;
  try {
    while (busy) await new Promise((r) => setTimeout(r, 20));
    await commandTail;
    // A failure in one cleanup step must not skip keyboard restoration or
    // leave another child process running after the application has exited.
    for (const [stage, cleanup] of [
      ["trigger", () => disableTrigger()],
      ["held shortcuts", () => codexGestures.release()],
      ["keyboard", () => hardware.close()],
      ["Codex connection", () => codex.stop()],
      ["Claude Code connection", () => claude.stop()],
    ]) {
      try { await cleanup(); }
      catch(error) {console.error(`Shutdown ${stage}: ${error.protocolDetail ?? error.message}`);exitCode=1;}
    }
  } catch (e) {
    console.error(e.message);
    exitCode = 1;
  } finally {
    server.close();
    process.exit(exitCode);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
