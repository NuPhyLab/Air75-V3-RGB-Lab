import {useEffect,useRef} from 'react';
import type {AppState,Command,Notify} from './types';

type NativeWindow = Window & {webkit?:{messageHandlers?:{codexKeys?:{postMessage:(value:unknown)=>Promise<unknown>}}}};
export async function nativeCodexKeys(value:Record<string,unknown>) {
  const bridge=(window as NativeWindow).webkit?.messageHandlers?.codexKeys;
  if(!bridge) return false;
  await bridge.postMessage(value);
  return true;
}
const editable = () => document.activeElement?.matches('input,textarea,select,[contenteditable="true"]') ?? false;
export function useCodexKeys(state:AppState|null,command:Command,notify:Notify) {
  const lastEvent=useRef<number|null>(null);
  const latest=useRef({state,command});latest.current={state,command};
  useEffect(()=>{
    const event=(state?.codex.keys as {lastEvent?:{id:number;ok:boolean;error?:string}}|undefined)?.lastEvent;
    if(event && event.id!==lastEvent.current) {
      if(lastEvent.current!==null && !event.ok) notify(event.error || '操作失败');
      lastEvent.current=event.id;
    } else if(!event) lastEvent.current=0;
  },[state?.codex.keys,notify]);
  useEffect(()=>{
    const update=()=>{void nativeCodexKeys({kind:'editing',active:editable()}).catch(()=>{});};
    const changed=()=>queueMicrotask(update);
    document.addEventListener('focusin',changed);document.addEventListener('focusout',changed);
    update();
    return ()=>{document.removeEventListener('focusin',changed);document.removeEventListener('focusout',changed);};
  },[]);
  useEffect(()=>{
    // The native host owns global keys; the browser uses the same action path
    // only while this window has focus. Never dispatch both.
    if((window as NativeWindow).webkit?.messageHandlers?.codexKeys) return;
    const held=new Set<string>();
    let tail=Promise.resolve();
    const send=(code:string,phase:string)=>{tail=tail.then(()=>latest.current.command({op:'codexKey',code,phase})).then(()=>{},()=>{});};
    const down=(event:KeyboardEvent)=>{
      const {state}=latest.current;
      // The backend already resolved the active integration's bindings.
      const keys=state?.codex.keys as {enabled?:boolean;bindings?:{code:string}[]}|undefined;
      if(!keys?.enabled || editable() || document.querySelector('[data-codex-recording]')) return;
      if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey) return;
      if(!keys.bindings?.some(key=>key.code===event.code)) return;
      event.preventDefault();
      if(!held.has(event.code)){held.add(event.code);send(event.code,'down');}
    };
    const up=(event:KeyboardEvent)=>{if(held.delete(event.code)){event.preventDefault();send(event.code,'up');}};
    const release=()=>{for(const code of held)send(code,'up');held.clear();};
    window.addEventListener('keydown',down);
    window.addEventListener('keyup',up);window.addEventListener('blur',release);
    return ()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',release);release();};
  },[]);
}
