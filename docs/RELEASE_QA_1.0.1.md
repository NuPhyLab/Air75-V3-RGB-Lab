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
