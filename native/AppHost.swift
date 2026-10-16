import AppKit
import WebKit
import Carbon
import Darwin

let functionKeyCodes: [UInt32:String] = [122:"F1",120:"F2",99:"F3",118:"F4",96:"F5",97:"F6",98:"F7",100:"F8",101:"F9",109:"F10",103:"F11",111:"F12"]

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandlerWithReply {
    let audioCapture = AudioCapture()
    var pendingAudio: [String:Any]?
    var audioSending = false
    var window: NSWindow!
    var web: WKWebView!
    var worker: Process?
    var statusItem: NSStatusItem!
    var baseURL: URL?
    var apiToken = ""
    var hotKeys: [EventHotKeyRef?] = []
    var hotkeyHandler: EventHandlerRef?
    var hotkeysEnabled = false
    var hotkeyPollTimer: Timer?
    var hotkeyStateTask: URLSessionDataTask?
    var hotkeyPollGeneration = 0
    var keyConfiguration: [(code:String,keyCode:UInt32)] = []
    var configuredKeysEnabled = false
    var capturingKey = false
    var captureSession: String?
    var capturedFunctionKeys = Set<String>()
    var editingField = false
    var heldHotkeys = Set<UInt32>()
    var keyEventQueue = [[String:Any]]()
    var keyEventSending = false
    var registeredCodes: [String] = []
    var failedCodes: [String] = []
    var carbonRegisteredCodes: [String] = []
    var nextCaptureRetry = Date.distantPast
    var captureAttemptOverride: (() -> Bool)? // In-process tests only; never configured by IPC.
    var lastKeyReport = Date.distantPast
    var lastKeyReportSignature = ""
    var keyRevision = -1
    var setupRevision = 0
    var localKeyMonitor: Any?
    var reservedKeyTap: CFMachPort?
    var reservedKeySource: CFRunLoopSource?
    let workerLogQueue = DispatchQueue(label: "AirStudio.WorkerLog")
    var terminating = false
    let windowFrameName = "AirStudio.CompactWindow.v1"
    let dataDirectory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Air Studio")
    var workerLogURL: URL { dataDirectory.appendingPathComponent("Logs/worker.log") }
    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem=NSStatusBar.system.statusItem(withLength:NSStatusItem.squareLength)
        statusItem.button?.image=NSImage(systemSymbolName:"keyboard",accessibilityDescription:"NuPhyLab")
        if let data=try? Data(contentsOf:dataDirectory.appendingPathComponent("library.json")),
           let library=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],
           let settings=library["settings"] as? [String:Any] { english=settings["language"] as? String == "en" }
        audioCapture.report = { [weak self] packet in self?.sendAudio(packet) }
        buildMenus()
        window=NSWindow(contentRect:NSRect(origin:.zero,size:defaultWindowSize()),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="NuPhyLab";window.contentMinSize=NSSize(width:720,height:520);window.delegate=self;window.isReleasedWhenClosed=false
        if !window.setFrameUsingName(windowFrameName) {window.center()}
        window.setFrameAutosaveName(windowFrameName)
        let config=WKWebViewConfiguration();config.preferences.javaScriptCanOpenWindowsAutomatically=false
        config.userContentController.addScriptMessageHandler(self,contentWorld:.page,name:"codexKeys")
        config.userContentController.addScriptMessageHandler(self,contentWorld:.page,name:"audioControl")
        web=WKWebView(frame:.zero,configuration:config);web.navigationDelegate=self;web.uiDelegate=self
        window.contentView=web;show();startWorker()
        // Targeted events delivered to this window do not always become Carbon
        // global-hotkey events. Share the same held-key gate and action path.
        localKeyMonitor=NSEvent.addLocalMonitorForEvents(matching:[.keyDown,.keyUp]){[weak self] event in
            guard let self=self else{return event}
            if self.handleFunctionKey(UInt32(event.keyCode),down:event.type == .keyDown,repeated:event.isARepeat,
                modified:!event.modifierFlags.intersection([.command,.control,.option,.shift]).isEmpty) {return nil}
            guard self.hotkeysEnabled,
                  event.modifierFlags.intersection([.command,.control,.option,.shift]).isEmpty,
                  let index=self.keyConfiguration.firstIndex(where:{$0.keyCode==UInt32(event.keyCode)}) else{return event}
            let id=UInt32(index+1)
            if event.type == .keyUp {
                if self.heldHotkeys.remove(id) != nil {self.activateSlot(index,phase:"up")}
            }
            else if !event.isARepeat && self.heldHotkeys.insert(id).inserted {self.activateSlot(index)}
            return nil
        }
        NSWorkspace.shared.notificationCenter.addObserver(self,selector:#selector(willSleep),name:NSWorkspace.willSleepNotification,object:nil)
    }
    var english=false
    let englishText:[String:String]=[
        "关于 NuPhyLab": "About NuPhyLab",
        "退出 NuPhyLab": "Quit NuPhyLab",
        "编辑": "Edit",
        "撤销": "Undo",
        "重做": "Redo",
        "剪切": "Cut",
        "复制": "Copy",
        "粘贴": "Paste",
        "全选": "Select All",
        "窗口": "Window",
        "恢复默认窗口大小": "Reset Window Size",
        "打开 NuPhyLab": "Open NuPhyLab",
        "暂停 / 继续": "Pause / Resume",
        "停止并恢复键盘灯效": "Stop and Restore Lighting",
        "无法启动 NuPhyLab": "Unable to Start NuPhyLab",
        "未能确认键盘恢复": "Keyboard Restore Unconfirmed",
        "未能确认功能键恢复": "Function Key Restore Unconfirmed",
        "退出检查未完成": "Quit Checks Incomplete",
        "部分功能键尚未确认恢复，按键适配备份已保留。重新打开 NuPhyLab 后会再次尝试恢复。": "Some function keys could not be verified as restored. The key mapping backup is preserved. Reopen NuPhyLab to retry.",
        "服务已经停止，但退出检查未全部通过。详细原因已记录在日志中。": "The service stopped, but some quit checks did not pass. Details have been saved in the log.",
        "灯光服务已停止": "Lighting Service Stopped",
        "原始灯效备份仍保留在本机。连接键盘后重新打开 NuPhyLab，可再次尝试恢复。": "The original lighting backup is preserved on this Mac. Connect the keyboard and reopen NuPhyLab to retry restoration.",
        "服务已经停止，本次恢复结果未获完整确认。": "The service stopped before restoration could be fully confirmed.",
        "\n诊断日志未能写入本机存储。": "\nUnable to save diagnostic logs on this Mac.",
        "退出": "Quit",
        "知道了": "OK",
        "显示日志": "Show Logs",
        "为 NuPhy Air75 V3 创作灯光。独立本地项目。": "Create lighting for NuPhy Air75 V3. An independent local project.",
        "未能开始恢复键盘灯效": "Unable to Start Lighting Restore",
        "退出请求未能发送给灯光服务。应用仍保持运行，请稍后再试。": "Unable to send the quit request to the lighting service. The app is still running; try again shortly.",
        "仍在恢复键盘灯效": "Restoring Keyboard Lighting",
        "原始备份已保存。请保持键盘连接，应用将在恢复流程结束后退出。": "The original backup is saved. Keep the keyboard connected. The app will quit when restoration finishes.",
        "确定": "OK",
        "取消": "Cancel",
        "保存": "Save",
        "诊断日志已保存在：": "Diagnostic logs saved at:"
    ]
    func T(_ text:String)->String { english ? (englishText[text] ?? text) : text }
    func buildMenus(){
        let menu=NSMenu(); let app=NSMenuItem(); menu.addItem(app); let appMenu=NSMenu();app.submenu=appMenu
        appMenu.addItem(withTitle:self.T("关于 NuPhyLab"), action:#selector(about),keyEquivalent:"")
        appMenu.addItem(NSMenuItem.separator());appMenu.addItem(withTitle:self.T("退出 NuPhyLab"),action:#selector(quit),keyEquivalent:"q")
        let edit=NSMenuItem();menu.addItem(edit);edit.submenu=NSMenu(title:self.T("编辑"))
        for (title,selector,key) in [(self.T("撤销"),Selector(("undo:")),"z"),(self.T("重做"),Selector(("redo:")),"Z"),(self.T("剪切"),#selector(NSText.cut(_:)),"x"),(self.T("复制"),#selector(NSText.copy(_:)),"c"),(self.T("粘贴"),#selector(NSText.paste(_:)),"v"),(self.T("全选"),#selector(NSText.selectAll(_:)),"a")] {edit.submenu?.addItem(withTitle:title,action:selector,keyEquivalent:key)}
        let windowItem=NSMenuItem();menu.addItem(windowItem)
        let windowMenu=NSMenu(title:self.T("窗口"));windowItem.submenu=windowMenu
        let resetItem=windowMenu.addItem(withTitle:self.T("恢复默认窗口大小"),action:#selector(resetWindowSize),keyEquivalent:"0");resetItem.target=self
        NSApp.mainMenu=menu;NSApp.windowsMenu=windowMenu
        let tray=NSMenu();tray.addItem(withTitle:self.T("打开 NuPhyLab"),action:#selector(show),keyEquivalent:"")
        tray.addItem(withTitle:self.T("暂停 / 继续"),action:#selector(togglePause),keyEquivalent:"")
        tray.addItem(withTitle:self.T("停止并恢复键盘灯效"),action:#selector(restore),keyEquivalent:"")
        tray.addItem(NSMenuItem.separator());tray.addItem(withTitle:self.T("退出 NuPhyLab"),action:#selector(quit),keyEquivalent:"")
        for item in tray.items {item.target=self};statusItem.menu=tray
    }
    func startWorker(){
        guard let resources=Bundle.main.resourceURL else{return}
        let child=Process();child.executableURL=resources.appendingPathComponent("runtime/node");child.arguments=[resources.appendingPathComponent("server/main.mjs").path];child.currentDirectoryURL=resources
        var env=ProcessInfo.processInfo.environment;env["AIR_STUDIO_HID"]=resources.appendingPathComponent("bin/HIDBridge").path;env["AIR_STUDIO_UI"]=resources.appendingPathComponent("ui/dist").path;env["AIR_STUDIO_DATA"]=dataDirectory.path;env.removeValue(forKey:"AIR_STUDIO_PORT")
        // Reuse the web origin so an app update preserves the existing unsaved canvas.
        if let data=try? Data(contentsOf:dataDirectory.appendingPathComponent("runtime.json")),
           let runtime=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],
           let previous=runtime["port"] as? Int, previous>0 && previous<=65535 { env["AIR_STUDIO_PREFERRED_PORT"]=String(previous) }
        child.environment=env
        let output=Pipe();child.standardOutput=output
        let errors=Pipe();child.standardError=errors
        errors.fileHandleForReading.readabilityHandler={ [weak self] handle in
            let data=handle.availableData
            if data.isEmpty {handle.readabilityHandler=nil;return}
            self?.appendWorkerLog(data)
        }
        var pending=Data()
        output.fileHandleForReading.readabilityHandler={ [weak self] handle in
            let data=handle.availableData;if data.isEmpty{return};pending.append(data)
            while let newline=pending.firstIndex(of:10){let line=pending.prefix(upTo:newline);pending.removeSubrange(...newline)
                if let message=(try? JSONSerialization.jsonObject(with:line)) as? [String:Any],message["event"] as? String=="ready",let url=message["url"] as? String {DispatchQueue.main.async {self?.ready(url)}}
            }
        }
        child.terminationHandler={ [weak self] stopped in
            guard let self=self else{return}
            errors.fileHandleForReading.readabilityHandler=nil
            let remaining=errors.fileHandleForReading.readDataToEndOfFile()
            if !remaining.isEmpty {self.appendWorkerLog(remaining)}
            let status=stopped.terminationStatus
            let signaled=stopped.terminationReason == .uncaughtSignal
            self.appendWorkerLog(Data("\n[\(ISO8601DateFormatter().string(from:Date()))] Worker exited: status=\(status), signaled=\(signaled)\n".utf8))
            // Flush queued log writes before presenting an error or allowing AppKit to exit.
            self.workerLogQueue.async { [weak self] in
                DispatchQueue.main.async {self?.workerDidExit(status:status,signaled:signaled)}
            }
        }
        do{try child.run();worker=child}catch{
            appendWorkerLog(Data("Worker launch failed: \(error.localizedDescription)\n".utf8))
            let alert=NSAlert();alert.messageText=self.T("无法启动 NuPhyLab");alert.informativeText=error.localizedDescription;alert.runModal()
        }
    }
    func appendWorkerLog(_ bytes:Data){
        workerLogQueue.async { [weak self] in
            guard let self=self else{return}
            let manager=FileManager.default, url=self.workerLogURL
            do {
                try manager.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
                if let size=(try? manager.attributesOfItem(atPath:url.path)[.size]) as? NSNumber,size.intValue>1_048_576 {
                    let previous=url.appendingPathExtension("previous")
                    if manager.fileExists(atPath:previous.path){try manager.removeItem(at:previous)}
                    try manager.moveItem(at:url,to:previous)
                }
                if !manager.fileExists(atPath:url.path){manager.createFile(atPath:url.path,contents:nil,attributes:[.posixPermissions:0o600])}
                let handle=try FileHandle(forWritingTo:url)
                defer {try? handle.close()}
                try handle.seekToEnd()
                if bytes.count>65_536 {try handle.write(contentsOf:Data("[stderr chunk truncated]\n".utf8))}
                try handle.write(contentsOf:bytes.suffix(65_536))
                try handle.synchronize()
            } catch {
                // A logging failure cannot mask the worker's nonzero exit status.
            }
        }
    }
    func workerDidExit(status:Int32,signaled:Bool){
        stopHotkeyMonitoring()
        worker=nil
        let failed=status != 0 || signaled
        if failed || !terminating {
            let alert=NSAlert()
            alert.alertStyle=failed ? .warning : .informational
            let hasBackup=["original-lighting.json","original-lighting.profile-0.json","original-lighting.profile-1.json"].contains {FileManager.default.fileExists(atPath:dataDirectory.appendingPathComponent($0).path)}
            let hasKeyBackup=["key-mapping-backup.json","function-key-backup.json"].contains { FileManager.default.fileExists(atPath:dataDirectory.appendingPathComponent($0).path) }
            alert.messageText=failed ? self.T(hasBackup ? "未能确认键盘恢复" : hasKeyBackup ? "未能确认功能键恢复" : "退出检查未完成") : self.T("灯光服务已停止")
            let backupMessage=hasBackup ? self.T("原始灯效备份仍保留在本机。连接键盘后重新打开 NuPhyLab，可再次尝试恢复。") : hasKeyBackup ? self.T("部分功能键尚未确认恢复，按键适配备份已保留。重新打开 NuPhyLab 后会再次尝试恢复。") : self.T("服务已经停止，但退出检查未全部通过。详细原因已记录在日志中。")
            let logExists=FileManager.default.fileExists(atPath:workerLogURL.path)
            alert.informativeText=backupMessage+(logExists ? self.T("诊断日志已保存在：")+"\n\(workerLogURL.path)" : self.T("\n诊断日志未能写入本机存储。"))
            alert.addButton(withTitle:terminating ? self.T("退出") : self.T("知道了"))
            if logExists {alert.addButton(withTitle:self.T("显示日志"))}
            NSApp.activate(ignoringOtherApps:true)
            if alert.runModal() == .alertSecondButtonReturn {NSWorkspace.shared.activateFileViewerSelecting([workerLogURL])}
        }
        if terminating {NSApp.reply(toApplicationShouldTerminate:true)}
    }
    func ready(_ address:String){
        guard !terminating,worker?.isRunning==true,let url=URL(string:address) else{return};baseURL=url
        if let bytes=try? Data(contentsOf:dataDirectory.appendingPathComponent("runtime.json")),let data=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any]{apiToken=data["token"] as? String ?? ""}
        web.load(URLRequest(url:url))
        startHotkeyMonitoring()
    }
    @objc func show(){window?.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)}
    func defaultWindowSize() -> NSSize {
        let visible=(window?.screen ?? NSScreen.main)?.visibleFrame.size ?? NSSize(width:1440,height:900)
        return NSSize(width:max(720,min(1100,visible.width * 0.85)),height:max(520,min(700,visible.height * 0.82 - 28)))
    }
    @objc func resetWindowSize(){
        window.setContentSize(defaultWindowSize());window.center()
        window.saveFrame(usingName:windowFrameName)
        show()
    }
    @objc func about(){NSApp.orderFrontStandardAboutPanel(options:[.applicationName:"NuPhyLab",.applicationVersion:(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Development"),.credits:NSAttributedString(string:self.T("为 NuPhy Air75 V3 创作灯光。独立本地项目。"))])}
    @objc func togglePause(){post(["op":"pause"])}
    @objc func restore(){post(["op":"restore"])}
    @objc func quit(){NSApp.terminate(nil)}
    @objc func willSleep(){ audioCapture.stop();pendingAudio=nil }
    func post(_ data:[String:Any]){guard let base=baseURL else{return};var request=URLRequest(url:base.appendingPathComponent("api/command"));request.httpMethod="POST";request.setValue(apiToken,forHTTPHeaderField:"X-Air-Token");request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=try? JSONSerialization.data(withJSONObject:data);URLSession.shared.dataTask(with:request).resume()}
    func activateSlot(_ index:Int,phase:String="down"){
        guard hotkeysEnabled,!terminating,keyConfiguration.indices.contains(index) else{return}
        enqueueKey(["op":"codexKey","code":keyConfiguration[index].code,"phase":phase])
    }
    func enqueueKey(_ data:[String:Any]) {
        keyEventQueue.append(data);sendNextKey()
    }
    func sendNextKey() {
        guard !keyEventSending,!keyEventQueue.isEmpty,let base=baseURL else{return}
        keyEventSending=true
        var request=URLRequest(url:base.appendingPathComponent("api/command"),timeoutInterval:5)
        request.httpMethod="POST";request.setValue(apiToken,forHTTPHeaderField:"X-Air-Token")
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.httpBody=try? JSONSerialization.data(withJSONObject:keyEventQueue.removeFirst())
        URLSession.shared.dataTask(with:request){[weak self] _,_,_ in
            DispatchQueue.main.async {self?.keyEventSending=false;self?.sendNextKey()}
        }.resume()
    }
    func sendAudio(_ packet:[String:Any]) {
        guard !terminating,let base=baseURL else{return}
        if packet["op"] as? String == "audioInventory" {post(packet);return}
        pendingAudio=packet
        guard !audioSending else{return}
        sendPendingAudio(base)
    }
    func sendPendingAudio(_ base:URL) {
        guard !terminating,let packet=pendingAudio else{return}
        pendingAudio=nil;audioSending=true
        var request=URLRequest(url:base.appendingPathComponent("api/command"),timeoutInterval:2)
        request.httpMethod="POST";request.setValue(apiToken,forHTTPHeaderField:"X-Air-Token")
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.httpBody=try? JSONSerialization.data(withJSONObject:packet)
        URLSession.shared.dataTask(with:request){[weak self] _,_,_ in DispatchQueue.main.async {
            guard let self=self else{return};self.audioSending=false
            if self.pendingAudio != nil {self.sendPendingAudio(base)}
        }}.resume()
    }
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage,replyHandler:@escaping(Any?,String?)->Void){
        guard message.frameInfo.isMainFrame,let url=message.frameInfo.request.url,
              url.host==baseURL?.host,url.port==baseURL?.port,
              let body=message.body as? [String:Any] else{replyHandler(nil,"Invalid origin");return}
        if message.name == "audioControl" {
            guard let permission=body["permission"] as? String,["microphone","system"].contains(permission) else{replyHandler(nil,"Invalid permission");return}
            let pane=permission == "microphone" ? "Privacy_Microphone" : "Privacy_AudioCapture"
            NSWorkspace.shared.open(URL(string:"x-apple.systempreferences:com.apple.preference.security?"+pane)!)
            replyHandler(true,nil);return
        }
        switch body["kind"] as? String {
        case "capture":
            let session=body["session"] as? String
            if body["active"] as? Bool == true {
                captureSession=session;capturingKey=true;capturedFunctionKeys.removeAll()
            } else if session==captureSession {
                captureSession=nil;capturingKey=false;capturedFunctionKeys.removeAll()
            }
            refreshHotkeys()
        case "editing": editingField=body["active"] as? Bool==true;refreshHotkeys()
        case "config": applyKeyConfiguration(body["value"] as? [String:Any])
        default: replyHandler(nil,"Invalid operation");return
        }
        replyHandler(true,nil)
    }
    func applicationDidBecomeActive(_ notification:Notification){refreshHotkeys()}
    func applicationDidResignActive(_ notification:Notification){refreshHotkeys()}
    func applyKeyConfiguration(_ value:[String:Any]?){
        if let revision=value?["revision"] as? Int {
            guard revision>=keyRevision else{return};keyRevision=revision
        }
        if let revision=value?["setupRevision"] as? Int,revision != setupRevision {
            setupRevision=revision;setHotkeysEnabled(false)
        }
        let raw=value?["bindings"] as? [[String:Any]] ?? []
        let next=raw.compactMap { item -> (code:String,keyCode:UInt32)? in
            guard let code=item["code"] as? String,let n=item["keyCode"] as? Int,n>=0,n<=127 else{return nil}
            return (code,UInt32(n))
        }
        let valid=next.count==12 && Set(next.map{$0.code}).count==12 && Set(next.map{$0.keyCode}).count==12
        configuredKeysEnabled=valid && value?["enabled"] as? Bool==true
        if keyConfiguration.map({$0.code}) != next.map({$0.code}) || keyConfiguration.map({$0.keyCode}) != next.map({$0.keyCode}) {
            setHotkeysEnabled(false);keyConfiguration=valid ? next : []
        }
        refreshHotkeys()
    }
    func refreshHotkeys(){
        setHotkeysEnabled(configuredKeysEnabled && !capturingKey && !(editingField && NSApp.isActive) && !terminating && hotkeyPollTimer != nil)
        if hotkeysEnabled { refreshReservedKeyCapture() }
        if capturingKey && NSApp.isActive && !terminating { _ = startReservedKeyCapture() }
        else if !hotkeysEnabled { stopReservedKeyCapture() }
        reportHotkeys()
    }
    func reportHotkeys(){
        guard baseURL != nil,!terminating else{return}
        let suspended=capturingKey || (editingField && NSApp.isActive)
        let signature="\(registeredCodes)|\(failedCodes)|\(suspended)"
        guard signature != lastKeyReportSignature || Date().timeIntervalSince(lastKeyReport)>5 else{return}
        lastKeyReportSignature=signature;lastKeyReport=Date()
        post(["op":"codexKeyStatus","registered":registeredCodes,"failed":failedCodes,"suspended":suspended])
    }
    func startHotkeyMonitoring(){
        stopHotkeyMonitoring()
        keyRevision = -1
        let timer=Timer(timeInterval:0.5,repeats:true){[weak self] _ in self?.pollHotkeySetting()}
        hotkeyPollTimer=timer;RunLoop.main.add(timer,forMode:.common)
        pollHotkeySetting()
    }
    func stopHotkeyMonitoring(){
        audioCapture.stop();pendingAudio=nil
        hotkeyPollGeneration+=1
        hotkeyPollTimer?.invalidate();hotkeyPollTimer=nil
        hotkeyStateTask?.cancel();hotkeyStateTask=nil
        setHotkeysEnabled(false)
        stopReservedKeyCapture()
    }
    func pollHotkeySetting(){
        guard !terminating,hotkeyPollTimer != nil,hotkeyStateTask == nil,let base=baseURL else{return}
        let generation=hotkeyPollGeneration
        var request=URLRequest(url:base.appendingPathComponent("api/state"),cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:3)
        request.setValue(apiToken,forHTTPHeaderField:"X-Air-Token")
        hotkeyStateTask=URLSession.shared.dataTask(with:request){[weak self] data,response,_ in
            let state=data.flatMap{(try? JSONSerialization.jsonObject(with:$0)) as? [String:Any]}
            let settings=state?["settings"] as? [String:Any]
            let codex=state?["codex"] as? [String:Any]
            let keys=(response as? HTTPURLResponse)?.statusCode==200 ? codex?["keys"] as? [String:Any] : nil
            DispatchQueue.main.async {
                guard let self=self,self.hotkeyPollGeneration==generation else{return}
                self.hotkeyStateTask=nil
                if let value=settings?["language"] as? String, ["en","zh-CN"].contains(value), self.english != (value == "en") { self.english = value == "en"; self.buildMenus() }
                self.applyKeyConfiguration(keys)
                self.audioCapture.sync((state?["audio"] as? [String:Any])?["capture"] as? [String:Any])
            }
        }
        hotkeyStateTask?.resume()
    }
    func setHotkeysEnabled(_ enabled:Bool){
        if enabled {
            guard !hotkeysEnabled else{return}
            hotkeysEnabled=true;installHotkeys()
        } else {
            if !capturingKey {stopReservedKeyCapture()}
            for id in heldHotkeys {
                let index=Int(id)-1
                if keyConfiguration.indices.contains(index) {enqueueKey(["op":"codexKey","code":keyConfiguration[index].code,"phase":"up"])}
            }
            hotkeysEnabled=false
            for key in hotKeys {if let key=key {UnregisterEventHotKey(key)}}
            hotKeys.removeAll();heldHotkeys.removeAll();registeredCodes.removeAll();failedCodes.removeAll();carbonRegisteredCodes.removeAll();nextCaptureRetry = .distantPast
            if let handler=hotkeyHandler {RemoveEventHandler(handler);hotkeyHandler=nil}
        }
    }
    func installHotkeys(){
        guard hotkeysEnabled,hotKeys.isEmpty,hotkeyHandler==nil else{return}
        var eventTypes=[EventTypeSpec(eventClass:OSType(kEventClassKeyboard),eventKind:UInt32(kEventHotKeyPressed)),EventTypeSpec(eventClass:OSType(kEventClassKeyboard),eventKind:UInt32(kEventHotKeyReleased))]
        let status=InstallEventHandler(GetApplicationEventTarget(),{_,event,user in
            guard let event=event,let user=user else{return noErr};var ident=EventHotKeyID();GetEventParameter(event,EventParamName(kEventParamDirectObject),EventParamType(typeEventHotKeyID),nil,MemoryLayout<EventHotKeyID>.size,nil,&ident)
            let host=Unmanaged<AppDelegate>.fromOpaque(user).takeUnretainedValue()
            guard host.hotkeysEnabled,!host.terminating else{return OSStatus(eventNotHandledErr)}
            if GetEventKind(event)==UInt32(kEventHotKeyReleased) {
                if host.heldHotkeys.remove(ident.id) != nil {host.activateSlot(Int(ident.id)-1,phase:"up")}
            }
            else if host.heldHotkeys.insert(ident.id).inserted {host.activateSlot(Int(ident.id)-1)}
            return noErr
        },2,&eventTypes,Unmanaged.passUnretained(self).toOpaque(),&hotkeyHandler)
        guard status==noErr else {hotkeysEnabled=false;failedCodes=keyConfiguration.map{$0.code};return}
        for (i,binding) in keyConfiguration.enumerated(){
            var key:EventHotKeyRef?
            let result=RegisterEventHotKey(binding.keyCode,0,EventHotKeyID(signature:0x41495253,id:UInt32(i+1)),GetApplicationEventTarget(),0,&key)
            if result==noErr {hotKeys.append(key);registeredCodes.append(binding.code)}
            else {failedCodes.append(binding.code);appendWorkerLog(Data("Hotkey \(binding.code) unavailable: \(result)\n".utf8))}
        }
        carbonRegisteredCodes = registeredCodes
        refreshReservedKeyCapture(force:true)
    }
    func refreshReservedKeyCapture(force:Bool=false,now:Date=Date()) {
        guard hotkeysEnabled else{return}
        let functions=keyConfiguration.filter{functionKeyCodes[$0.keyCode] != nil}.map{$0.code}
        guard !functions.isEmpty else{return}
        // Permission may be granted after registration. Retry without requiring
        // a mode toggle or app restart, and rebuild reports from actual capture.
        guard force || reservedKeyTap != nil || now >= nextCaptureRetry else{return}
        nextCaptureRetry=now.addingTimeInterval(2)
        let captured=startReservedKeyCapture()
        registeredCodes=keyConfiguration.map{$0.code}.filter{carbonRegisteredCodes.contains($0) || (captured && functions.contains($0))}
        failedCodes=keyConfiguration.map{$0.code}.filter{!registeredCodes.contains($0) || (!captured && $0=="F11")}
        // A key needing the event tap is not ready merely because Carbon
        // accepted a registration that macOS can intercept first.
        registeredCodes.removeAll{failedCodes.contains($0)}
    }
    func stopReservedKeyCapture(){
        if let tap=reservedKeyTap {CGEvent.tapEnable(tap:tap,enable:false);CFMachPortInvalidate(tap)}
        if let source=reservedKeySource {CFRunLoopRemoveSource(CFRunLoopGetMain(),source,.commonModes)}
        reservedKeyTap=nil;reservedKeySource=nil
    }
    func startReservedKeyCapture()->Bool {
        if let attempt=captureAttemptOverride {return attempt()}
        if let tap=reservedKeyTap {
            if !CGEvent.tapIsEnabled(tap:tap) {CGEvent.tapEnable(tap:tap,enable:true)}
            return CGEvent.tapIsEnabled(tap:tap)
        }
        let mask=(CGEventMask(1)<<CGEventType.keyDown.rawValue)|(CGEventMask(1)<<CGEventType.keyUp.rawValue)
        guard let tap=CGEvent.tapCreate(tap:.cghidEventTap,place:.headInsertEventTap,options:.defaultTap,eventsOfInterest:mask,callback:{_,type,event,context in
            guard let context=context else{return Unmanaged.passUnretained(event)}
            let host=Unmanaged<AppDelegate>.fromOpaque(context).takeUnretainedValue()
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                if host.hotkeysEnabled || host.capturingKey,let tap=host.reservedKeyTap {CGEvent.tapEnable(tap:tap,enable:true)}
                return Unmanaged.passUnretained(event)
            }
            return host.handleReservedKey(type,event) ? nil : Unmanaged.passUnretained(event)
        },userInfo:Unmanaged.passUnretained(self).toOpaque()),let source=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0) else{return false}
        reservedKeyTap=tap;reservedKeySource=source
        CFRunLoopAddSource(CFRunLoopGetMain(),source,.commonModes);CGEvent.tapEnable(tap:tap,enable:true)
        return true
    }
    func handleReservedKey(_ type:CGEventType,_ event:CGEvent)->Bool {
        guard [CGEventType.keyDown,.keyUp].contains(type) else{return false}
        return handleFunctionKey(UInt32(event.getIntegerValueField(.keyboardEventKeycode)),down:type == .keyDown,
            repeated:event.getIntegerValueField(.keyboardEventAutorepeat) != 0,
            modified:!event.flags.intersection([.maskCommand,.maskControl,.maskAlternate,.maskShift]).isEmpty)
    }
    func handleFunctionKey(_ keyCode:UInt32,down:Bool,repeated:Bool,modified:Bool)->Bool {
        guard !terminating,let code=functionKeyCodes[keyCode] else{return false}
        if capturingKey && NSApp.isActive {
            if !down,capturedFunctionKeys.remove(code) != nil {sendCapturedFunctionKey(code,phase:"up");return true}
            guard !modified else{return false}
            if down && !repeated && capturedFunctionKeys.insert(code).inserted {sendCapturedFunctionKey(code,phase:"down")}
            return true
        }
        guard hotkeysEnabled,let index=keyConfiguration.firstIndex(where:{$0.keyCode==keyCode}) else{return false}
        let id=UInt32(index+1)
        if !down,heldHotkeys.remove(id) != nil {
            activateSlot(index,phase:"up");return true
        }
        guard !modified else{return false}
        if down && !repeated && heldHotkeys.insert(id).inserted {
            activateSlot(index)
        }
        return true
    }
    func sendCapturedFunctionKey(_ code:String,phase:String) {
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('nuphylab:function-key',{detail:{code:'\(code)',phase:'\(phase)'}}));",completionHandler:nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{return false}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows:Bool)->Bool{show();return true}
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply{
        if terminating{return .terminateLater}
        stopHotkeyMonitoring()
        guard let worker=worker else{return .terminateNow}
        // A stopped process may still have a queued termination callback and log flush.
        // Let that callback surface a nonzero exit instead of bypassing it on a second quit.
        terminating=true
        setExitPresentation(true)
        guard worker.isRunning else{return .terminateLater}
        // Signal only Node. Its shutdown handler must keep HIDBridge alive until
        // restore and helper shutdown finish; Process.terminate() can hit its group.
        let workerPID=worker.processIdentifier
        let signalResult=workerPID>0 ? Darwin.kill(workerPID,SIGTERM) : -1
        let signalError=workerPID>0 ? errno : EINVAL
        if signalResult != 0 && signalError != ESRCH {
            terminating=false
            setExitPresentation(false)
            appendWorkerLog(Data("Worker shutdown signal failed: pid=\(workerPID), errno=\(signalError)\n".utf8))
            startHotkeyMonitoring()
            let alert=NSAlert();alert.alertStyle = .warning;alert.messageText=self.T("未能开始恢复键盘灯效");alert.informativeText=self.T("退出请求未能发送给灯光服务。应用仍保持运行，请稍后再试。");alert.runModal()
            return .terminateCancel
        }
        DispatchQueue.main.asyncAfter(deadline:.now()+45){if worker.isRunning{let alert=NSAlert();alert.messageText=self.T("仍在恢复键盘灯效");alert.informativeText=self.T("原始备份已保存。请保持键盘连接，应用将在恢复流程结束后退出。");alert.beginSheetModal(for:self.window){_ in }}}
        return .terminateLater
    }
    func setExitPresentation(_ active: Bool) {
        web.evaluateJavaScript("window.__AIR_EXITING__ = \(active ? "true" : "false"); window.dispatchEvent(new Event('nuphylab:shutdown'));", completionHandler:nil)
    }
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        guard let url=navigationAction.request.url else{decisionHandler(.cancel);return}
        if navigationAction.shouldPerformDownload {decisionHandler(.download);return}
        if url.scheme=="blob"||url.host=="127.0.0.1"{decisionHandler(.allow);return}
        decisionHandler(.cancel)
        guard ["https","http"].contains(url.scheme ?? "") else{return}
        if url.scheme=="https", url.host=="drive.nuphy.io" {
            for bundleID in ["com.google.Chrome","com.microsoft.edgemac"] {
                if let browser=NSWorkspace.shared.urlForApplication(withBundleIdentifier:bundleID) {
                    NSWorkspace.shared.open([url],withApplicationAt:browser,configuration:NSWorkspace.OpenConfiguration())
                    return
                }
            }
        }
        NSWorkspace.shared.open(url)
    }
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){download.delegate=self}
    func webView(_ webView:WKWebView,navigationResponse:WKNavigationResponse,didBecome download:WKDownload){download.delegate=self}
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping(URL?)->Void){let name=URL(fileURLWithPath:suggestedFilename).lastPathComponent;let dir=FileManager.default.urls(for:.downloadsDirectory,in:.userDomainMask)[0];let url=dir.appendingPathComponent("NuPhyLab-\(Int(Date().timeIntervalSince1970))-\(name)");completionHandler(url)}
    func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void){let panel=NSOpenPanel();panel.canChooseDirectories=false;panel.allowsMultipleSelection=parameters.allowsMultipleSelection;panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.urls:nil)}}
    func webView(_ webView:WKWebView,runJavaScriptAlertPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping()->Void){let alert=NSAlert();alert.messageText=message;alert.beginSheetModal(for:window){_ in completionHandler()}}
    func webView(_ webView:WKWebView,runJavaScriptConfirmPanelWithMessage message:String,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping(Bool)->Void){let alert=NSAlert();alert.messageText=message;alert.addButton(withTitle:self.T("确定"));alert.addButton(withTitle:self.T("取消"));alert.beginSheetModal(for:window){completionHandler($0 == .alertFirstButtonReturn)}}
    func webView(_ webView:WKWebView,runJavaScriptTextInputPanelWithPrompt prompt:String,defaultText:String?,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping(String?)->Void){let alert=NSAlert();alert.messageText=prompt;alert.addButton(withTitle:self.T("保存"));alert.addButton(withTitle:self.T("取消"));let field=NSTextField(string:defaultText ?? "");field.frame=NSRect(x:0,y:0,width:300,height:28);alert.accessoryView=field;alert.beginSheetModal(for:window){completionHandler($0 == .alertFirstButtonReturn ? field.stringValue:nil)}}
}
