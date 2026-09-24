import { useSyncExternalStore } from "react";
import { translate } from "../../shared/i18n.mjs";
export type Language = "zh-CN" | "en";
let currentLanguage:Language = document.documentElement.lang === "en" ? "en" : "zh-CN";
const listeners = new Set<()=>void>();
export function setLanguage(value:Language) {
  if (value === currentLanguage) return;
  currentLanguage = value;
  document.documentElement.lang = value;
  for (const notify of listeners) notify();
}
export function language() {return currentLanguage;}
export function useLanguage() {
  return useSyncExternalStore(notify=>{listeners.add(notify);return ()=>{listeners.delete(notify);};},language);
}
export function t<T>(value:T):T { return translate(currentLanguage,value); }
export function dateLocale() {return currentLanguage === "en" ? "en-US" : "zh-CN";}
