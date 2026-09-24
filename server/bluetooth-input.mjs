// Input availability is independent of the USB lighting connection. No BLE RGB
// commands or inferred factory-media remappings are issued by this adapter.
export class BluetoothInput {
  constructor(hardware,{now=Date.now}={}) {
    this.hardware=hardware;this.now=now;this.child=null;this.nextCheck=0;
    this.signature='';this.value={connected:false,status:'disconnected',count:0,error:null};
  }
  snapshot(){return {...this.value};}
  async refresh(force=false) {
    if(this.child!==this.hardware.child){this.child=this.hardware.child;this.nextCheck=0;}
    if(!force&&this.now()<this.nextCheck)return this.snapshot();
    this.nextCheck=this.now()+2000;
    try {
      const {devices}=await this.hardware.request('bluetoothDevices');
      this.child=this.hardware.child;
      if(!Array.isArray(devices)||devices.length>16||devices.some(d=>
        !d||d.model!=='Air75 V3'||d.transport!=='bluetooth'||typeof d.id!=='string'||!/^\d+$/.test(d.id)))
        throw new Error('蓝牙键盘识别结果无效。');
      const ids=[...new Set(devices.map(d=>d.id))].sort();
      this.signature=ids.join(',');
      this.value={connected:ids.length===1,status:ids.length===1?'connected':ids.length?'ambiguous':'disconnected',count:ids.length,error:null};
    } catch {
      this.signature='';
      this.value={connected:false,status:'unavailable',count:0,error:'暂时无法识别蓝牙键盘，请重新检查。'};
    }
    return this.snapshot();
  }
}
