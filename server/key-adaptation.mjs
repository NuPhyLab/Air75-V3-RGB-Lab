// Read the actual base layer before translating media functions. The mappings
// are scoped macOS service properties. Factory F4 additionally uses a narrow,
// journaled onboard lease because its generated Command+Space has no unique usage.
import {FACTORY_MAC_ROW,extendedKeycapMappings} from '../shared/keycap-functions.mjs';
const keyboard = code => 0x700000000 + code;
const consumer = usage => 0xc00000000 + usage;
const sources = new Map([
  [105,keyboard(105)], [106,keyboard(106)],
  // Verified in Air75 V3 firmware and its actual USB descriptor. F4 is a
  // generated Command+Space chord and is handled by a separate narrow lease.
  [32262,consumer(0x29f)], [32264,consumer(0xcf)], [32278,0x10000009b],
  [172,consumer(0xb6)], [174,consumer(0xcd)], [171,consumer(0xb5)],
  [168,consumer(0xe2)], [170,consumer(0xea)], [169,consumer(0xe9)],
]);
export function planKeyAdaptation(keymap, bindings) {
  if (!keymap || !(keymap.protocol === 'air75-s4-keymap' && keymap.geometryVerified === true && keymap.readOnly === true || keymap.firmwareVersion === '1.0.16.6') || ![0,1].includes(keymap.mode) ||
      !Array.isArray(keymap.active) || keymap.active.length !== 98 ||
      keymap.active.some(n=>!Number.isInteger(n)||n<0||n>65535) ||
      !Array.isArray(keymap.defaults) || keymap.defaults.length!==2 ||
      keymap.defaults.some(layer=>!Array.isArray(layer)||layer.length!==98||layer.some(n=>!Number.isInteger(n)||n<0||n>65535)) ||
      !Number.isInteger(keymap.locationId)||keymap.locationId<=0)
    throw new Error('键位结构未通过检查，请更新 NuPhyLab 或在官方驱动中设置标准 F 键。');
  // Factory Windows F keys establish physical matrix positions independently
  // of the live Mac map and of RGB indices.
  const factory=keymap.defaults[1],mappings=[],ready=[],unsupported=[],shared=[];
  for(const code of bindings.filter(code=>/^F([1-9]|1[0-2])$/.test(code))) {
    const target=57+Number(code.slice(1)),position=factory.indexOf(target);
    if(position<0 || factory.lastIndexOf(target)!==position || position>=96)
      throw new Error('无法确认功能键的位置，未修改系统映射。');
    const source=keymap.active[position];
    if(source===target){ready.push(code);continue;}
    // The keyboard's extended F13–F24 layer can be active over USB as well
    // as Bluetooth. Resolve it by physical matrix position, not by key name.
    const usage=source===target+46 ? keyboard(source) : sources.get(source);
    // Do not change ordinary typing, macros, modifier chords or vendor keys.
    if(!usage || mappings.some(row=>row.HIDKeyboardModifierMappingSrc===usage)) {unsupported.push(code);continue;}
    mappings.push({HIDKeyboardModifierMappingSrc:usage,HIDKeyboardModifierMappingDst:keyboard(target)});
    ready.push(code);
    if(keymap.active.filter(value=>value===source).length>1) shared.push(code);
  }
  return {mappings,ready,unsupported,shared,locationId:keymap.locationId,mode:keymap.mode,
    signature:JSON.stringify([keymap.mode,keymap.locationId,keymap.active,bindings])};
}

// The observed extended Bluetooth layer reports physical F1/F2/F7 as
// keyboard usages 104/105/110 (F13/F14/F19). Translate only bound function
// keys; ordinary/custom bindings and the standard F layer remain untouched.
export function planBluetoothKeys(bindings,identity='') {
  const ready=bindings.filter(code=>/^F([1-9]|1[0-2])$/.test(code));
  const mappings=ready.map(code=>({HIDKeyboardModifierMappingSrc:keyboard(103+Number(code.slice(1))),
    HIDKeyboardModifierMappingDst:keyboard(57+Number(code.slice(1)))}));
  return {mappings,ready,unsupported:[],shared:[],transport:'bluetooth',
    signature:JSON.stringify(['bluetooth',identity,bindings])};
}

export function planKeycapFunctions(keymap) {
  const keys=Array.from({length:12},(_,i)=>`F${i+1}`);
  const base=planKeyAdaptation(keymap,keys);
  const positions=keys.map((_,i)=>keymap.defaults[1].indexOf(58+i));
  // Only repair the complete, known extended Mac layer. Never reinterpret
  // custom F keys, an ordinary F layer, Windows mode, or unknown firmware.
  const extended=keymap.mode===0 && positions.every((p,i)=>keymap.active[p]===104+i);
  if(extended && !positions.every((p,i)=>keymap.defaults[0][p]===FACTORY_MAC_ROW[i]))
    throw new Error('原厂功能配置尚未确认，未改变键位。');
  return {...base,mappings:extended?extendedKeycapMappings():[],ready:[],unsupported:[],shared:[],
    profile:'keycaps',signature:JSON.stringify(['keycaps',base.signature]),keycapsMapped:extended};
}

