# UI design system — 2026-09-11 / 界面设计系统

[Documentation / 文档目录](../../README.md)

Defines the historical Memo-inspired palette, typography, spacing, components and responsive rules used by the development UI. This is a design reference, not an instruction to replace the current logo or revive a canceled redesign. Implementation and verification details remain in the original English record.

保留开发版的配色、字体、间距、组件和响应式规范，作为设计参考，不代表替换当前 Logo 或恢复已取消改版。

## Detailed record / 详细记录

# Air Studio UI refresh — 2026-09-11

Design reference: `paint-concept.png`, generated before implementation from the user's NuPhy Memo reference and current app constraints. The user delegated design decisions; this is not a concept approval gate.

## Layout and inventory

- Desktop shell: 156px quiet limestone sidebar, four persistent creative children; main padding 24px, content maximum 1120px.
- One 24px page title and editable work name. Save and playback remain in the heading.
- Full-width keyboard stage above controls, toolbar and playback state within it. No top mode tabs, no right inspector.
- Paint dock: color / keyboard brightness / quick pattern. Selection tools appear only when relevant.
- Animation dock: color and animation settings; frame editor expands only for frames.
- Trigger dock: color / trigger settings / activation and state. Game dock: game and rules / score and session / input controls.
- Library, Codex and Device share typography, spacing, controls and page heading treatment.
- Responsive: dock wraps below 980px, narrow windows retain the sidebar and readable controls; phone fallback stacks controls. Native window remains resizable.

## Tokens

White #fff; sidebar #f5f5f4; stage #f6f6f5; ink #151514; secondary #666663; quiet #858582; border #e5e5e4. Sage #71958b marks selection and switches; coral #dc847b is the drawing color. No additional decorative accents.

Title 24px / 600–650; section 13px / 600; body and controls 12–13px; hints at least 11px. Spacing 4/8/12/16/24; controls 34–36px; radius 8px controls and 12px stage. Grouping through alignment and whitespace, not nested cards.

## Asset and behavior constraints

The primary concept is a design specification, never a flattened app image. The keyboard remains an interactive code-native rendering of the user's physical layout. Games use physical LEDs and need no invented raster sprites. Preserve all 83 LED positions, the non-LED knob, Del label, 19-key right-side heart, real side-light state, HSV color math, saved scenes, key trigger and game semantics. Generated concept keyboard errors must not be implemented.
