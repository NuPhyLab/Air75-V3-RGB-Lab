import AppKit
import AVFoundation
import CoreAudio
import Accelerate

// Raw PCM stays inside this process. Only aggregate levels leave the analyser.
final class AudioFeatureAnalyzer {
    static let size = 2048
    private var samples = [Float]()
    private var lastEmit = -Double.infinity
    private let fft = vDSP_DFT_zop_CreateSetup(nil, UInt(AudioFeatureAnalyzer.size), .FORWARD)!
    private var window = [Float](repeating: 0, count: size)
    init() { vDSP_hann_window(&window, vDSP_Length(Self.size), Int32(vDSP_HANN_NORM)); samples.reserveCapacity(Self.size * 2) }
    deinit { vDSP_DFT_DestroySetup(fft) }
    func consume(_ input: [Float], rate: Double, now: Double = ProcessInfo.processInfo.systemUptime) -> [String:Any]? {
        guard rate > 0, !input.isEmpty else { return nil }
        samples.append(contentsOf: input.map { $0.isFinite ? max(-1,min(1,$0)) : 0 })
        if samples.count > Self.size { samples.removeFirst(samples.count - Self.size) }
        guard samples.count == Self.size, now-lastEmit >= 0.045 else { return nil }
        lastEmit = now
        var rms: Float = 0
        vDSP_rmsqv(samples, 1, &rms, vDSP_Length(Self.size))
        var real = [Float](repeating:0,count:Self.size), outReal = real, outImag = real
        vDSP_vmul(samples,1,window,1,&real,1,vDSP_Length(Self.size))
        let imag = [Float](repeating:0,count:Self.size)
        vDSP_DFT_Execute(fft,real,imag,&outReal,&outImag)
        let edges: [Double] = [40,80,160,320,640,1280,2560,5120,12000]
        let bands = (0..<8).map { band -> Double in
            let lo = max(1,Int(ceil(edges[band] * Double(Self.size) / rate)))
            let hi = min(Self.size/2, max(lo+1,Int(ceil(edges[band+1] * Double(Self.size) / rate))))
            guard lo < hi else { return 0 }
            var power: Double = 0
            for i in lo..<hi { power += Double(outReal[i]*outReal[i]+outImag[i]*outImag[i]) }
            return min(1,sqrt(power) * 2 / Double(Self.size))
        }
        return ["rms":Double(rms),"bands":bands]
    }
}

final class AudioCapture {
    var report: (([String:Any])->Void)?
    private var session = ""
    private var desiredSignature = ""
    private var engine: AVAudioEngine?
    private var inputTapInstalled = false
    private var analyzer: AudioFeatureAnalyzer?
    private var tap: AudioObjectID = 0
    private var aggregate: AudioObjectID = 0
    private var ioProc: AudioDeviceIOProcID?
    private var generation = 0
    private var lastInventory = Date.distantPast
    private var lastDesired = Date.distantPast
    private var lastStatus = Date.distantPast
    private var captureStatus = "idle"
    private var watchdog: Timer?
    private let captureQueue = DispatchQueue(label:"NuPhyLab.Audio",qos:.userInteractive)
    private var inputs: [(id: AudioObjectID, uid: String, name: String)] = []

