# Codex integration — 2026-09-11

NuPhyLab independently reads local task metadata and structural lifecycle events; it does not connect to the live Desktop app-server. Account quota uses a separate read-only app-server connection restricted to `initialize` and `account/rateLimits/read`. It never submits prompts, answers approval requests, or changes Codex settings while reading status.

## Sources and state stability

`server/codex.mjs` discovers the newest compatible `state_*.sqlite`, opens it read-only and selects up to 100 unarchived user threads. Pinned and explicitly tracked slot IDs are included before the recency limit. Rollout paths must resolve beneath the Codex home; bounded tails retain structural event fields only, not user message text.

`server/codex-writers.mjs` reads existing task-writer handles with `lsof` and process start times with `ps`. It never acquires or changes lock files. A living writer, an active event from that process lifetime, and no terminal event provide evidence for ongoing work even during a long silent interval. Stale activity predating the process does not. Without writer evidence, the earlier bounded observation rule remains: recent activity newly observed after connection, otherwise unknown. Writer ownership is an inference from local lifecycle data, not the official Micro live state feed.

Pending requests retain their structural IDs so unrelated tool outputs cannot clear them; a matching result or terminal event does. Approval and response labels are distinguished where event metadata permits it. Desktop-only approval and voice states remain incomplete.

Unread state recognizes `electron-thread-read-state-v1.unreadByIdentity` when one local identity/namespace is unambiguous. Multiple accounts/namespaces yield unavailable read state instead of merging accounts. If the new format exists, obsolete legacy unread arrays are not used. Explicitly read completed tasks become idle. A completed event with unavailable read metadata cannot establish whether the user has read the result.

Temporary index errors retain previous slot identities and set `taskSource.stale`. After 30 seconds without a successful read, retained tasks become unknown. `available` at the root can also reflect quota availability; clients must check the separate `taskSource` flag.

## Lighting and slots

`shared/codex-lighting.mjs` is the common RGB definition for UI and output: idle `#FFFFFF`, working `#304FFE`, unread/completed `#00FF4C`, pending `#FF6D00`, error `#FF0033`, unknown `#858582`, empty `#000000`.

Sources: recent, pinned local tasks in pin order, priority (pending → error → unread → working → idle → unknown), and six explicit custom slots. Pinned projects and remote/cloud tasks are not yet included. Older nonempty manual slot settings migrate to custom mode.

Task bindings (F1–F6 by default) show task colors, with optional breathing on the task selected in NuPhyLab. That selection is explicitly separate from the real foreground task in Codex. Optional command-key feedback (F7–F12 by default) uses a moving segment while selected work is active; a nonworking selection keeps its status color until the selection/state changes or whole-keyboard sleep. This uses Air main keys, not independently addressed side LEDs. It does not reproduce Micro firmware's exact waveform.

Independent brightness 0–100 is followed by global keyboard brightness. Device owns the only light-on and inactivity timers for key lights, side lights, and Codex status lights. Legacy codexAutoOffMs/codexHintMs values remain readable for compatibility but never affect output. Sleep and wake state come from LightingPower; polling does not restart its clock. Pausing artwork leaves task updates active. Game/trigger ownership suppresses Codex overlays. Successful HID acknowledgement precedes publishing a displayed RGB frame.

## Controls and limitations

`describeAction` returns data only. Task IDs must exist in the current snapshot before generating a `codex://threads/...` descriptor. Native delivery verifies/activates the target for system shortcuts and uses explicit task URLs for task selection.

The native host registers direct F1–F6 task keys and F7–F12 command keys by default; both sets can be rebound with the key recorder. The real server centrally resolves the slot and checks allowed action descriptors. Twenty-three default shortcut descriptors are available; approval/rejection descriptors remain disabled. Unknown actions cannot become arbitrary keys. macOS permission and customized Codex shortcuts can prevent or change execution.

Fast, context-bound approvals/rejections, direct fork, composer submission, hold-to-talk, real voice/transcription lights, skills, knob/joystick navigation, background-only task activation and true desktop focus synchronization are not implemented. Source inspection and fake transport assertions do not certify that a shortcut achieved its intended result in the live Codex UI.

### Command gesture repair (2026-09-14)

