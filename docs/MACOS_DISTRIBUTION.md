# macOS distribution

NuPhyLab v1.0.1 adds Developer ID distribution signing to the existing native AppKit app, Swift HID helper, and bundled Node runtime. The application identifier remains `local.airstudio.desktop`.

## Build and sign

Use a valid **Developer ID Application** identity. Keep credentials in Keychain, never in source or release assets.

```sh
npm --prefix ui ci
npm run build
npm test
AIR_STUDIO_DISTRIBUTION=1 \
AIR_STUDIO_SIGN_IDENTITY='Developer ID Application: Shenzhen NuPhy Technology Co., Ltd. (VBD322WS9K)' \
node scripts/package.mjs release/v1.0.1/NuPhyLab.app
```

Distribution mode rejects development and ad-hoc identities and checks the chosen identity against valid Keychain identities before replacing any output. Nested executables are signed individually, followed by the app bundle; `--deep` is used only for verification.

Each executable uses Hardened Runtime and a secure Apple timestamp. Node receives only `com.apple.security.cs.allow-jit` for V8. The host receives only `com.apple.security.device.audio-input` for microphone capture. The HID helper has no exception entitlements. No sandbox entitlement, debugger entitlement, disabled library validation, or provisioning profile is added.

## Notarize and staple

```sh
ditto -c -k --keepParent release/v1.0.1/NuPhyLab.app release/v1.0.1/notary-upload.zip
xcrun notarytool submit release/v1.0.1/notary-upload.zip --keychain-profile nuphy-notary --wait
# Continue only if Apple's result is Accepted.
xcrun stapler staple release/v1.0.1/NuPhyLab.app
xcrun stapler validate release/v1.0.1/NuPhyLab.app
codesign --verify --deep --strict --verbose=2 release/v1.0.1/NuPhyLab.app
ditto -c -k --keepParent release/v1.0.1/NuPhyLab.app release/v1.0.1/NuPhyLab-macOS-arm64.zip
```

Do not modify application contents after signing. Recreate the ZIP after stapling; never distribute the original notarization-upload ZIP as the final artifact.

## Verify the final archive

Extract the final ZIP into a fresh directory, validate its stapled ticket and strict code signature, check the bundled Node runtime and offline HID self-test, then run `syspolicy_check distribution` and inspect `spctl --assess --type execute --verbose=4` together with `spctl --status`. Compare the final ZIP SHA-256 to the digest returned by GitHub after upload.

The release machine's Gatekeeper assessments were already disabled. An `spctl` result with `override=security disabled` is **not** proof of acceptance under default security settings. Do not alter global system policy to make a check pass. A first-launch test of the actual downloaded archive on a separate Mac with default security settings enabled remains required before claiming that user experience has been verified.

The Developer ID team differs from the v1.0.0 development-signing team. Existing users may need to regrant optional Accessibility/Input Monitoring permissions. User data paths and the bundle identifier are preserved.

Apple references: [distribution signing](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/), [notarization issues](https://developer.apple.com/documentation/security/resolving-common-notarization-issues).
