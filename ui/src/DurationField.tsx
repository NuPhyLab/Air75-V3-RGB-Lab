import { useEffect, useState, useId } from "react";
import { t } from "./i18n";

export function DurationField({label, value, onChange, allowOff = true, maximum = 86400000}: {
  label:string; value:number; onChange:(value:number)=>Promise<unknown>; allowOff?:boolean; maximum?:number;
}) {
  const fieldId = useId();
  const initialUnit = value && value % 3600000 === 0 ? 3600000 : value && value % 60000 === 0 ? 60000 : 1000;
  const [unit,setUnit] = useState(initialUnit), [amount,setAmount] = useState(String(value / initialUnit));
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  useEffect(()=>{setAmount(String(value / unit));},[value,unit]);
  const commit = async (explicit?:number) => {
    const next = explicit ?? Math.round(Number(amount)*unit);
    if ((explicit === undefined && !amount.trim()) || !Number.isFinite(next) || !Number.isInteger(next) || (next !== 0 && (next < 1000 || next > maximum)) || (!allowOff && next === 0)) {
      setError(t("请输入有效时间"));return;
    }
    if (next === value) {setAmount(String(value/unit));setError("");return;}
    setBusy(true);
    try { await onChange(next); setError(""); } catch { setAmount(String(value/unit)); }
    finally { setBusy(false); }
  };
  return <div className="duration-field">
    <label htmlFor={fieldId}>{t(label)}</label><div className="duration-inputs">
      <input id={fieldId} type="number" aria-label={t(label)} min={allowOff ? 0 : 1/unit*1000} max={maximum/unit} step="any"
        disabled={busy} value={amount} onChange={e=>setAmount(e.target.value)}
        onBlur={()=>void commit()} onKeyDown={e=>{if(e.key === "Enter") e.currentTarget.blur();}} />
      <select aria-label={t("时间单位")} value={unit} disabled={busy} onChange={e=>setUnit(Number(e.target.value))}>
        <option value={1000}>{t("秒")}</option><option value={60000}>{t("分钟")}</option>{maximum >= 3600000 && <option value={3600000}>{t("小时")}</option>}
      </select>
      {allowOff && <button type="button" className="button duration-off" aria-pressed={value === 0} disabled={busy} onClick={()=>void commit(0)}>{t("不限")}</button>}
    </div>
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}