Physical command presses now carry separate down/up phases through an ordered native queue. Dictation keeps its primary shortcut down until the assigned key is released. The UI also has explicit start/stop controls. Rebinding, disabling controls, entering a game/trigger, changing tasks, another command and shutdown release the held shortcut; a 120-second native watchdog bounds a lost release. The receiver PID is retained for key-up after a focus change. This is dictation shortcut support, not Micro's complete voice-button gesture model.

The shared command boundary rejects duplicate down events and duplicate press cycles within 250 ms, preventing one duplicated toggle from opening and immediately closing a terminal or voice session. The local `CODEX_HOME/keybindings.json` is read before delivery, including explicit disabled entries. Dictation uses the primary binding because the installed hold listener does so. Unsupported bindings and shortcuts that would recursively invoke NuPhy's own unmodified command keys fail visibly. Codex's keymap is never modified.

Sources checked: installed Codex 26.908.40834 command definitions and dictation hold listener; [official shortcuts](https://learn.chatgpt.com/docs/reference/commands#keyboard-shortcuts). Voice is gated by Codex's runtime availability. A successful native send does not establish that voice started or that a terminal remained visible; computer-use access to the Codex app is denied in this environment.

## API

`new CodexAdapter({onChange, codexHome, enableQuota, liveWriters, now})`; `start()`, `stop()`, `refresh()`, `snapshot()`, `action(id,args)`, `track(ids)`.

Defaults: task polling 2500 ms, quota polling 60000 ms, maxTasks 100, tailBytes 262144, fallback activeWindowMs 15000. Reads and outputs are bounded; returned snapshots are defensive copies. Separate status fields explain unknown/stale data.

Additional service commands: `codexSelect {threadId}`, `codexWake`, `codexSlot {index:0..11}`, and read-only `verifyColors` comparing the last acknowledged 84-color frame to device memory. Dynamic animation may advance between UI snapshots; the service serializes its own readback with lighting writes. The native reader waits for the 45 ms firmware render boundary after D8 before reading D2, preventing a mixture of preceding/current frame chunks.

## Verification boundary

The current Codex task was recognized immediately as running through the real local index and writer evidence. Regression tests cover long silence, process lifetime changes, terminal events, unread clearing, pending request correlation, temporary read failure, task sources, breathing/auto-off, paused animation updates, command dispatch restrictions and RGB readback mismatches.

Direct Codex UI automation was rejected by the computer-use tool for the Codex app. No alternate automation route was used to bypass that restriction. Official Micro behavior was compared against the installed 26.903.71938 source and [OpenAI's Micro guide](https://learn.chatgpt.com/docs/features/codex-micro). Live UI action results and Micro physical hardware were not verified. NuPhy UI and Air USB checks are separate from that limitation.

## Configurable task and command keys · 2026-09-14

Both groups have six independent key assignments. Task keys default to F1–F6; command keys default to F7–F12. The native host registers zero-modifier Carbon hotkeys and also handles directly delivered window events. A shared held-key gate prevents repeat actions. The recorder suspends native registration and waits for acknowledgment before listening, commits on release, and resumes using the updated configuration. Assigning an occupied key atomically swaps it across either group. Browser mode dispatches through the same backend only while its window has focus.

The backend resolves each key against current settings and current task slots, so remapping and recent-task changes do not retain old index-based actions. A monotonic configuration revision prevents older state requests from reverting native bindings. Games and key triggers reject task-key actions as well as releasing native registrations. Editing NuPhyLab inputs and recording suspend shortcuts without changing saved assignments. Registration failures and action failures are visible in the UI.

The supported recorder catalogue is shared with ordinary key-trigger keys: letters, digits, function, navigation and editing keys. Fn and modifier-only bindings are deliberately unavailable. Del does not acquire a nonexistent LED. Native shortcuts are system-wide while enabled and can also be pressed on another keyboard; they are not filtered by USB device identity. On keyboards configured to send media controls, use standard F-key output (or Fn + F-key).

Status and ambient pixels are mapped to the chosen physical LED positions. Removing a binding restores its prior artwork pixel; the reserved index 83 is never used. Existing lighting timers, selected-task feedback, translations and artwork storage remain independent.
