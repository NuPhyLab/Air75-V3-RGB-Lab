# v1.0.1 distribution validation / v1.0.1 分发验收

[Documentation / 文档目录](README.md)

Records the switch to company Developer ID signing, Hardened Runtime, secure timestamps, Apple notarization, staple and final-archive verification. It makes no new hardware-compatibility claim. The separate default-security Mac first-launch check remains outside the recorded acceptance.

记录公司签名、公证、票据和最终分发包检查；不增加真机兼容性承诺，另一台默认安全 Mac 首启未计入验收。

## Detailed record / 详细记录

# v1.0.1 distribution validation — 2026-09-26

- Valid Developer ID Application certificate: Shenzhen NuPhy Technology Co., Ltd., team `VBD322WS9K`, expires 2031-05-14.
- App, Node runtime and HID helper: company-signed, Hardened Runtime enabled, secure Apple timestamps present.
- Automated suite: 288 passed, 0 failed.
- Native offline self-test: 729 checks passed; no hardware or input monitor opened.
- Hardened Node v24.18.0: JIT workload and worker-thread smoke test passed.
- Apple notarization submission `45283569-5772-4855-b351-f6003ef49f85`: **Accepted**, “Ready for distribution”, no issues.
- Staple and staple validation: passed.
- Final ZIP recreated after stapling, then extracted into a fresh verification directory.
- Extracted final app: strict deep signature verification and stapled-ticket validation passed; bundled Node runtime and HID offline tests passed.
- `syspolicy_check distribution`: passed all pre-distribution checks, including Developer ID, notarization, XProtect and Gatekeeper scan; top-level and deep policy both matched `notarized`.
- `spctl`: `accepted`, `source=Notarized Developer ID`, **`override=security disabled`**.

The last result reflects this machine's pre-existing disabled Gatekeeper assessments and is not proof of first launch under default security settings. No system security policy was changed. A test of the actual download on a separate Mac with default security settings enabled remains outstanding. No new physical-keyboard test was performed for this packaging update.

The final release archive hashes are distributed in `SHA256SUMS.txt` and checked against GitHub's uploaded asset digests. Private keys and notarization credentials are not included in the source or release files.
