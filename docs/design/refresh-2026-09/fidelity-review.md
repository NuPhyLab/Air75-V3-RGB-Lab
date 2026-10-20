# UI fidelity review / 界面一致性核对

[Documentation / 文档目录](../../README.md)

Records visual comparison of the implemented Workspace against its concept and reference, including information hierarchy, spacing, controls, responsive behavior and deliberate differences. Screenshot observations and isolated interactions retain their original scope; they are not new physical-keyboard acceptance.

记录界面与概念参考的层级、间距、控件和响应式对照，有意差异及原始截图范围保留，不作为新真机验收。

## Detailed record / 详细记录

# UI fidelity review

Reference: [ImageGen primary concept](paint-concept.png), generated before implementation. Method: actual app served by the real local HTTP service with isolated fake HID/Codex adapters, operated and captured through Codex CUA in-app browser. No raster mockup is used as the application.

## Visual comparison

| Point | Concept | Implemented |
|---|---|---|
| Navigation | Quiet left sidebar with creative children | Persistent four children; sage active state and matching line icons |
| Hierarchy | Page title, work identity, two actions | 24px title, editable name with pencil, saved/type state, save/play actions |
| Composition | Wide keyboard stage above a control dock | Same structure; no top mode tabs or narrow right inspector |
| Color | White/limestone, sage controls, coral drawing | Same restrained palette; color wheel remains freely adjustable |
| Stage | Soft gray ground, thin border, toolbar and status | Implemented with real 83-key LED model and truthful device state |
| Paint dock | Color / brightness / quick pattern, fine dividers | Three aligned groups, continuous wheel and HEX, brightness, heart/clear |
| Density | Full primary workspace within 1100×700 | Paint, basic animation, trigger and game controls fit this viewport |
| Typography | Readable controls with quiet hints | Controls 12–13px, group labels 13px, hints 11px; large score numerals |

## Intentional deviations and copy diff

- Generated concept has inaccurate key positions/labels and heart pixels. Implementation keeps the user's exact physical layout, Del label, non-LED knob and 19-key right-side heart.
- Sidebar lights show actual device state rather than decorative mint lights in the concept.
- Keyboard is capped at 780px for painting/animation and 720px for trigger/games so real controls fit a compact window. It scales down for smaller windows.
- The editable name border appears on hover/focus rather than permanently framing the title.
- Concept brightness 70% becomes the real persisted value (100% in isolated QA); device and saving text remain truthful.
- Concept explanatory brightness sentence shortened to “调整整体灯光亮度，不改变画笔颜色。”
- Existing artwork title, button labels, color HEX and navigation labels are retained. Actual default stage count is “83 颗按键灯”.
- Trigger description is consolidated under “配色与触发说明”; section label is “闪烁设置”. Existing action/status semantics remain.
- Animation has its own color/settings dock. Brightness and quick patterns remain under 绘制. Frame editor expands only for 逐帧.
- At 720×520, controls stack and the page scrolls vertically instead of shrinking controls to illegible sizes. Phone-width 390px also tested without horizontal overflow.

The concept and `paint-implemented.png` were both reopened through view_image and compared. The intended visual hierarchy, palette and composition match; physical fidelity and real state take precedence over generated illustration errors.

Native WebKit was also captured and reopened through view_image (`native-implemented.png`). Its system sliders use macOS track/thumb rendering; the shared layout, sage accent, readable controls and full default viewport match the browser implementation.