    init() {
        watchdog = Timer.scheduledTimer(withTimeInterval:1,repeats:true) { [weak self] _ in
            guard let self=self, !self.session.isEmpty, Date().timeIntervalSince(self.lastDesired)>5 else{return}
            self.stop()
        }
    }
    private func checked(_ status: OSStatus, _ operation: String) throws {
        if status != noErr {throw NSError(domain:"NuPhyLab.Audio",code:Int(status),userInfo:[NSLocalizedDescriptionKey:operation])}
    }
    private func objectString(_ id:AudioObjectID,_ selector:AudioObjectPropertySelector)->String {
        var address=AudioObjectPropertyAddress(mSelector:selector,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain)
        var value:Unmanaged<CFString>?;var size=UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id,&address,0,nil,&size,&value)==noErr else{return ""}
        return value?.takeUnretainedValue() as String? ?? ""
    }
    private func defaultInput()->AudioObjectID {
        var address=AudioObjectPropertyAddress(mSelector:kAudioHardwarePropertyDefaultInputDevice,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain)
        var value=AudioObjectID(0);var size=UInt32(MemoryLayout<AudioObjectID>.size)
        _=AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),&address,0,nil,&size,&value)
        return value
    }
    func inventory(force:Bool=false) {
        guard force || Date().timeIntervalSince(lastInventory)>4 else{return};lastInventory=Date()
        var address=AudioObjectPropertyAddress(mSelector:kAudioHardwarePropertyDevices,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain)
        var size:UInt32=0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject),&address,0,nil,&size)==noErr else{return}
        var ids=[AudioObjectID](repeating:0,count:Int(size)/MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),&address,0,nil,&size,&ids)==noErr else{return}
        inputs=ids.compactMap { id in
            guard id != aggregate else{return nil}
            var addr=AudioObjectPropertyAddress(mSelector:kAudioDevicePropertyStreamConfiguration,mScope:kAudioDevicePropertyScopeInput,mElement:kAudioObjectPropertyElementMain)
            var bytes:UInt32=0
            guard AudioObjectGetPropertyDataSize(id,&addr,0,nil,&bytes)==noErr,bytes>0 else{return nil}
            let raw=UnsafeMutableRawPointer.allocate(byteCount:Int(bytes),alignment:MemoryLayout<AudioBufferList>.alignment);defer{raw.deallocate()}
            guard AudioObjectGetPropertyData(id,&addr,0,nil,&bytes,raw)==noErr else{return nil}
            let buffers=UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to:AudioBufferList.self))
            guard buffers.reduce(0,{$0+Int($1.mNumberChannels)})>0 else{return nil}
            let uid=objectString(id,kAudioDevicePropertyDeviceUID)
            guard !uid.isEmpty else{return nil}
            return (id,uid,objectString(id,kAudioObjectPropertyName))
        }
        let supported:Bool
        if #available(macOS 14.2, *) {supported=true}else{supported=false}
        report?(["op":"audioInventory","systemSupported":supported,"devices":inputs.map{["id":$0.uid,"name":$0.name]},"microphonePermission":AVCaptureDevice.authorizationStatus(for:.audio) == .authorized])
    }
    func sync(_ desired:[String:Any]?) {
        lastDesired=Date();inventory()
        guard let desired=desired,desired["enabled"] as? Bool==true,let id=desired["session"] as? String,
              let source=desired["source"] as? String,["system","microphone"].contains(source) else {
            if !session.isEmpty {stop()};return
        }
        let uid=desired["deviceId"] as? String ?? ""
        let device=uid.isEmpty ? defaultInput() : inputs.first(where:{$0.uid==uid})?.id ?? 0
        let signature="\(id)|\(source)|\(uid)|\(source == "microphone" ? device : 0)"
        guard signature != desiredSignature else {
            // A process tap can have no callbacks while every app is silent.
            if captureStatus == "listening",Date().timeIntervalSince(lastStatus)>1 {reportStatus("listening")}
            return
        }
        stop();session=id;desiredSignature=signature
        let token=generation
        if source == "microphone" {
            let authorized=AVCaptureDevice.authorizationStatus(for:.audio)
            if authorized == .notDetermined {
                reportStatus("requesting")
                AVCaptureDevice.requestAccess(for:.audio){[weak self] granted in DispatchQueue.main.async {
                    guard let self=self,self.generation==token else{return}
                    if granted {self.startMicrophone(device,token:token)}else{self.fail("microphonePermission")}
                }}
            } else if authorized == .authorized {startMicrophone(device,token:token)}
            else {fail("microphonePermission")}
        } else {
            if #available(macOS 14.2, *) {startSystem(token:token)}else{fail("systemUnsupported")}
        }
    }
    private func reportStatus(_ status:String,error:String?=nil) {
        captureStatus=status;lastStatus=Date()
        var packet:[String:Any]=["op":"audioPacket","session":session,"status":status]
        if let error=error {packet["error"]=error};report?(packet)
    }
    private func publish(_ feature:[String:Any],token:Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self=self,self.generation==token,!self.session.isEmpty else{return}
            self.lastStatus=Date()
            var packet=feature;packet["op"]="audioPacket";packet["session"]=self.session;packet["status"]="listening"
            self.report?(packet)
        }
    }
    private func fail(_ code:String) {
        generation+=1
        reportStatus("error",error:code)
        releaseResources()
    }
    private func startMicrophone(_ device:AudioObjectID,token:Int) {
        guard device != 0 else{fail("inputUnavailable");return}
        let engine=AVAudioEngine();self.engine=engine
        let input=engine.inputNode
        do {
            guard let unit=input.audioUnit else{fail("inputUnavailable");return}
            var device=device
            try checked(AudioUnitSetProperty(unit,kAudioOutputUnitProperty_CurrentDevice,kAudioUnitScope_Global,0,&device,UInt32(MemoryLayout<AudioObjectID>.size)),"inputUnavailable")
            let format=input.outputFormat(forBus:0)
            guard format.sampleRate>0,format.channelCount>0 else{fail("inputUnavailable");return}
            let analyzer=AudioFeatureAnalyzer();self.analyzer=analyzer
            input.installTap(onBus:0,bufferSize:2048,format:format){[weak self] buffer,_ in
                guard let channels=buffer.floatChannelData else{return}
                let n=Int(buffer.frameLength);var mono=[Float](repeating:0,count:n)
                for frame in 0..<n {for channel in 0..<Int(buffer.format.channelCount){mono[frame]+=channels[channel][frame]/Float(buffer.format.channelCount)}}
                if let feature=analyzer.consume(mono,rate:format.sampleRate){self?.publish(feature,token:token)}
            }
            inputTapInstalled=true
            engine.prepare();try engine.start();reportStatus("listening")
        } catch {fail("inputUnavailable")}
    }
    @available(macOS 14.2, *)
    private func startSystem(token:Int) {
        reportStatus("requesting")
        do {
            let description=CATapDescription(stereoGlobalTapButExcludeProcesses:[])
            description.name="NuPhyLab Sound Reactive";description.uuid=UUID();description.isPrivate=true;description.muteBehavior = .unmuted
            try checked(AudioHardwareCreateProcessTap(description,&tap),"systemCapture")
            var address=AudioObjectPropertyAddress(mSelector:kAudioTapPropertyFormat,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain)
            var format=AudioStreamBasicDescription();var size=UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            try checked(AudioObjectGetPropertyData(tap,&address,0,nil,&size,&format),"systemCapture")
            guard format.mFormatID==kAudioFormatLinearPCM,format.mFormatFlags & kAudioFormatFlagIsFloat != 0,format.mBitsPerChannel==32,format.mSampleRate>0 else{fail("systemFormat");return}
            let specification:[String:Any]=[
                kAudioAggregateDeviceNameKey:"NuPhyLab Audio Analysis",
                kAudioAggregateDeviceUIDKey:UUID().uuidString,
                kAudioAggregateDeviceIsPrivateKey:true,
                kAudioAggregateDeviceTapAutoStartKey:true,
                kAudioAggregateDeviceTapListKey:[[kAudioSubTapUIDKey:description.uuid.uuidString,kAudioSubTapDriftCompensationKey:true]]
            ]
            try checked(AudioHardwareCreateAggregateDevice(specification as CFDictionary,&aggregate),"systemCapture")
            let analyzer=AudioFeatureAnalyzer();self.analyzer=analyzer
            let sampleRate=format.mSampleRate
            try checked(AudioDeviceCreateIOProcIDWithBlock(&ioProc,aggregate,captureQueue){[weak self] _,data,_,_,_ in
                let buffers=UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating:data))
                guard let first=buffers.first,first.mNumberChannels>0 else{return}
                let count=Int(first.mDataByteSize)/MemoryLayout<Float>.size/Int(first.mNumberChannels)
                let total=buffers.reduce(0,{$0+Int($1.mNumberChannels)})
                guard count>0,total>0 else{return}
                var mono=[Float](repeating:0,count:count)
                for buffer in buffers {
                    guard let bytes=buffer.mData else{continue}
                    let channels=Int(buffer.mNumberChannels),ptr=bytes.assumingMemoryBound(to:Float.self)
                    let frames=min(count,Int(buffer.mDataByteSize)/4/max(1,channels))
                    for frame in 0..<frames {for channel in 0..<channels {mono[frame]+=ptr[frame*channels+channel]/Float(total)}}
                }
                if let feature=analyzer.consume(mono,rate:sampleRate){self?.publish(feature,token:token)}
            },"systemCapture")
            try checked(AudioDeviceStart(aggregate,ioProc),"systemPermission")
            reportStatus("listening")
        } catch {fail((error as NSError).localizedDescription)}
    }
    private func releaseResources() {
        if let engine=engine {engine.stop();if inputTapInstalled {engine.inputNode.removeTap(onBus:0)}};engine=nil;inputTapInstalled=false
        if aggregate != 0 {
            if let proc=ioProc {_=AudioDeviceStop(aggregate,proc);_=AudioDeviceDestroyIOProcID(aggregate,proc)}
            _=AudioHardwareDestroyAggregateDevice(aggregate)
        }
        ioProc=nil;aggregate=0
        if #available(macOS 14.2, *),tap != 0 {_=AudioHardwareDestroyProcessTap(tap)}
        tap=0;analyzer=nil
    }
    func stop() {generation+=1;releaseResources();session="";desiredSignature="";captureStatus="idle"}
}
