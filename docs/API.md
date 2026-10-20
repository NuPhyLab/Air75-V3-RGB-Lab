# Internal UI API / 内部界面接口

[Documentation / 文档目录](README.md)

Reference for the local same-origin HTTP API, authenticated with X-Air-Token. It documents state, settings, artwork, playback, games, audio, triggers, agent controls and recovery. Request fields and executable examples are retained exactly; this is an internal interface rather than a promise of a stable public API.

说明同源本地 HTTP 接口、令牌认证、状态、作品、播放、游戏、声音、触发、助手控制和恢复；字段及示例保留，不承诺公开 API 稳定性。

## Detailed record / 详细记录

# Internal UI API (same-origin, X-Air-Token from window.__AIR_TOKEN__)

GET /api/state -> {device:{connected,armed,firmware,ledCount,error},playback:{mode,playing,fps,framesSent,lastError},colors:string[84],scenes:Scene[],settings:{brightness:number,codexEnabled:boolean,quotaSideEnabled:boolean,slotIds:string[]},codex:{available,reason,tasks,slots,quota,updatedAt},game:GameState}

`device` also includes `autoConnecting`, `connectionPaused`, and `errorCode`. `DEVICE_NOT_FOUND` is a waiting state, without a red error. `firmware` at the response root contains `status`, `current`, `latest`, `checkedAt`, `checking`, `stale`, `error`, `compatible`, `verifiedVersion`, and `updateUrl`. Status distinguishes disconnected/checking/current/updateAvailable/newer/unknown/unavailable.

- `{op:'checkFirmware'}` starts a background official-version check and returns immediately, leaving the lighting queue responsive; poll `/api/state` for completion.
- `{op:'prepareFirmwareUpdate'}` stops effects, restores original lighting, disconnects USB, and pauses automatic reconnect; returns the fixed official NuPhyIO URL. The UI opens it only after success. `{op:'connect'}` resumes normal operation afterward.
GET /api/layout -> Key[]; Key={index,code,label,x,y,w,h}, units are key pitches, y0..5.
Layout contains 83 physical keys with unchanged RGB indices 0..82 across six rows. The first row has consecutive x0..14 positions; index14 at x14,y0 displays Ins and its code remains Insert. The UI separately draws a non-interactive, decorative Del keycap at x15,y0 in place of the knob illustration; it is not returned in Key[] and consumes no RGB index. Color arrays retain 84 entries; index83 has no confirmed physical position, defaults to black, and remains black during games.
POST /api/command JSON -> {ok:true,result} or {ok:false,error}. Always use errors visibly.
- {op:'connect'|'disconnect'|'restore'|'stop'|'pause'}
- {op:'preview',colors:string[84]} static RAM frame; need connected, implicitly arm.
- {op:'play',colors:string[84],animation:Animation} implicitly arm.
- {op:'saveScene',scene:Scene} returns savedScene, new ID if absent. No hardware.
- {op:'deleteScene',id:string}; {op:'importScenes',scenes:Scene[]} validates entire import atomically.
- {op:'settings',settings:partial}; persistent, brightness0..100; codex overlay enabled, quotaSideEnabled.
- {op:'gameSelect',gameType:GameType}; {op:'gameStart',gameType?:GameType,speed?:1..10}
- {op:'gameInput',direction:'up'|'down'|'left'|'right'} for Snake, or {op:'gameInput',code:string,pressed?:boolean} for other games.
- {op:'gamePause',paused?:boolean}; {op:'gameStop'}
- {op:'codexAction',action:'task',threadId:string} or action from adapter shortcuts (safe manual clicks only).
- {op:'refreshCodex'}
- {op:'openPermissionSettings',permission:'inputMonitoring'|'accessibility'}
- {op:'refreshPermissions'}
Scene={id?:string,name:string,colors:string[84],animation:Animation,createdAt?,updatedAt?}
Animation={effect:'static'|'move'|'pulse'|'wave'|'frames',direction:'left'|'right'|'up'|'down',speed:1..10,loop:boolean,frames?:{colors:string[84],duration:number}[]}; duration milliseconds 80..10000.

