import { t as tr } from "./i18n";
import { ArrowUpRight, Check, CircleAlert, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button, run } from "./primitives";
import type { AppState, Command } from "./types";

export function FirmwareStatus({ state, command }: { state: AppState | null; command: Command }) {
  const [opening, setOpening] = useState(false);
  const fw = state?.firmware;
  if (!state?.device.connected || !fw) return null;
  const outdated = fw.status === "updateAvailable";
  const title = ({
    checking: "正在检查官方固件…", current: "已是最新正式固件", updateAvailable: "发现新固件",
    unavailable: "暂时无法检查最新固件", unknown: "无法确认当前固件版本",
    newer: "当前版本高于官方正式版", disconnected: "连接后自动检查固件",
  })[fw.status];
  const openUpdate = async () => {
    setOpening(true);
    try {
      await command({ op: "prepareFirmwareUpdate" });
      window.location.assign("https://drive.nuphy.io/?lang=zh-CN");
    } finally { setOpening(false); }
  };
  return (
    <section className={`firmware-status ${outdated ? "has-update" : ""}`} aria-label={tr("固件更新")}>
      <div className="firmware-copy">
        <h3>{tr(fw.status === "current" ? <Check size={16} /> : <CircleAlert size={16} />)}{tr(title)}</h3>
        <p aria-live="polite">{tr("当前")} {tr(fw.current || "未识别")}
          {tr(fw.latest && fw.latest !== fw.current && ` · ${tr(fw.stale ? "上次查询正式版" : "官方正式版")} ${fw.latest}`)}
        </p>
        {tr(!fw.compatible && <p>{tr("此固件未通过灯效协议检查。")}{tr(outdated ? "请先更新键盘固件。" : "请更新 NuPhyLab 后重新连接键盘。")}</p>)}
        {tr(outdated && <p>{tr("使用 Chrome 或 Edge 完成官方更新，完成后回到这里点击「连接键盘」。")}</p>)}
        {tr(fw.status === "unavailable" && <p>{tr("联网后可重试，离线时仍可使用已兼容的灯效。")}</p>)}
      </div>
      <div className="firmware-actions">
        <Button icon={<RefreshCw size={14} />} busy={fw.checking} disabled={opening}
          onClick={() => run(command({ op: "checkFirmware" }))}>{tr("检查更新")}</Button>
        {tr(outdated && <Button kind="primary"
          icon={<ArrowUpRight size={14} />} busy={opening} onClick={() => run(openUpdate())}>{tr("前往官方更新")}</Button>)}
      </div>
    </section>
  );
}
