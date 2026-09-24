// Downloads the pinned, self-contained Node runtime that gets bundled into the
// .app. Package managers such as Homebrew ship a dynamically linked node that
// depends on files outside the bundle, which would not run on another Mac.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile, copyFile, chmod } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RUNTIME_VERSION = process.env.AIR_STUDIO_NODE_VERSION ?? "v24.21.0";
export const runtimePath = (arch = process.arch) => path.join(root, "vendor", `node-${arch}`, "node");

async function download(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`下载失败 ${response.status}：${url}`);
  return Buffer.from(await response.arrayBuffer());
}
export async function fetchRuntime({ version = RUNTIME_VERSION, arch = process.arch } = {}) {
  const platform = arch === "x64" ? "darwin-x64" : "darwin-arm64";
  const name = `node-${version}-${platform}`;
  const base = `https://nodejs.org/dist/${version}`;
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString("utf8");
  const expected = sums.split("\n").map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file === `${name}.tar.gz`)?.[0];
  if (!expected) throw new Error(`官方校验文件中没有 ${name}.tar.gz`);
  const archive = await download(`${base}/${name}.tar.gz`);
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expected) throw new Error("Node 运行时校验失败，已放弃使用下载的文件。");
  const work = await mkdtemp(path.join(tmpdir(), "nuphylab-node-"));
  try {
    const file = path.join(work, "node.tar.gz");
    await writeFile(file, archive);
    await exec("/usr/bin/tar", ["xzf", file, "-C", work, `${name}/bin/node`]);
    const target = runtimePath(arch);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(work, name, "bin", "node"), target);
    await chmod(target, 0o755);
    return { target, version, sha256: actual };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
/** Rejects a runtime that depends on files outside the bundle. */
export function selfContained(output) {
  return output.split("\n").slice(1).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean)
    .every((library) => library.startsWith("/usr/lib/") || library.startsWith("/System/"));
}
export async function verifyRuntime(binary) {
  const { stdout } = await exec("/usr/bin/otool", ["-L", binary]);
  if (!selfContained(stdout))
    throw new Error(
      `Node 运行时 ${binary} 依赖 .app 之外的动态库，打包后在其他 Mac 上无法启动。\n` +
        "请运行 npm run fetch-node 下载官方自包含运行时，或用 AIR_STUDIO_NODE 指定一个。",
    );
  return true;
}
export function isDirectRun(moduleURL, entry = process.argv[1]) {
  return Boolean(entry) && fileURLToPath(moduleURL) === path.resolve(entry);
}
if (isDirectRun(import.meta.url)) {
  const result = await fetchRuntime();
  await verifyRuntime(result.target);
  console.log(`Node ${result.version} 运行时已就绪：${result.target}`);
  console.log(`SHA-256：${result.sha256}`);
}
