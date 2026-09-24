import {useState} from "react";
import {Check,CircleAlert,Plug,RotateCcw,Trash2} from "lucide-react";
import {Button,Modal,run} from "./primitives";
import {t as tr} from "./i18n";
import type {AppState,Command} from "./types";

type Hooks={
  status?:string;installed?:boolean;reason?:string|null;settingsPath?:string;hookDir?:string;spoolDir?:string;
  events?:string[];missing?:string[];outdated?:string[];otherHooks?:number;scripts?:boolean;disabled?:boolean;
};
/** Install, repair and remove the local Claude Code hooks this application owns. */
export function ClaudeSetup({state,command}:{state:AppState|null;command:Command}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [confirmRemove,setConfirmRemove]=useState(false),[note,setNote]=useState("");
  const hooks=(state?.claude?.hooks ?? {}) as Hooks;
  const status=String(hooks.status ?? "unknown");
  const installed=hooks.installed===true;
  const title=installed?"已接入本机 Claude Code"
    :status==="needsRepair"?"接入需要修复"
    :status==="disabled"?"Claude Code 已停用全部钩子"
    :status==="error"?"无法读取 Claude Code 配置"
    :"尚未接入 Claude Code";
  const summary=installed?"新开的 Claude Code 会话会把状态发送到这把键盘。"
    :status==="needsRepair"?"配置与当前安装位置不一致，点击修复即可。"
    :status==="disabled"?"请在 Claude Code 设置中把 disableAllHooks 改回 false。"
    :status==="error"?tr(String(hooks.reason ?? ""))
    :"安装后，Claude Code 的任务状态才会显示在键盘上。";
  const act=async(op:string)=>{
    setBusy(true);setNote("");
    try{
      const result=await command({op}) as {result?:{status?:string}};
      setNote(op==="claudeHookRemove"?"已移除 NuPhyLab 添加的钩子，其他设置保持不变。"
        :"已写入配置。已经打开的会话会在下一次活动时开始上报，但不会补发之前的状态；需要立即看到状态请新开一个会话。");
      return result;
    } finally{setBusy(false);}
  };
  return <>
    <section className="codex-setup-banner" aria-label={tr("Claude Code 接入")}>
      {installed?<Check size={19}/>:<Plug size={19}/>}
      <div><strong>{tr(title)}</strong><p>{tr(summary)}</p></div>
      <Button busy={busy} kind={installed?"secondary":"primary"} onClick={()=>setOpen(true)}>{tr(installed?"查看接入":status==="needsRepair"?"修复接入":"安装接入")}</Button>
    </section>
    {open && <Modal title={tr("Claude Code 接入")} onClose={()=>{if(!busy){setOpen(false);setConfirmRemove(false);}}}>
      <div className="codex-setup-dialog">
        <p className="muted">{tr("NuPhyLab 会在本机 Claude Code 配置中添加自己的本地命令钩子，用来读取任务状态。安装前会备份原配置，只合并本应用需要的条目，其他钩子和设置保持不变。")}</p>
        <div className="codex-setup-row">
          {installed?<Check size={17}/>:<CircleAlert size={17}/>}
          <div><strong>{tr("钩子配置")}</strong><p>{tr(installed?"11 个生命周期事件已注册。":status==="needsRepair"?`缺少 ${hooks.missing?.length ?? 0} 项，${hooks.outdated?.length ?? 0} 项指向旧位置。`:"尚未写入 Claude Code 配置。")}</p></div>
          {!installed && <Button kind="primary" busy={busy} onClick={()=>run(act("claudeHookInstall"))}>{tr(status==="needsRepair"?"修复":"安装")}</Button>}
        </div>
        <div className="codex-setup-row">
          {hooks.scripts===false?<CircleAlert size={17}/>:<Check size={17}/>}
          <div><strong>{tr("钩子脚本")}</strong><p>{tr(hooks.scripts===false?"脚本文件缺失，请重新安装。":"已安装到 NuPhyLab 数据目录的固定路径，不依赖临时目录。")}</p></div>
        </div>
        <div className="codex-setup-row">
          <Check size={17}/>
          <div><strong>{tr("其他钩子")}</strong><p>{tr(`配置中另有 ${hooks.otherHooks ?? 0} 个非本应用的钩子，安装与移除都不会改动它们。`)}</p></div>
        </div>
        {note && <p className="codex-setup-note" role="status">{tr(note)}</p>}
        {hooks.disabled && <p className="codex-key-warning" role="alert">{tr("Claude Code 设置中的 disableAllHooks 为 true，钩子不会运行。")}</p>}
        <details className="product-details"><summary>{tr("接入说明")}</summary>
          <p>{tr("配置文件：")}<code className="codex-setup-path">{String(hooks.settingsPath ?? "")}</code></p>
          <p>{tr("钩子脚本：")}<code className="codex-setup-path">{String(hooks.hookDir ?? "")}</code></p>
          <p>{tr("状态文件：")}<code className="codex-setup-path">{String(hooks.spoolDir ?? "")}</code></p>
          <p>{tr("记录的事件：")}{(hooks.events ?? []).join(" · ")}</p>
          <p>{tr("只记录会话标识、项目路径、进程号、时间和状态；不记录提示词、工具输入、对话正文或账号凭据。")}</p>
          <p>{tr("钩子只在本机记录状态，不会调用模型，也不会改变 Claude Code 的权限判断。")}</p>
          <p>{tr("已经打开的会话会在下一次活动时开始上报，但不会补发之前的状态；需要立即看到状态请新开一个会话。")}</p>
        </details>
        <div className="codex-setup-actions">
          {installed && !confirmRemove && <Button kind="ghost" icon={<Trash2 size={14}/>} busy={busy} onClick={()=>setConfirmRemove(true)}>{tr("移除接入")}</Button>}
          {confirmRemove && <Button kind="danger" busy={busy} onClick={()=>run(act("claudeHookRemove").then(()=>setConfirmRemove(false)))}>{tr("确认移除")}</Button>}
          <Button kind={installed?"secondary":"primary"} icon={<RotateCcw size={14}/>} busy={busy}
            onClick={()=>run(act("claudeHookInstall"))}>{tr(installed?"重新安装":"安装接入")}</Button>
        </div>
      </div>
    </Modal>}
  </>;
}