Removed legacy `rainbow` scenes are normalized to `static` on library load, save and import, retaining their colors and other metadata. Direct playback requests with `effect:'rainbow'` are rejected.
Light canvas independent from storage/playback. UI stores selected scene/draft client-side, scenes stored atomically by server; explicit save. No fake device/task data if unavailable. Blank/presets are designed, not reported as user saved. Export via JSON Blob download from state (supported native download via host).

## macOS permission settings

`PermissionState = {inputMonitoring:boolean, accessibility:boolean, canPostEvents:boolean, promptsRequested:false}`. The latest native snapshot is exposed as `device.permissions` in `GET /api/state`.

| Command | Result and behavior |
| --- | --- |
| `openPermissionSettings {permission:'inputMonitoring'\|'accessibility'}` | Returns `{opened:true,permission,permissions:PermissionState}` and updates `device.permissions`. The server and native bridge both restrict the destination to these two values; clients cannot supply an arbitrary URL. The native bridge opens the corresponding System Settings page without requesting or granting access. Invalid destinations and failure to open settings are errors. |
| `refreshPermissions` | Returns `PermissionState`, updates `device.permissions`, and maps to the native `permissions` operation. Performs read-only checks; does not open System Settings, request access, connect HID or enable a listener. |

The Device page's 「允许」 buttons invoke `openPermissionSettings`; the user changes the permission in System Settings. The Device page invokes `refreshPermissions` on mount and when its window regains focus or becomes visible, so returning from settings refreshes the displayed state. `opened:true` means only that macOS accepted opening the URL, not that access was granted or that the expected pane was displayed. Permission requests such as `CGRequestListenEventAccess` or `AXIsProcessTrustedWithOptions` with prompting are not part of this flow.

