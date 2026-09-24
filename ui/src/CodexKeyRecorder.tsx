import {useEffect,useRef,useState} from 'react';
import {CODEX_KEYS} from '../../shared/codex-keys.mjs';
import {Button,Modal} from './primitives';
import {nativeCodexKeys} from './codexKeys';
import {t} from './i18n';
import type {Command} from './types';

export function CodexKeyRecorder({title,onSave,onClose,command}:{title:string;onSave:(code:string)=>Promise<unknown>;onClose:()=>void;command:Command}) {
  const [message,setMessage]=useState('正在准备录入…'),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  const root=useRef<HTMLDivElement>(null), latest=useRef({onSave,onClose});
  latest.current={onSave,onClose};
  useEffect(()=>{
    let active=true, candidate:string|null=null, saving=false, capturing=false;
    const session=crypto.randomUUID();let heartbeat:ReturnType<typeof setInterval>;
    const begin=(async()=>{
      await nativeCodexKeys({kind:'capture',active:true,session});
      if(!active)return;
      await command({op:'codexCapture',session,active:true});
      if(active){
        heartbeat=setInterval(()=>{void command({op:'codexCapture',session,active:true}).catch(()=>{});},4000);
        capturing=true;setReady(true);setMessage('按下新按键，松开后保存。');root.current?.focus();
      }
    })();
    void begin.catch(()=>{if(active)setMessage('无法暂停快捷控制，请关闭后重试。');});
    const recordDown=(code:string,repeat=false,modified=false)=>{
      if(!active||!capturing||saving||repeat||candidate) return;
      if(modified||!CODEX_KEYS.some(key=>key.code===code)) {
        setMessage('请选择键盘上的单个普通按键；Fn 和修饰键不能单独绑定。');return;
      }
      candidate=code;
      setMessage(`已识别 ${t(CODEX_KEYS.find(key=>key.code===code)!.label)}，松开按键即可。`);
    };
    const down=(event:KeyboardEvent)=>{
      event.preventDefault();event.stopImmediatePropagation();
      recordDown(event.code,event.repeat,event.ctrlKey||event.altKey||event.shiftKey||event.metaKey);
    };
    const recordUp=(code:string)=>{
      if(!active||!candidate||candidate!==code||saving) return;
      saving=true;setBusy(true);
      void latest.current.onSave(candidate).then(()=>{if(active)latest.current.onClose();}).catch(()=>{
        saving=false;candidate=null;if(active){setBusy(false);setMessage('保存失败，请重试。');}
      });
    };
    const up=(event:KeyboardEvent)=>{event.preventDefault();event.stopImmediatePropagation();recordUp(event.code);};
    const nativeKey=(event:Event)=>{
      const {code,phase}=(event as CustomEvent<{code:string;phase:string}>).detail;
      if(phase==='down')recordDown(code);else if(phase==='up')recordUp(code);
    };
    const blur=()=>{if(!saving)latest.current.onClose();};
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',blur);
    window.addEventListener('nuphylab:function-key',nativeKey);
    return ()=>{
      clearInterval(heartbeat);window.removeEventListener('nuphylab:function-key',nativeKey);
      active=false;window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',blur);
      // Keep actions suspended until the temporary recorder mapping is released.
      void begin.catch(()=>{}).then(()=>command({op:'codexCapture',session,active:false})).catch(()=>{}).finally(()=>nativeCodexKeys({kind:'capture',active:false,session}).catch(()=>{}));
    };
  },[]);
  return <Modal title={title} onClose={()=>{if(!busy)onClose();}}>
    <div ref={root} tabIndex={-1} data-codex-recording className="codex-key-capture">
      <kbd>{t(busy?'保存中…':ready?'请按键…':'准备中…')}</kbd>
      <p role="status">{t(message)}</p>
      <p className="muted">{t('已占用的按键会自动交换。Esc、Tab 也可录入，取消请点击按钮。')}</p>
      <Button onClick={onClose} disabled={busy}>{t('取消')}</Button>
    </div>
  </Modal>;
}
