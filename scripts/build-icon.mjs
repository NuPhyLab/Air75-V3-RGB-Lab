import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "nuphy-studio-icon-"));
try {
  const iconset = path.join(temporary, "AppIcon.iconset");
  execFileSync("/usr/bin/swift", [path.join(root, "scripts/icon.swift"),
    path.join(root, "logo/头像.png"), iconset], { stdio: "inherit" });
  await mkdir(path.join(root, "assets"), { recursive: true });
  await mkdir(path.join(root, "ui/public"), { recursive: true });
  execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", path.join(root, "assets/AppIcon.icns")]);
  await cp(path.join(iconset, "icon_128x128@2x.png"), path.join(root, "ui/public/nuphy-studio.png"));
  console.log("NuPhyLab application and UI icons generated from the supplied logo.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
