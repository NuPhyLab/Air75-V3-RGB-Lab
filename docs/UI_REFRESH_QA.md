# UI refresh verification — 2026-09-11

## Scope

Memo-inspired navigation, full-width keyboard stage, horizontal parameter dock, shared typography and responsive sizing. Keyboard geometry, lighting protocol, HSV conversion, game rules and trigger timing were not changed.

## Checks passed

- TypeScript and Vite production build.
- 96/96 automated tests via `npm test` (service recovery, LED/game/trigger/color/scene behavior).
- CUA visual checks: paint, animation, trigger, four games, library, Codex, Device at 1100×700.
- Paint: draw on Esc, undo returns Esc to black; continuous wheel keyboard interaction; color value Home → #000000, End restores hue/saturation to #FF9B8F.
- Frames: select 逐帧, add frame, copy frame, delete copied frame.
- Trigger: arm → all keys black; test flash → only pattern lit; completion → all keys black; stop trigger. Denied global monitor is visibly reported with foreground fallback.
- Games: all four can start/pause/end. Snake pause has five lit LEDs (snake and food); memory has eight input pads; pong shows two players' controls and scores.
- Save/reopen: a separate QA scene saved to isolated library and reopened into 按键触发 with its settings.
- Responsive: 720×520 and 390×844 have no horizontal document overflow; lower controls remain accessible through vertical scrolling.
- No browser error logs.
- Human-visible screenshots and design comparison: `design/refresh-2026-09/`.

## Boundaries

Browser interaction tests used the real app service with simulated HID/Codex adapters and an isolated temporary data directory. They do not assert that each effect was visually observed on the physical keyboard. Real-user scenes and Codex tasks were not used as QA fixtures.

Before desktop update, the currently open old-version draft was saved as a new local scene through its UI. The local library was separately backed up under Application Support/Air Studio/Backups. Old app exited normally through Cmd+Q and all three old app/helper processes ended before installation.

## Desktop update verification

The newly packaged `release/Air Studio.app` was launched through CUA after the old app exited. Native AX and window screenshot confirm the four left child pages, continuous color wheel, Del key and latest 19-key heart. The physical Air75 V3 reconnected automatically and reported firmware 1.0.16.6; the app reported one RGB frame sent. The actual library shows all three scenes, including the just-saved pre-update draft. The app is left open on 绘制. Native screenshot: `design/refresh-2026-09/native-implemented.png`.

The new app currently reports macOS input monitoring and accessibility as not allowed. These permissions are outside this visual refresh acceptance: direct lighting works; global key monitoring/system-key injection are not claimed verified by this UI run. Foreground trigger fallback was tested using the isolated service.
