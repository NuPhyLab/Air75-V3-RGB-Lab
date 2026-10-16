import { cp, mkdir, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {signingIdentity,signApp,BUNDLE_ID,requireDistributionIdentity} from './signing.mjs';
import {runtimePath,verifyRuntime} from './fetch-node.mjs';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.resolve(
    process.argv[2] ?? path.join(root, "release/NuPhyLab.app"),
  ),
  contents = path.join(app, "Contents"),
  resources = path.join(contents, "Resources");
// Resolve signing before touching a previous package. Never modify an app whose
// processes are running: macOS may retain the old executable signature in memory.
const identity = signingIdentity();
if (process.env.AIR_STUDIO_DISTRIBUTION === '1' || identity.name.startsWith('Developer ID Application: '))
  requireDistributionIdentity(identity, execFileSync('/usr/bin/security',['find-identity','-v','-p','codesigning'],{encoding:'utf8'}));
const {version} = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid app version.');
// The bundled runtime must not depend on anything outside the .app. A package
// manager's node links against its own libraries and would fail on another Mac.
const runtime = await (async () => {
  for (const candidate of [process.env.AIR_STUDIO_NODE, runtimePath(), process.execPath]) {
    if (!candidate) continue;
    try { await access(candidate, constants.X_OK); } catch { continue; }
    await verifyRuntime(candidate);
    return candidate;
  }
  throw new Error('找不到可用的 Node 运行时。请运行 npm run fetch-node。');
})();
const running = execFileSync('/bin/ps',['-axo','comm='],{encoding:'utf8'}).split('\n');
if(running.some(command=>command.trim().startsWith(app+'/Contents/')))
  throw new Error('此应用仍在运行。请先退出，或打包到另一个临时目录后整体替换。');
await rm(app, { recursive: true, force: true });
await mkdir(path.join(contents, "MacOS"), { recursive: true });
await mkdir(path.join(resources, "runtime"), { recursive: true });
// "hooks" carries the Claude Code hook scripts the app installs on request.
for (const name of ["server", "shared", "docs", "hooks"])
  await cp(path.join(root, name), path.join(resources, name), {
    recursive: true,
  });
await cp(path.join(root, "ui/dist"), path.join(resources, "ui/dist"), {
  recursive: true,
});
await cp(
  path.join(root, "bin/HIDBridge"),
  path.join(resources, "bin/HIDBridge"),
  { recursive: true },
);
await cp(
  path.join(root, "bin/AirStudio"),
  path.join(contents, "MacOS/AirStudio"),
);
await cp(runtime, path.join(resources, "runtime/node"));
await cp(
  path.join(root, "assets/LICENSE.node"),
  path.join(resources, "runtime/LICENSE.node"),
);
await cp(
  path.join(root, "assets/LICENSE.nuphy-leds"),
  path.join(resources, "LICENSE.nuphy-leds"),
);
for (const file of ["README.md", "README.zh-CN.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  try {
    await cp(path.join(root, file), path.join(resources, file));
  } catch {}
}
try {
  await cp(
    path.join(root, "assets/AppIcon.icns"),
    path.join(resources, "AppIcon.icns"),
  );
} catch {}
await writeFile(
  path.join(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>AirStudio</string><key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
<key>CFBundleName</key><string>NuPhyLab</string><key>CFBundleDisplayName</key><string>NuPhyLab</string>
<key>CFBundleVersion</key><string>${version}</string><key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>13.5</string><key>NSHighResolutionCapable</key><true/>
<key>NSMicrophoneUsageDescription</key><string>将麦克风声音转换为键盘律动灯效。声音仅在本机分析，不保存或上传。</string>
<key>NSAudioCaptureUsageDescription</key><string>将电脑播放的声音转换为键盘律动灯效。声音仅在本机分析，不保存或上传。</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSInputMonitoringUsageDescription</key><string>仅在启用按键触发或全局快捷键后监听所选按键，保留正常输入。</string>
</dict></plist>`,
);
// Record how this bundle was signed. An ad-hoc signature has no stable code
// identity, so macOS silently stops honouring an existing permission grant
// after a rebuild; the app has to be able to say that out loud.
await writeFile(
  path.join(resources, "signing.json"),
  JSON.stringify({ version, platform: process.platform, arch: process.arch, adhoc: identity.adhoc === true, apple: identity.apple === true, identity: identity.name, packagedAt: new Date().toISOString() }, null, 2),
);
signApp(app,identity);
console.log("Packaged: " + app);
console.log("Runtime: " + runtime);
console.log("Signing: " + identity.name);
console.log("Bundle id: " + BUNDLE_ID);
if (!identity.adhoc && !identity.apple)
  console.log(
    "提醒：使用自签名证书。代码标识在重新打包后保持不变，已授予的输入监控／辅助功能权限继续有效；" +
      "但该证书不是 Apple 签发，未经公证，其他 Mac 打开时仍会出现 Gatekeeper 提示。",
  );
if (identity.adhoc)
  console.log(
    "提醒：本机没有 Apple 代码签名证书，本次使用 ad-hoc 临时签名。" +
      "每次重新打包都会改变代码标识，需要重新授予输入监控与辅助功能权限；" +
      "该包未经 Developer ID 签名或 Apple 公证，其他 Mac 打开时会出现 Gatekeeper 提示。",
  );
