# Product UI refinement · 2026-09-14

This is a focused correction within the existing Memo-inspired design, not a new visual direction. The frontend-app-builder small-fix exception applies: no generated concept or new artwork is needed. The user's screenshots are the visual baseline:

- /var/folders/5g/85jp5qrx7dnf_z59hjny_n780000gn/T/codex-clipboard-528bc9ec-9e1d-498d-b0fc-b8e37fc9a3a1.png
- /var/folders/5g/85jp5qrx7dnf_z59hjny_n780000gn/T/codex-clipboard-b09d0e91-2932-4b81-b705-d200515b991e.png

## Product decisions and fidelity ledger

| Check | Previous issue | Final treatment |
|---|---|---|
| Information hierarchy | Diagnostic counts and storage paths compete with everyday settings | Connection, lighting timers, preferences and permissions stay visible; Device details is closed initially |
| Instructions | Long timer and permission instructions always visible | How timers work and Permission help expand on demand; required actions, failures and update notices remain visible |
| Control geometry | Native number input, select and No limit have different heights | All six timer controls measure 36 px; shared select appearance, text metrics, radius and chevron |
| Icons | Navigation uses multiple sizes and different apparent weights | Nine navigation/device icons measure 18 × 18 px with 1.75 px strokes; Lucide outline family, consistent alignment; brand image untouched |
| Repeated content | Connected and disabled connect buttons repeat state; current/latest firmware repeat same version | One contextual connect/disconnect action; identical firmware version shown once; allowed permission state itself opens settings |
| Palette and layout | Existing white canvas, muted sidebar and sage controls should remain | Palette and sidebar hierarchy retained; flat keyboard and creation canvas unchanged |
| Responsive behavior | Native controls risk clipping and sidebar symbols change sizes | Checked default browser size, 1116 × 709 desktop content and 390 × 844 narrow viewport; no horizontal page overflow |

Copy changes are intentional, authorized information reduction: technical rows moved into details; help condensed; no new claims or unrelated sections. Dictation's essential hold/release instruction remains visible; extended command guidance is folded. Existing source-of-truth error/status information remains visible when actionable.

## Verification

Browser/IAB was used without fallback. The user baseline and latest desktop render were inspected with view_image in the same QA pass. DOM measurements confirmed equal control heights and icon dimensions/strokes. This faithfully retains the supplied design while applying the requested information, alignment and icon corrections; no material mismatch remains in the checked surfaces.

Verified Chinese and English, time editing and save after blur, No limit persistence after reload, opening/closing device details, permission-missing Allow actions, disconnect/reconnect button switching, collapsed Codex guidance, and Animation / Key trigger / Games / Library layout after shared select changes. This uses isolated device transport, not real system permission changes or real Codex commands.

Temporary screenshots, fixture data and old app bundle are removed after delivery. Source code and native app package contain the same production UI.
