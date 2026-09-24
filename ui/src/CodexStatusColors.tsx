import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { CUSTOM_STATUS_IDS, STATUS_COLORS, STATUS_NAMES, statusColor } from "../../shared/codex-lighting.mjs";
import { ColorWheel } from "./ColorWheel";
import type { HSV } from "../../shared/color.mjs";
import { Button, Modal, run } from "./primitives";
import { t as tr } from "./i18n";
import type { Command } from "./types";

export function CodexStatusColors({settings,command,focusOnMount}:{settings:Record<string,unknown>;command:Command;focusOnMount?:boolean}) {
  const section=useRef<HTMLElement>(null);
  useEffect(()=>{if(focusOnMount){section.current?.scrollIntoView({block:"center"});section.current?.focus({preventScroll:true});}},[focusOnMount]);
  const [editing,setEditing]=useState<string|null>(null);
  const [color,setColor]=useState("#FFFFFF"),[hex,setHex]=useState("#FFFFFF");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const memory=useRef<HSV|null>(null);
  const change=(value:string)=>{setColor(value);setHex(value);setError("");};
  const parse=()=>{const value=hex.startsWith("#")?hex:`#${hex}`;if(!/^#[0-9a-f]{6}$/i.test(value)){setError(tr("请输入有效颜色"));return null;}change(value.toUpperCase());return value.toUpperCase();};
  const apply=async()=>{
    const value=parse();if(!value||!editing)return;
    setBusy(true);
    try{await command({op:"settings",settings:{codexStatusColors:{[editing]:value}}});setEditing(null);}
    finally{setBusy(false);}
  };
  const reset=async()=>{setBusy(true);try{await command({op:"settings",settings:{codexStatusColors:Object.fromEntries(CUSTOM_STATUS_IDS.map(id=>[id,STATUS_COLORS[id]]))}});}finally{setBusy(false);}};
  return <section className="codex-palette" ref={section} tabIndex={-1} aria-label={tr("状态颜色")}>
    <div className="section-heading compact"><h3>{tr("状态颜色")}</h3><Button kind="ghost" icon={<RotateCcw size={14}/>} disabled={busy} onClick={()=>run(reset())}>{tr("恢复默认颜色")}</Button></div>
    <div className="codex-palette-grid">{CUSTOM_STATUS_IDS.map(id=><button className="status-color-button" key={id}
      aria-label={tr(`修改${STATUS_NAMES[id]}颜色`)} onClick={()=>{memory.current=null;change(statusColor({status:id},settings));setEditing(id);}}>
      <span className="status-color-swatch" style={{backgroundColor:statusColor({status:id},settings)}} aria-hidden="true"/>
      <span>{tr(STATUS_NAMES[id])}</span>
    </button>)}</div>
    {editing && <Modal title={tr(`修改${STATUS_NAMES[editing]}颜色`)} onClose={()=>{if(!busy)setEditing(null);}}>
      <div className="status-color-editor">
        <ColorWheel key={editing} color={color} onChange={change} memory={memory} entry={<div className="color-entry">
          <span className="color-preview" style={{background:color}} aria-hidden="true"/>
          <input aria-label={tr("状态颜色值")} value={hex} maxLength={7} onChange={e=>setHex(e.target.value)} onBlur={parse} onKeyDown={e=>{if(e.key==="Enter")run(apply());}}/>
        </div>}/>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions"><Button disabled={busy} onClick={()=>setEditing(null)}>{tr("取消")}</Button><Button kind="primary" busy={busy} onClick={()=>run(apply())}>{tr("应用颜色")}</Button></div>
      </div>
    </Modal>}
  </section>;
}