The native destinations use `x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent` and `?Privacy_Accessibility`. These are undocumented deep links whose behavior may differ between macOS versions, not a stable Apple API contract. If the destination does not open correctly, use System Settings → Privacy & Security → Input Monitoring / Accessibility. See [Apple DTS on supported URL schemes](https://developer.apple.com/forums/thread/761314). Opening a pane also does not register a missing application in its permission list.


## Four-game session

`GameType = 'snake' | 'whack' | 'memory' | 'pong'`. A single session owns the keyboard. The common snapshot is:

```ts
GameState = {
  type: GameType;
  status: 'idle' | 'running' | 'paused' | 'over' | 'won';
  score: number;
  bestScore: number;
  speed: number; // integer 1..10
  recordWarning?: string | null; // present in GET /api/state
  // Additional fields depend on type; see below.
}
```

| Command | Behavior |
| --- | --- |
| `gameSelect {gameType}` | Select a fresh idle game and load its own record. Rejects while the current game is `running` or `paused`: send `gameStop` first. Does not start the selected game. |
| `gameStart {gameType?, speed?}` | Start/restart a round, defaulting to the selected type and speed 4. Validate type and integer speed before changing the session; arm connected hardware, save the pre-game scene and mute side lighting. |
| `gameInput {direction}` | Snake directional move. The direction is `up`, `down`, `left` or `right`; reversal and extra turns in the same movement step are ignored. |
| `gameInput {code, pressed?}` | Physical `KeyboardEvent.code`, default `pressed: true`. Whack and Memory consume presses; Pong retains held W/S and ArrowUp/ArrowDown independently until `pressed: false`. Unknown game-specific keys have no effect. |
| `gamePause {paused?}` | `true` pauses, `false` resumes; omission toggles. Explicit pause is idempotent and releases held Pong inputs. Idle/finished sessions are unchanged. |
| `gameStop` | End game control, release held inputs and restore the scene/playback and lighting integrations from before the game. Returns playback state. |

Selection, start, input and pause return the current game snapshot. Natural `over`/`won` stops the round and retains its result; the client can restart or use `gameStop` to exit and restore lighting. Client commands should be serialized so release/pause/selection cannot overtake one another.

The UI gives all four games one selector under 创作台 → 游戏. Space is the shared pause/resume key on the foreground game page, not a system-wide keyboard hook. Ignore editable fields, modified shortcuts and auto-repeat presses. On window blur, document visibility loss or leaving the game page, release held inputs and send `gamePause {paused:true}`; do not automatically resume when focus returns. All simulation timers freeze while paused.

### Type-specific snapshots and rules

| Type | Additional snapshot fields | Rules and controls |
| --- | --- | --- |
| `snake` | `direction`, `width`, `height`, `cellCount`, `body:number[]`, `food:number\|null` | Arrows move through adjacent physical keys. Food adds 1 point; wall/body collision ends the game, filling all cells wins. `body`/`food` contain RGB indices, not rectangular coordinates. `cellCount` is 83 for ANSI; six rows have different lengths. |
| `whack` | `target:number\|null`, `targetCode:string\|null`, `remainingMs`, `targetRemainingMs`, `targetLifetimeMs`, `hits`, `misses`, `mistakes` | A 30,000 ms round using A–Z. Press the lit letter to score 1 and show a new target. Expired targets count as misses; other letter presses count as mistakes without scoring. Faster speed shortens target lifetime. |
| `memory` | `phase:'watch'\|'input'\|'success'\|'error'`, `round`, `inputIndex`, `sequenceLength`, `cueIndex:number\|null`, `padIndices:number[]`, `padCodes:string[]`, `remainingMs`, `goalRounds` | Watch, then repeat A/S/D/F/J/K/L/Semicolon cues in order. One cue is added each round. Each next input has 10,000 ms; wrong input or timeout ends play. Each completed round adds 1 point; 20 rounds wins. Speed changes cue duration. The future sequence is not exposed. |
| `pong` | `leftScore`, `rightScore`, `winner:'left'\|'right'\|null`, `paddles:{left:number,right:number}`, `ball:{x:number,y:number}`, `phase:'serve'\|'rally'\|'finished'`, `serveRemainingMs` | Left holds W/S, right holds ArrowUp/ArrowDown. Both players can move simultaneously; opposite directions cancel. Two-key-high paddles return a ball that bounces at the top/bottom. Missing awards the opponent a point, with a 900 ms serve delay. First to 7 wins. `score` is total points in the match; player scores remain separate. Speed changes ball velocity. |

Pong uses the physical 16 × 6 key-unit space. Paddle values are continuous center y positions from 1 to 5, rendered on adjacent edge keys. Ball coordinates project to physical key spans, including wide modifiers and the single spacebar LED; the shorter top row uses Ins as its right edge. Collision simulation is subdivided to avoid passing through a paddle during a delayed frame.

### Lighting and records

Only game objects output nonzero RGB: Snake/food, Whack target, Memory cue/feedback, or Pong paddles/ball. Other main-channel backgrounds, index 83 and all 20 side-light entries stay black. Codex F1–F6 overlays and quota side lighting are suspended during game control. Snake may use any of the 83 mapped physical keys; other games use the mapped subset appropriate to their rules. The decorative Del at the knob position is excluded, and 84 logical main channels must not be described as 84 playable keys.

`library.json` persists records separately in `gameBestScores:{snake,whack,memory,pong}`. The legacy `bestScore` is read as Snake's record when no valid `gameBestScores.snake` is present, and remains synchronized with that record on save. New games default to zero without discarding old Snake scores. Records mean food count, hits, completed Memory rounds, and total points in one Pong match respectively. A persistence failure is exposed as `recordWarning` in `/api/state`; a score visible in memory is not proof that it reached disk.

## Key-triggered artwork

`Scene` accepts optional `trigger: {code:string,count:number,intervalMs:number}`. Defaults are `Space`, 3, 600; count is an integer 1–20 and intervalMs is a full on/off cycle of 200–2000 ms. The key must appear in `shared/trigger-keys.json`. Old scenes remain valid; validation and imports preserve colors without adding trigger behavior to old artwork.

- `triggerArm {colors:string[84],trigger?:TriggerConfig}` validates, stops the previous game/effect, arms the keyboard, mutes both sides, outputs black and configures one native observer. Empty visible artwork is rejected before changing lighting.
- `triggerFire` previews one complete configured flash run; requires an armed trigger.
- `triggerKey {code}` is accepted only in explicitly reported window fallback mode and only for the configured key.
- `triggerStop` disables the observer and restores original lighting; no effect on an unrelated mode.

`GET /api/state` includes `trigger:{armed,flashing,completed,config,monitor:'off'|'global'|'window',warning:string|null}`. Playback mode is `trigger`, `playing` means a run is currently flashing; waiting remains armed with `playing:false`. Poll at 50 ms while in trigger mode. Other lighting and Codex overlays are excluded during ownership. Black is rendered before/after each run, and slot83 is always black. Repeated input during a run is ignored; no queue is retained.

Disconnects and output errors cancel the session; reconnect never silently re-enables the observer. Preview, animation, games, stop, disconnect and process shutdown release trigger ownership. Stale queued events carry a session generation guard.

## Codex Micro controls (updated 2026-09-14)

All lighting uses `lightDurationMs` and `lightIdleMs`. Legacy `codexAutoOffMs` and `codexHintMs` are accepted when loading older settings but ignored by rendering. `codex.lighting.sleeping` mirrors `lightPower.sleeping`.

Settings add `codexTaskSource:recent|pinned|priority|custom`, `codexBrightness:0..100`, `codexSelectedPulse:boolean`, `codexAmbient:boolean`, and `codexCommandIds:string[6]`.

`settings.codexStatusColors` is an optional partial map for `idle`, `running`, `completed`, `needsInput`, `error`, and `unknown`. Each value must be a full `#RRGGBB` string; settings updates atomically merge overrides and reject unknown IDs or invalid colors. Missing values use `STATUS_COLORS`; unassigned keys remain black. UI markers, task LEDs and command-key feedback share the palette, with brightness/pulse applied afterward. Reset sends all six default values. Updates persist without restarting animation or the global lighting timer.

`codexLightMode: 'keys' | 'whole'` defaults to `keys`. `codexWholeTaskId: string` defaults to an empty automatic choice. In `whole`, a nonempty ID pins the followed task (missing means all black); automatic follows the task selected through NuPhy controls, falling back to the sole available task. Multiple unselected tasks remain dark until chosen. The followed task may be outside the six key slots and is included in persistent task tracking. `codex.lighting.wholeTaskId` reports the resolved ID or null; `mode` reports the configured mode. All 83 mapped key lights share its status color and pulse, with slot 83 black. Ambient command lighting is excluded. The renderer preserves the underlying drawing and yields to games/triggers. Global idle observation follows only this task in whole mode, so unrelated tasks cannot wake the keyboard.

- `codexSelect {threadId}` chooses an existing slot for NuPhy feedback without opening Codex.
- `codexWake` is a compatibility alias for waking/restarting the whole-keyboard timer. `lightWake` is preferred.
- `codexSlot {index:0..11}` resolves a task/command only when Codex controls are enabled.
- `verifyColors` reads device memory and returns `matches`, `checked:84`, mismatch indices, expected and actual RGB. Requires an armed connection; does not prove optical calibration.

`codex.lighting` includes `sleeping`, `selectedId`, `selectionSource:studio`; it does not claim the real Codex foreground task. `colors` is published after a successful HID paint acknowledgement.

### Configurable Codex keys

- `settings.codexTaskKeys` / `settings.codexCommandKeys`: six unique physical `KeyboardEvent.code` values each; defaults F1–F6 / F7–F12. Duplicates across groups are rejected.
- `codexBind {group: "task" | "command", index: 0..5, code}`: atomically assign a key, swapping any existing assignment across either group.
- `codexKey {code}`: dispatch the current binding; requires Codex controls enabled, and rejects actions during games or key-trigger mode. Task bindings open the current slot's exact task ID.
- `state.codex.keys`: current bindings with native key codes and optional LED index, monotonic configuration revision, whether controls can run, native registration status (expires after 15 seconds), and the last key action outcome. No typed text is stored.
- `codexKeyStatus {registered, failed, suspended}`: native host heartbeat. Arrays contain configured key codes; failures are shown beside the Codex controls.