export class KeyAdaptation {
  constructor(hardware,{now=Date.now}={}) {
    this.hardware=hardware;this.now=now;this.nextCheck=0;this.signature=null;
    this.child=null;this.owned=false;this.boardOwned=false;this.recovered=false;
    this.value={status:'off',ready:[],unsupported:[],shared:[],error:null};
  }
  snapshot(){return {...this.value};}
  async release(status='off',restoreBoard=true) {
    const errors=[];
    if(this.hardware.child && this.owned) {
      try {await this.hardware.request('restoreKeys');this.recovered=true;this.owned=false;}
      catch(error){errors.push(error.message);}
    }
    if(restoreBoard && this.hardware.child && this.boardOwned) {
      try {await this.hardware.request('restoreFunctionKey');this.boardOwned=false;}
      catch(error){errors.push(error.message);}
    }
    this.signature=null;
    if(errors.length)throw new Error(errors.join(' '));
    this.value={...this.value,status,error:null};
  }
  async sync({enabled,active,connected,bindings,bluetooth=false,bluetoothIdentity='',keycapFallback=false},force=false) {
    if(this.child!==this.hardware.child) {this.child=this.hardware.child;this.recovered=false;this.signature=null;this.owned=false;this.boardOwned=false;this.nextCheck=0;}
    const transport=connected?'usb':bluetooth?'bluetooth:'+bluetoothIdentity:'none';
    if(transport!==this.transport){this.transport=transport;this.nextCheck=0;}
    const keycaps=keycapFallback&&!active;
    const requested=JSON.stringify([bindings,keycaps]);
    if(requested!==this.requested){this.requested=requested;this.nextCheck=0;}
    try {
      if(!enabled || (!connected&&!bluetooth) || (!active&&!keycaps)) {
        await this.release(!enabled?'off':(!connected&&!bluetooth)?'waitingDevice':'paused');
        this.nextCheck=0;return this.snapshot();
      }
      if(!force && this.now()<this.nextCheck) return this.snapshot();
      this.nextCheck=this.now()+4000;
      if(!this.recovered) {
        await this.hardware.request('restoreKeys');this.recovered=true;
      }
      const wireless=bluetooth&&!connected;
      const permissions=await this.hardware.request('permissions');
      this.hardware.state.permissions=permissions;
      let map=wireless ? null : await this.hardware.request('readKeymap');
      const f4=map?.defaults?.[1]?.indexOf(61);
      const leaseNeeded=!wireless&&!keycaps&&bindings.includes('F4')&&map?.mode===0&&f4>=0&&
        (map.active?.[f4]===32263 || map.functionKeyLease===true);
      if(!leaseNeeded && this.boardOwned) {
        await this.hardware.request('restoreFunctionKey');this.boardOwned=false;
        if(!wireless)map=await this.hardware.request('readKeymap');
      }
      if(leaseNeeded) {
        if(permissions.inputMonitoring!==true || permissions.accessibility!==true || permissions.canPostEvents!==true) {
          await this.release('permissions');return this.snapshot();
        }
        // Keep recovery armed before issuing a mutation whose reply may be lost.
        this.boardOwned=true;
        const result=await this.hardware.request('prepareFunctionKey');
        if(result.verified!==true)throw new Error('F4 配置未通过回读检查，原键位备份已保留。');
        this.boardOwned=result.leased===true;
        map=await this.hardware.request('readKeymap');
      }
      const plan=wireless ? (keycaps ? {mappings:extendedKeycapMappings(),ready:[],unsupported:[],shared:[],profile:'keycaps',keycapsMapped:true,signature:JSON.stringify(['keycaps-bluetooth',bluetoothIdentity])} : planBluetoothKeys(bindings,bluetoothIdentity))
        : (keycaps ? planKeycapFunctions(map) : planKeyAdaptation(map,bindings));
      const target={...(wireless?{transport:'bluetooth'}:{locationId:plan.locationId}),...(keycaps?{profile:'keycaps'}:{})};
      // Only an actual remapping needs the system permissions. A keyboard whose
      // F row already sends standard F keys has nothing to write, so it must not
      // be held at "waiting for authorization" for a write that never happens.
      if(plan.mappings.length && (permissions.inputMonitoring!==true || (!wireless&&(permissions.accessibility!==true || permissions.canPostEvents!==true)))) {
        await this.release('permissions');
        this.value={status:'permissions',ready:plan.ready,unsupported:plan.unsupported,shared:plan.shared,error:null};return this.snapshot();
      }
      if(force || this.signature!==plan.signature) {
        // Restore the previous plan before applying changes or replugging.
        await this.release('off',false);
        if(plan.mappings.length) {
          // A missing/uncertain reply may follow a successful OS write. Keep
          // restoration armed before issuing the request, not after its ack.
          this.owned=true;
          const result=await this.hardware.request('adaptKeys',{...target,mappings:plan.mappings});
          if(result.verified!==true) throw new Error('系统未确认按键适配，请重试。');
        }
        this.signature=plan.signature;
      } else if(plan.mappings.length) {
        const check=await this.hardware.request('keyMappingStatus',{...target,mappings:plan.mappings});
        if(check.verified!==true) throw new Error('按键映射已被其他设置改变，请重新检查适配。');
      }
      this.value={status:keycaps?'keycaps':plan.unsupported.length?'partial':'ready',ready:plan.ready,
        unsupported:plan.unsupported,shared:plan.shared,error:null,mode:plan.mode,
        mapped:plan.mappings.length+(this.boardOwned?1:0),boardAdapted:this.boardOwned?['F4']:[],keycapsMapped:plan.keycapsMapped===true,transport:wireless?'bluetooth':'usb',checkedAt:this.now()};
    } catch(error) {
      let message=error.message;
      try {await this.release();} catch(restoreError) {message+=' '+restoreError.message;}
      this.value={...this.value,status:'error',error:message};
    }
    return this.snapshot();
  }
}
