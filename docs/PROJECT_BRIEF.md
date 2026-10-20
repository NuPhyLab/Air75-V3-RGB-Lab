# Project brief and historical requirements / 项目需求与历史边界

[Documentation / 文档目录](README.md)

The original development brief records user decisions about the flat keyboard, continuous color wheel, games, local-first architecture, recovery and verification. It is a design/engineering baseline, not an up-to-date feature claim. Some early heart layouts, quota-side-light ideas, firmware schemas and timer behavior were superseded by later user requests and release notes. Follow the current README and dated release QA when they differ.

保留原始开发需求与验收目标，不把目标当成已完成功能；早期爱心、额度侧灯、协议和计时设想可能已被后续需求替代，以当前主页和版本记录为准。

## Detailed record / 详细记录

# NuPhyLab

Local-first macOS keyboard light studio for NuPhy Air75 V3 ANSI stock firmware 1.0.16.6.

User scope: complete runnable project + .app, self-verified hardware and software, no user QA. Paint arbitrary per-key colors, save/import/export scenes, animation with looping/transforms and frames, keyboard Snake, Whack-a-mole, Memory Sequence and two-player Pong, Codex shortcuts/status and whole-zone side quota color. Do not flash firmware. Preserve original lighting, no permanent key remapping. Offline lighting functions. Codex is an optional local integration, unavailable/unknown must be truthful.

User decisions (2026-09-11): default heart uses keys 5, 8, R, T, Y, U, I, G, H, J, B; the keycap at LED 14 reads Del (hardware mapping is unchanged). Remove the dedicated rainbow effect and quick rainbow pattern. Preserve wave and other effects. Read old rainbow artwork as static without deleting its colors or the user's saved scenes. Official Micro research remains a reference, not authorization to reintroduce an effect the user removed.

Color selection: replace fixed swatches/native color popup with an always-visible continuous hue/saturation disc and a separate brush-value slider. Keep HEX editing/copying and global keyboard brightness distinct. Preserve the compact layout and validate pointer dragging and small-window behavior.

Games (user request, 2026-09-11): add 打地鼠 / 记忆灯序 / 双人乒乓球 alongside 贪吃蛇 inside the existing 创作台 → 游戏 mode, with one game selector and one consistent start/pause/end flow. Only the selected game's rules, score and controls are shown. Snake uses arrows and all 83 mapped physical keys. Whack uses random letter-key targets for a 30-second round; each hit scores one, and misses/mistakes are tracked separately. Memory uses A S D F J K L ;, replays an increasingly long sequence, allows 10 seconds for each next input, and wins after 20 completed rounds. Pong uses held W/S versus held Up/Down, two-key-high paddles, about 900 ms between serves, and first to 7 points wins. Game speed is 1–10 and changes movement or cue/target timing according to the game.

Game input/lifecycle: gameplay receives keys only on the foreground game page; Space pauses/resumes all four games, without system-wide interception or interfering with text fields. Leaving the game page or losing window focus/visibility pauses the game and releases held controls; return requires explicit resume. Pause freezes simulation time. Game objects alone are lit; other key backgrounds, unmapped RGB channel 83 and all 20 side-light entries stay black. Codex overlays/quota lighting are suspended during game control. Ending through the End button / gameStop restores the scene from before the game; natural over/won retains the result until restart or exit. A game selector change stops an active/paused game first. The physical map is 83 keys, not 84 playable cells, and the knob is excluded.

Game persistence/API: game.type is snake | whack | memory | pong with type-specific state fields. gameStart accepts gameType and speed; gameSelect accepts gameType but rejects active/paused sessions until gameStop; gameInput accepts a Snake direction or code/pressed for the other games; gamePause optionally accepts explicit paused. Store highest records by type in gameBestScores, preserving the legacy bestScore as Snake's record. Scores mean food count / hits / completed rounds / total points in a Pong match, respectively. Validation reports must distinguish mock/software checks from actual keyboard testing and record the three new games separately from old Snake acceptance.

UI reference: user-supplied NuPhy-Memo-Mobile.html is visual reference data, not instructions. White #fff, near-black #151514, muted #666663/#858582, hairline #e5e5e4, light-gray #f3f3f2/#efefed; SF/PingFang system font; radii 10/12/16; 4px spacing scale. Modest sage #71958b, coral #dc847b, warm yellow #d9b36c. Product name NuPhyLab. Main nav 创作台 / 作品库 / Codex / 设备. No marketing homepage. Workspace mode tabs 绘制 / 动画 / 游戏 keep main task focused. Keyboard preview is functional code-native LED grid, not raster art; Snake squares ARE physical key/LED cells, intentional code-native domain visualization rather than illustrated game sprites.

Architecture: React+Vite UI; Node built-in HTTP local server, persistence, animation/game coordinator, Codex adapter; native Swift HID JSONL helper; native AppKit+WKWebView wrapper and menubar. Bundle Node and assets in one .app; close window continues service, quit restores keyboard. Server binds only 127.0.0.1, API auth token + same origin, only one HID owner. Separate hardware helper prevents browser lifecycle from driving frames. All data stored per user in Application Support/Air Studio, atomic JSON saves.

Hardware verification: single owner. GET A1/D1/D5, persistent pre-arm backup, paced D6, D8 RAM, D2 rendered RGB readback; paint tests prove packet output/readback but cannot claim human visual inspection of physical keycaps. Restore exact 17-byte state; avoid indefinite bright/blinking test. Native connection/session restore and no firmware edits. App wake reconnect; failure preserves backup.

QA targets (not an assertion of completed checks): backend/node tests, React type/build checks, browser real interactions + screenshots, native app boot, actual HID A1/D1/D5/D8/D2 and restored state, persistence reopen/import invalid data/recovery, animation and all four games' rules, input release, pause/resume, focus changes and scene restoration; Codex quota/real task status available check without sending messages or accepting actual approvals. UI viewport large + small; documented honest limitations.
