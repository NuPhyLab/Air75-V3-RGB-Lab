# NuPhy Lab — English guide

[中文 / English home](README.md) · [简体中文指南](README.zh-CN.md)

NuPhy Lab is a macOS lighting studio for **NuPhy AIR65 / AIR75 / AIR100 V3, NODE75 / NODE100 (LP / HP), and Kick75 (ANSI)**. Connect a keyboard by USB to detect the model automatically. Artwork stays separate for each model.

It includes drawing, animation, key-triggered effects, games, audio-reactive lighting, a local artwork library, and Codex / Claude Code task shortcuts and status lights.

## Download and install

**[Download the latest macOS installer](https://github.com/bohu8264/NuPhyLab-next/releases/latest/download/NuPhyLab-macOS-AppleSilicon.dmg)**

Requires **Apple Silicon and macOS 13.5 or later**. The DMG is signed with NuPhy's Developer ID and notarized by Apple.

[Latest release and notes](https://github.com/bohu8264/NuPhyLab-next/releases/latest) · [Previous versions](https://github.com/bohu8264/NuPhyLab-next/releases)

1. Quit the old NuPhy Lab app before installing.
2. Open the DMG and drag **NuPhy Lab** to Applications. Replace the existing app if prompted, and keep one installed copy. Keep the app-data folder to retain your artwork, drafts and settings.
3. Connect the keyboard with a USB data cable and select wired mode. Follow the app's permission and firmware guidance.

Allow Input Monitoring and Accessibility when prompted. The app may automatically close and reopen once to apply newly granted permissions. Audio permissions are requested when using audio-reactive lighting.

If the keyboard needs a firmware update, follow the NuPhyIO reminder, close the website after upgrading, then return to NuPhy Lab.

See [keyboard compatibility](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/KEYBOARD_COMPATIBILITY.md) for firmware requirements and validation coverage. AIR65 V3 has no physical function row and does not offer automatic F1–F12 takeover.

Physical checks for newly added models currently cover NODE75 LP only, without establishing that every feature on that model has been verified. The other new models still require hardware validation. First-install permissions on another Mac, actual AI command effects, touch gestures and interaction with media inputs require separate checks.

## AI Assistant

Enable Codex mode in AI Assistant to use the default command keys:

| Key | Action |
| --- | --- |
| F7 | Switch between Standard and Fast |
| F8 | Allow the current approval request once |
| F9 | Deny the current approval request |
| F10 | Open a new chat |
| F11 | Hold to dictate; release to finish |
| F12 | Send from the focused chat composer |

F8 and F9 require a current approval request. F12 requires the chat composer to be focused. Command assignments can be changed in AI Assistant.

## Labs: Ask about a selection

Selection requires **macOS 14 or later**. Keyboard features continue to support macOS 13.5.

1. Open **Settings → Models & API**, choose a service and model, and save your own API key. Choose from model presets, load account models where supported, or enter a custom model ID and compatible endpoint.
2. Enable **Labs → Ask about a selection** and grant Accessibility, Input Monitoring and Screen Recording access. The app checks permissions and the actual shortcut listener.
3. Hold the shortcut, drag over a region and release to run the default action. Scroll during selection to switch between translation, summary and explanation. The default shortcut is **Option–Shift–Q** and can be changed.
4. Choose one of 16 targets under **Translate to**, including Chinese, English, Japanese and Korean. You can also change the target in the answer panel. The choice is saved independently of the interface language.

For spoken questions, enable **Hold to speak** and allow Microphone and Speech Recognition access. Speech is transcribed locally; recordings are not uploaded. The image switch below it allows selected images to be included when needed. The model and endpoint must support image input.

Selected text, questions and any enabled images needed for the selected action are sent to your configured model service. API keys stay in the local Keychain. Selection and voice are disabled by default for new users.

[Full setup and usage](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION.md) · [Models, images and permissions](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION_R2.md) · [Interface and translation languages](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION_LANGUAGES.md) · [What's new in 1.2.41](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/RELEASE_1.2.41.md)

## Updates and compatibility

NuPhy Lab includes signed in-app updates. It checks for new releases automatically, or you can choose **Check for Updates** in the application menu or **Settings → About & updates**. Artwork, drafts and settings are retained. Users on 1.1.x need to install the current app once manually.

Lighting requires USB. AIR75 V3 also supports Bluetooth shortcut control. The current keyboard layouts are ANSI.

Diagnostics stay on the Mac. Update checks do not upload task contents, artwork or keyboard input.

## Source and documentation

[Source code](https://github.com/bohu8264/NuPhyLab-next/tree/main) · [Development guide](https://github.com/bohu8264/NuPhyLab-next/blob/main/README.en.md#source-and-development) · [Releases](https://github.com/bohu8264/NuPhyLab-next/releases)

[Documentation index](docs/README.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Report an issue](https://github.com/bohu8264/NuPhyLab-next/issues)
