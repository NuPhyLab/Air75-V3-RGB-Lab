// Air75 V3 user-space HID bridge. No firmware or session-key setters.
// The sole keymap write is a journaled factory F4 lease with verified restoration.
// Build: swiftc -O native/HIDBridge.swift -o native/air75-hid-bridge
import Foundation
import IOKit
import IOKit.hid
import CoreGraphics
import AppKit
import ApplicationServices
import Darwin
import IOKit.hidsystem

// Bluetooth exposes ordinary keyboard/consumer reports, not the S4 RGB pipe.
// Enumeration does not open HID. Temporary OS key translation is managed by
// KeyAdaptation, separately from the keyboard's firmware/keymap and RGB pipe.
final class BluetoothKeyboard {
    static func matches(_ p: [String:Any]) -> Bool {
        guard (p["VendorID"] as? NSNumber)?.intValue == 2007,
              (p["ProductID"] as? NSNumber)?.intValue == 0,
              ["Bluetooth", "Bluetooth Low Energy"].contains(p["Transport"] as? String ?? ""),
              (p["Manufacturer"] as? String)?.lowercased() == "nuphy",
              let product = p["Product"] as? String else { return false }
        return product.range(of: "^(NuPhy )?Air75 V3(-[123])?$", options: .regularExpression) != nil
    }
    static func identities() -> [[String:Any]] {
        var found = [String:[String:Any]]()
        let manager=IOHIDManagerCreate(kCFAllocatorDefault,IOOptionBits(kIOHIDOptionsTypeNone))
        IOHIDManagerSetDeviceMatching(manager,[kIOHIDPrimaryUsagePageKey:1,kIOHIDPrimaryUsageKey:6] as CFDictionary)
        // CopyDevices enumerates without opening the HID device or registering
        // input callbacks. Service clients omit the Bluetooth manufacturer.
        for device in IOHIDManagerCopyDevices(manager) as? Set<IOHIDDevice> ?? [] {
            var properties = [String:Any]()
            for key in ["VendorID","ProductID","Transport","Manufacturer","Product"] {
                properties[key] = IOHIDDeviceGetProperty(device,key as CFString)
            }
            var registry: UInt64=0
            guard Self.matches(properties), IORegistryEntryGetRegistryEntryID(IOHIDDeviceGetService(device),&registry)==KERN_SUCCESS else { continue }
            let location = IOHIDDeviceGetProperty(device,"LocationID" as CFString) as? NSNumber
            let group = location?.uint64Value ?? 0
            let identity = group > 0 ? "location-\(group)" : "service-\(registry)"
            found[identity] = ["id":String(registry),"locationId":UInt32(truncatingIfNeeded:group)]
        }
        return found.values.sorted { ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "") }
    }
    func snapshot() -> [String:Any] {
        ["devices":Self.identities().map { ["id":$0["id"]!,"model":"Air75 V3","transport":"bluetooth"] }]
    }
}
final class KeyAdaptation {
    private var client = IOHIDEventSystemClientCreateSimpleClient(kCFAllocatorDefault)
    private let journal: URL
    private let property = "UserKeyMapping" as CFString
    private let src = "HIDKeyboardModifierMappingSrc", dst = "HIDKeyboardModifierMappingDst"
    init(journal: URL) { self.journal = journal }
    private func services() -> [IOHIDServiceClient] {
        let locations=Set(BluetoothKeyboard.identities().compactMap{$0["locationId"] as? UInt32}.filter{$0 != 0})
        return (IOHIDEventSystemClientCopyServices(client) as? [IOHIDServiceClient] ?? []).filter {
            let transport=IOHIDServiceClientCopyProperty($0,"Transport" as CFString) as? String ?? ""
            if transport == "USB" {return number($0,"VendorID") == 0x19f5 && number($0,"ProductID") == 0x1028}
            let product=IOHIDServiceClientCopyProperty($0,"Product" as CFString) as? String ?? ""
            return ["Bluetooth","Bluetooth Low Energy"].contains(transport) && number($0,"VendorID")==2007 && number($0,"ProductID")==0 &&
                product.range(of:"^(NuPhy )?Air75 V3(-[123])?$",options:.regularExpression) != nil &&
                locations.contains(UInt32(truncatingIfNeeded:number($0,"LocationID")))
        }
    }
    private func targetServices(_ command:[String:Any]) throws -> [IOHIDServiceClient] {
        if command["transport"] as? String == "bluetooth" {
            let devices=BluetoothKeyboard.identities()
            guard devices.count==1,let location=devices[0]["locationId"] as? UInt32,location>0 else {
                throw failure("DEVICE_NOT_FOUND","请只连接要适配的一把 Air75 V3 蓝牙键盘。")
            }
            // macOS sign-extends the service's 32-bit location, while the HID
            // device reports it unsigned. Compare the same 32-bit identity.
            return services().filter { UInt32(truncatingIfNeeded:number($0,"LocationID"))==location &&
                IOHIDServiceClientCopyProperty($0,"Transport" as CFString) as? String != "USB" }
        }
        guard command["transport"] == nil,let location=command["locationId"] as? UInt64,location>0 else {
            throw failure("KEY_MAPPING_INVALID","按键适配参数无效。")
        }
        return services().filter { number($0,"LocationID")==location &&
            IOHIDServiceClientCopyProperty($0,"Transport" as CFString) as? String == "USB" }
    }
    static let keycapUsages:[UInt64] = [0xc00000070,0xc0000006f,0xff0100000010,0xc00000221,0xc000000cf,0x10000009b,0xc000000b6,0xc000000cd,0xc000000b5,0xc000000e2,0xc000000ea,0xc000000e9]
    static func validMappings(_ rows:[[String:UInt64]],bluetooth:Bool,keycaps:Bool=false) -> Bool {
        let src="HIDKeyboardModifierMappingSrc",dst="HIDKeyboardModifierMappingDst"
        return rows.count<=12 && Set(rows.compactMap{$0[src]}).count==rows.count && rows.allSatisfy { row in
            guard let source=row[src],let target=row[dst] else{return false}
            if keycaps {
                guard (0x700000068...0x700000073).contains(source) else{return false}
                return keycapUsages[Int(source-0x700000068)]==target
            }
            guard (0x70000003a...0x700000045).contains(target) else{return false}
            if bluetooth {return source==target+46} // F13–F24 → corresponding F1–F12 only.
            let allowed:Set<UInt64>=[0x700000069,0x70000006a,0xc000000b6,0xc000000cd,0xc000000b5,0xc000000e2,0xc000000ea,0xc000000e9,0xc0000029f,0xc000000cf,0x10000009b]
            return source==target+46 || allowed.contains(source)
        }
    }
    static func serviceAcceptsSource(_ source:UInt64, conforms:(UInt32,UInt32)->Bool) -> Bool {
        switch UInt32(source >> 32) {
        case 7: return conforms(1,6)
        case 12: return conforms(12,1)
        case 1: return conforms(1,0x80) // System Control, including Do Not Disturb.
        default: return false
        }
    }
    private func number(_ service: IOHIDServiceClient, _ key: String) -> UInt64 {
        (IOHIDServiceClientCopyProperty(service,key as CFString) as? NSNumber)?.uint64Value ?? 0
    }
    private func id(_ service: IOHIDServiceClient) -> String {
        String((IOHIDServiceClientGetRegistryID(service) as? NSNumber)?.uint64Value ?? 0)
    }
    private func sessionStillExists(_ registry: String) -> Bool {
        // A failed inventory or temporarily missing Bluetooth metadata is not
        // evidence that a service disappeared. Retain its recovery record.
        guard let all = IOHIDEventSystemClientCopyServices(client) as? [IOHIDServiceClient] else { return true }
        return all.contains(where:{id($0)==registry})
    }
    private func mappings(_ service: IOHIDServiceClient) throws -> [[String:UInt64]] {
        guard let raw = IOHIDServiceClientCopyProperty(service,property) else { return [] }
        guard let list = raw as? [[String:UInt64]], list.count <= 1024,
              list.allSatisfy({$0[src] != nil && $0[dst] != nil}) else {
            throw failure("KEY_MAPPING_FORMAT", "已有系统键位映射无法安全读取，未覆盖它。")
        }
        return list
    }
    static func writeVerified(_ rows: [[String:UInt64]], read: () throws -> [[String:UInt64]],
                              set: () -> Bool, settle: () -> Void) throws {
        // Restoring an already restored service must not require another write.
        if try read() == rows { return }
        let accepted = set()
        // HID service properties can lag behind SetProperty. Read again without
        // repeating the write or overwriting a subsequent change by another app.
        for attempt in 0..<6 {
            if attempt > 0 { settle() }
            if try read() == rows { return }
        }
        throw failure("KEY_MAPPING_DENIED", "系统未确认按键适配（写入应答：\(accepted)），请重试。")
    }
    private func write(_ service: IOHIDServiceClient, _ rows: [[String:UInt64]]) throws {
        try Self.writeVerified(rows, read: { try self.mappings(service) },
            set: { IOHIDServiceClientSetProperty(service,self.property,rows as CFArray) },
            settle: { pump(0.05) })
    }
    private func save(_ records: [[String:Any]]) throws {
        try FileManager.default.createDirectory(at:journal.deletingLastPathComponent(),withIntermediateDirectories:true)
        try JSONSerialization.data(withJSONObject:records).write(to:journal,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:journal.path)
    }
    func restore() throws -> [String:Any] {
        guard FileManager.default.fileExists(atPath:journal.path) else { return ["restored":true] }
        client = IOHIDEventSystemClientCreateSimpleClient(kCFAllocatorDefault)
        let raw = try JSONSerialization.jsonObject(with:Data(contentsOf:journal))
        guard let records = raw as? [[String:Any]],records.count <= 16 else {
            throw failure("KEY_MAPPING_BACKUP", "按键适配备份无法读取，已保留原文件。")
        }
        let devices = services()
        var pending = [[String:Any]]()
        for record in records {
            guard let registry = record["registry"] as? String,
                  let before = record["before"] as? [[String:UInt64]],
                  let installed = record["installed"] as? [[String:UInt64]] else {
                throw failure("KEY_MAPPING_BACKUP", "按键适配备份格式无效。")
            }
            // Registry IDs identify this device session. Unplugged services and
            // their in-memory properties no longer exist; never restore to a replacement.
            guard let service = devices.first(where:{id($0)==registry}) else { continue }
            do {
                var current = try mappings(service)
                for row in installed {
                    guard let source = row[src], let target = row[dst] else { continue }
                    // Preserve changes made by another utility after our install.
                    guard current.contains(where:{$0[src]==source && $0[dst]==target}) else { continue }
                    current.removeAll(where:{$0[src]==source})
                    current += before.filter({$0[src]==source})
                }
                try write(service,current)
            } catch {
                // A removed service loses its temporary mapping with it. Never
                // apply a saved mapping to a newly enumerated device session.
                if sessionStillExists(registry) {
                    diagnostic("Key restore failed for service \(registry): \(error)")
                    pending.append(record)
                }
            }
        }
        if pending.isEmpty { try FileManager.default.removeItem(at:journal) }
        else { try save(pending);throw failure("KEY_MAPPING_RESTORE", "部分按键尚未恢复，备份已保留，请重试恢复。") }
        return ["restored":true]
    }
    func apply(_ command: [String:Any]) throws -> [String:Any] {
        guard let rows = command["mappings"] as? [[String:UInt64]],
              command["profile"] == nil || command["profile"] as? String == "keycaps",
              Self.validMappings(rows,bluetooth:command["transport"] as? String == "bluetooth",keycaps:command["profile"] as? String == "keycaps") else { throw failure("KEY_MAPPING_INVALID", "按键适配参数无效。") }
        _ = try restore()
        // Do not keep an event-service snapshot across disconnects/reconnects.
        // Resolve after restore so the retained client owns these service refs.
        client = IOHIDEventSystemClientCreateSimpleClient(kCFAllocatorDefault)
        let devices = try targetServices(command)
        if rows.isEmpty { return ["applied":true,"verified":true,"services":0] }
        guard CGPreflightListenEventAccess() else { throw failure("INPUT_MONITORING_REQUIRED", "请先允许输入监控，再继续适配。") }
        guard !devices.isEmpty else { throw failure("DEVICE_NOT_FOUND", "请连接要适配的 Air75 V3。") }
        var records = [[String:Any]]()
        do {
            for service in devices {
                let relevant = rows.filter { row in
                    Self.serviceAcceptsSource(row[src]!, conforms: { IOHIDServiceClientConformsTo(service,$0,$1) != 0 })
                }
                if relevant.isEmpty {continue}
                let before = try mappings(service)
                let sources = Set(relevant.compactMap{$0[src]})
                guard !before.contains(where:{ sources.contains($0[src] ?? 0) && !relevant.contains($0) }) else {
                    throw failure("KEY_MAPPING_CONFLICT", "这些媒体键已有自定义映射，未覆盖它；请先恢复原映射或在官方驱动中设置标准 F 键。")
                }
                let installed = relevant.filter { !before.contains($0) }
                if installed.isEmpty { continue }
                records.append(["registry":id(service),"before":before,"installed":installed])
                try save(records) // Durable before the first mutation.
                try write(service,before+installed)
            }
            for row in rows {
                guard try devices.contains(where:{ try mappings($0).contains(row) }) else {
                    throw failure("KEY_MAPPING_UNSUPPORTED", "此系统未接受媒体键转换，请使用官方驱动设置标准 F 键。")
                }
            }
            return ["applied":true,"verified":true,"services":records.count]
        } catch { _ = try restore(); throw error }
    }
    func status(_ command: [String:Any]) throws -> [String:Any] {
        guard let rows=command["mappings"] as? [[String:UInt64]],
              command["profile"] == nil || command["profile"] as? String == "keycaps",
              Self.validMappings(rows,bluetooth:command["transport"] as? String == "bluetooth",keycaps:command["profile"] as? String == "keycaps") else {
            throw failure("KEY_MAPPING_INVALID", "按键适配参数无效。")
        }
        client = IOHIDEventSystemClientCreateSimpleClient(kCFAllocatorDefault)
        let devices=try targetServices(command)
        let verified = try !devices.isEmpty && rows.allSatisfy { row in
            try devices.contains { try mappings($0).contains(row) }
        }
        return ["verified":verified]
    }
}


struct BridgeError: Error, CustomStringConvertible {
    let code: String
    let message: String
    var description: String { "\(code): \(message)" }
    var json: [String: Any] { ["code": code, "message": message] }
}

func failure(_ code: String, _ message: String) -> BridgeError {
    BridgeError(code: code, message: message)
}
func diagnostic(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}
func permissionSnapshot() -> [String: Any] {
    ["inputMonitoring": CGPreflightListenEventAccess(),
     "accessibility": AXIsProcessTrusted(),
     "canPostEvents": CGPreflightPostEventAccess(),
     "promptsRequested": false]
}
func permissionSettingsURL(_ value: Any?) throws -> URL {
    let pane: String
    switch value as? String {
    case "inputMonitoring": pane = "Privacy_ListenEvent"
    case "accessibility": pane = "Privacy_Accessibility"
    default: throw failure("INVALID_PERMISSION", "仅支持输入监控和辅助功能设置。")
    }
    return URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)")!
}
func openPermissionSettings(_ permission: Any?) throws -> [String: Any] {
    let url = try permissionSettingsURL(permission)
    guard NSWorkspace.shared.open(url) else {
        throw failure("SETTINGS_OPEN_FAILED", "无法打开系统设置，请在“隐私与安全性”中打开对应权限页面。")
    }
    // Opening the settings page neither grants access nor requests a prompt.
    return ["opened": true, "permission": permission as! String, "permissions": permissionSnapshot()]
}
func emit(_ object: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(object),
          let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
    var output = data; output.append(10)
    // A vanished parent must not throw an Objective-C broken-pipe exception
    // before the device's shutdown restoration has run.
    output.withUnsafeBytes { raw in
        var offset = 0
        while offset < raw.count {
            let written = Darwin.write(STDOUT_FILENO, raw.baseAddress!.advanced(by: offset), raw.count - offset)
            if written > 0 { offset += written }
            else if errno != EINTR { break }
        }
    }
}
func pump(_ seconds: TimeInterval) {
    let deadline = ProcessInfo.processInfo.systemUptime + seconds
    repeat {
        _ = CFRunLoopRunInMode(.defaultMode, min(0.005, max(0.0001, deadline - ProcessInfo.processInfo.systemUptime)), true)
    } while ProcessInfo.processInfo.systemUptime < deadline
}
func hexColors(_ bytes: [UInt8]) -> [String] {
    stride(from: 0, to: bytes.count - 2, by: 3).map {
        String(format: "#%02x%02x%02x", bytes[$0], bytes[$0 + 1], bytes[$0 + 2])
    }
}
func parseColor(_ value: String) throws -> [UInt8] {
    let s = value.hasPrefix("#") ? String(value.dropFirst()) : value
    guard s.count == 6, s.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "0123456789abcdefABCDEF").contains($0) }),
          let number = UInt32(s, radix: 16) else {
        throw failure("INVALID_COLOR", "Colors must be six hexadecimal digits, for example #ff4080.")
    }
    return [UInt8((number >> 16) & 255), UInt8((number >> 8) & 255), UInt8(number & 255)]
}
func parseColors(_ value: Any?, count: Int) throws -> [UInt8] {
    guard let colors = value as? [String], colors.count == count else {
        throw failure("INVALID_COLORS", "colors must contain exactly \(count) strings in #rrggbb form.")
    }
    return try colors.flatMap(parseColor)
}

enum S4 {
    static let reportSize = 64
    // Air75 V3 D1 returns one byte. The following zero is unencrypted padding,
    // not a high byte: decoding it with key 0x80 turned 104 into 32872.
    static let ledCountLength = 1
    static let allowedCommands: Set<UInt8> = [0xa0, 0xa1, 0xb1, 0xb2, 0xb3, 0xd1, 0xd2, 0xd5, 0xd6, 0xd8]
    // NuPhyIO's Air75 V3 capability table: per-key mode starts at 1.0.16.6;
    // preset shapes extend D5/D6 from 17 to 22 bytes at 1.0.17.6. Keep minor
    // releases open, but require the same protocol family and read-only probes.
    static func stateLength(_ firmware: [UInt8]) -> Int? {
        guard firmware.count == 8, firmware[3] == 0xaa,
              firmware[2] == 1, firmware[4] == 6, firmware[5] == 0 else { return nil }
        return firmware[1] > 0 || firmware[0] >= 17 ? 22 : 17
    }
    static func supportsPerKey(_ firmware: [UInt8]) -> Bool {
        stateLength(firmware) != nil && (firmware[1] > 0 || firmware[0] >= 16)
    }
    static func renderedCustomByte(_ value: UInt8, index: Int, firmware: [UInt8]) -> UInt8 {
        guard stateLength(firmware) == 22 else { return value }
        // 1.0.23.6's palette renderer (0x9bb0) uses HSV value capped at 200
        // (0xce80). The unlabelled final LED additionally scales green/blue.
        let scaled = Int(value) * 200 / 255
        return UInt8(index >= 250 ? scaled * 150 / 255 : scaled)
    }
    static func renderedCustomColors(_ colors: [UInt8], firmware: [UInt8]) -> [UInt8] {
        colors.enumerated().map { renderedCustomByte($0.element, index: $0.offset, firmware: firmware) }
    }
    static func paletteFromRendered(_ colors: [UInt8], firmware: [UInt8], high: Bool = false) throws -> [UInt8] {
        try colors.enumerated().map { index, value in
            let candidates = (0...255).filter { renderedCustomByte(UInt8($0), index: index, firmware: firmware) == value }
            guard let input = high ? candidates.last : candidates.first else {
                throw failure("CUSTOM_BACKUP_LOSSY", "Cannot reconstruct the keyboard's custom palette; original state retained.")
            }
            return UInt8(input)
        }
    }
    static func validGeometry(_ value: [UInt8]) -> Bool {
        value.count == 8 && value[0] <= 1 && Array(value[1...4]) == [8,4,6,16] &&
            (value[5] & 0x80 == 0 || value[5] & 0x7f == 2)
    }
    static func validState(_ state: [UInt8], firmware: [UInt8]) -> Bool {
        guard let length = stateLength(firmware), state.count == length else { return false }
        return state[0] <= (length == 22 ? 22 : 21) && state[1] <= 100 && state[2] <= 4 &&
            state[3] <= 3 && state[4] <= 1 && state[9] <= 4 && state[10] <= 100 &&
            state[11] <= 4 && state[12] <= 1 && (length == 17 || (state[17] <= 7 && state[21] <= 4))
    }
    static func statesMatch(_ expected: [UInt8], _ observed: [UInt8], firmware: [UInt8]) -> Bool {
        guard let length = stateLength(firmware), expected.count == length, observed.count == length else { return false }
        // Official Air75 V3 1.0.16.6: both D6 dispatch tables skip offsets
        // 5 and 13; D5 leaves these palette-index slots unpopulated. They are
        // not restorable configuration. Every other byte remains strict.
        let unusedPaletteSlots = Array(firmware.prefix(6)) == [0x10, 0, 1, 0xaa, 6, 0]
        // 1.0.23.6 D5 now mirrors shape at offset 5, but still never populates
        // offset 13. Its D6 dispatch table skips 13 (official binary 0x44424).
        let unusedSidePalette = Array(firmware.prefix(6)) == [23,0,1,0xaa,6,0]
        return expected.indices.allSatisfy {
            (unusedPaletteSlots && ($0 == 5 || $0 == 13)) || (unusedSidePalette && $0 == 13) || expected[$0] == observed[$0]
        }
    }
    static func checksum(_ bytes: [UInt8]) -> UInt8 {
        bytes.dropFirst(4).reduce(UInt8(0)) { $0 &+ $1 }
    }
    static func stateMismatchCode(expected: [UInt8], observed: [UInt8]) -> String {
        // A disabled board master switch ACKs D6 but skips its setter. Only
        // classify after delayed readback fails, never from zero brightness alone.
        let wantsLight = [17,22].contains(expected.count) && (expected[0] != 0 || expected[1] > 0 || expected[10] > 0)
        let staysOff = observed.count == expected.count && [17,22].contains(observed.count) && observed[0] == 0 && observed[1] == 0 && observed[10] == 0
        return wantsLight && staysOff ? "LIGHTING_DISABLED" : "STATE_VERIFY_FAILED"
    }
    static func restoreTarget(_ state: [UInt8]) -> [UInt8] {
        // D5 can expose mode 0 while the board's master switch is off, but D6
        // does not store mode 0. Restore its visible off state using stock
        // static mode at zero brightness; all remaining fields are preserved.
        guard [17,22].contains(state.count), state[0] == 0, state[1] == 0, state[10] == 0 else { return state }
        var target = state
        target[0] = 2
        return target
    }
    static func frame(command: UInt8, length: Int, address: Int = 0, payload: [UInt8] = [], handle: UInt8 = 0, key: UInt8) throws -> [UInt8] {
        guard allowedCommands.contains(command), (0...56).contains(length), payload.count <= 56,
              (0...65535).contains(address), payload.isEmpty || payload.count == length,
              handle == 0 || (handle == 1 && [0xd5,0xd6,0xd8].contains(command)) else {
            throw failure("INVALID_FRAME", "Command, length, or address is outside the bridge's allowlist.")
        }
        if command == 0xb3 {
            // No generic keymap writer: only standard F4 <-> factory Spotlight,
            // one aligned key in the Mac base layer. Geometry is checked again
            // by the lease before this lower-level envelope can be constructed.
            guard length == 2, address >= 0, address < 192, address % 2 == 0,
                  handle == 0, payload == [0,61] || payload == [126,7] else {
                throw failure("INVALID_FRAME", "Only the journaled factory F4 lease is permitted.")
            }
        }
        var bytes = [UInt8](repeating: 0, count: reportSize)
        bytes[0] = 0x55; bytes[1] = command
        bytes[4] = UInt8(length) ^ key
        bytes[5] = UInt8(address & 255) ^ key
        bytes[6] = UInt8(address >> 8) ^ key
        bytes[7] = handle ^ key // D5/D6 use the board's active Mac (0) / Win (1) profile.
        for (i, value) in payload.enumerated() { bytes[8 + i] = value ^ key }
        bytes[3] = checksum(bytes)
        return bytes
    }
    static func validate(_ raw: [UInt8], command: UInt8) throws {
        guard raw.count == reportSize, raw[0] == 0xaa, raw[1] == command, raw[2] == 0 else {
            throw failure("INVALID_REPLY", "HID response marker, command or report length did not match.")
        }
        guard raw[3] == checksum(raw) else { throw failure("INVALID_CHECKSUM", "HID response checksum did not match.") }
    }
    static func decode(_ raw: [UInt8], command: UInt8, length: Int, address: Int = 0, handle: UInt8 = 0, key: UInt8) throws -> [UInt8] {
        try validate(raw, command: command)
        let route = [UInt8(length), UInt8(address & 255), UInt8(address >> 8), handle]
        let rawRoute = Array(raw[4..<8])
        guard rawRoute == route || rawRoute.map({ $0 ^ key }) == route else {
            throw failure("ROUTE_MISMATCH", "HID response route did not match; another configurator may own the session.")
        }
        return raw[8..<(8 + length)].map { $0 ^ key }
    }
    static func identify(_ raw: [UInt8]) throws -> (UInt8, [UInt8]) {
        try validate(raw, command: 0xa1)
        // The firmware-info marker is a constant AA in payload byte 3.
        // Accept either documented plaintext or XORed routing, without EE.
        let key = raw[11] ^ 0xaa
        let info = try decode(raw, command: 0xa1, length: 8, key: key)
        guard info[3] == 0xaa else { throw failure("FIRMWARE_REPLY", "Unrecognized firmware identification response.") }
        return (key, info)
    }
    static func firmwareVersion(_ info: [UInt8]) -> String {
        guard info.count == 8, info[3] == 0xaa else { return "unknown" }
        // NuPhyIO S4 parseFirmwareVersion: bytes 2.1.0, then little-endian 4–5.
        return "\(info[2]).\(info[1]).\(info[0]).\(Int(info[4]) | Int(info[5]) << 8)"
    }
    static func decodeLEDCount(_ raw: [UInt8], key: UInt8) throws -> Int {
        let payload = try decode(raw, command: 0xd1, length: ledCountLength, key: key)
        let count = Int(payload[0])
        guard count == 104 else {
            throw failure("WRONG_LED_COUNT", "灯位数量校验失败：应为 104，实际为 \(count)。已停止灯效写入。")
        }
        return count
    }
}

struct LightingBackup: Codable {
    var schema = 1
    var createdAt: String
    var vendorID = 0x19f5
    var productID = 0x1028
    var serial: String
    var firmware: [UInt8]
    var state: [UInt8]
    var renderedColors: [UInt8]
    // New firmware persists D8's custom palette after an idle debounce. Keep
    // that palette even when the user was displaying a different stock effect.
    var customColors: [UInt8]? = nil
    // Old releases always addressed Mac profile 0, even when Win was active.
    var lightingProfile: UInt8? = nil
}

// Mac and Win have separate lighting configurations. Retain the inactive
// profile's journal until that profile is selected; never write it to the other.
struct LightingJournals {
    let legacyURL: URL
    func url(_ profile: UInt8) -> URL {
        legacyURL.deletingPathExtension().appendingPathExtension("profile-\(profile).json")
    }
    var profiles: [UInt8] { [UInt8(0), 1].filter { FileManager.default.fileExists(atPath: url($0).path) } }
    var hasLegacy: Bool { FileManager.default.fileExists(atPath: legacyURL.path) }
    func read(_ url: URL, serial: String) throws -> LightingBackup {
        do {
            let record = try JSONDecoder().decode(LightingBackup.self, from: Data(contentsOf: url))
            guard record.schema == 1, record.vendorID == 0x19f5, record.productID == 0x1028,
                  S4.validState(record.state, firmware: record.firmware), record.renderedColors.count == 312,
                  record.customColors == nil || record.customColors?.count == 252,
                  (record.lightingProfile ?? 0) <= 1 else {
                throw failure("INVALID_BACKUP", "The lighting backup has an invalid schema or size.")
            }
            if !record.serial.isEmpty && !serial.isEmpty && record.serial != serial {
                throw failure("BACKUP_DEVICE_MISMATCH", "The pending backup belongs to a different keyboard serial number.")
            }
            return record
        } catch let error as BridgeError { throw error }
        catch { throw failure("BACKUP_READ_FAILED", "Cannot read the existing lighting backup: \(error.localizedDescription)") }
    }
    func migrateLegacy(serial: String) throws {
        guard hasLegacy else { return }
        let record = try read(legacyURL, serial: serial)
        let destination = url(record.lightingProfile ?? 0)
        // moveItem refuses to overwrite an existing journal. On a conflict,
        // retain both originals instead of choosing one and losing recovery.
        do { try FileManager.default.moveItem(at: legacyURL, to: destination) }
        catch { throw failure("BACKUP_MIGRATION_FAILED", "无法整理灯光恢复记录，原始备份已保留。") }
    }
    func archiveBeforeFirmwareChange(_ record: LightingBackup, serial: String) throws -> URL {
        let source = url(record.lightingProfile ?? 0)
        // Validate the durable original again; never discard or overwrite it.
        let durable = try read(source, serial: serial)
        guard durable.firmware == record.firmware else {
            throw failure("INVALID_BACKUP", "The recovery record changed during firmware migration.")
        }
        let directory = source.deletingLastPathComponent().appendingPathComponent("firmware-recovery-history")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let destination = directory.appendingPathComponent("\(source.deletingPathExtension().lastPathComponent)-\(S4.firmwareVersion(record.firmware))-\(UUID().uuidString).json")
        try FileManager.default.moveItem(at: source, to: destination)
        return destination
    }
    func saveCustomColors(_ colors: [UInt8], record: LightingBackup, serial: String) throws -> LightingBackup {
        guard colors.count == 252 else { throw failure("INVALID_BACKUP", "Invalid custom palette size.") }
        let source = url(record.lightingProfile ?? 0)
        let original = try read(source, serial: serial)
        guard original.createdAt == record.createdAt, original.firmware == record.firmware,
              original.state == record.state else { throw failure("INVALID_BACKUP", "The recovery record changed before palette capture.") }
        var updated = original; updated.customColors = colors
        let temporary = source.appendingPathExtension(UUID().uuidString + ".tmp")
        defer { try? FileManager.default.removeItem(at: temporary) }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(updated).write(to: temporary, options: .withoutOverwriting)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: temporary.path)
        let handle = try FileHandle(forWritingTo: temporary)
        do { try handle.synchronize(); try handle.close() } catch { try? handle.close(); throw error }
        guard Darwin.rename(temporary.path, source.path) == 0 else { throw failure("BACKUP_SAVE_FAILED", "Cannot preserve the original custom palette; no RGB frame was sent.") }
        return updated
    }
}

struct FunctionKeyBackup: Codable {
    let firmware: [UInt8]
    let serial: String
    let locationId: Int
    let position: Int
    let original: [Int]
}

final class Air75Device {
    let journals: LightingJournals
    var backupURL: URL { journals.url(lightingProfile) }
    var functionKeyBackupURL: URL { journals.legacyURL.deletingLastPathComponent().appendingPathComponent("function-key-backup.json") }
    private var locationId: Int { testExchange == nil ? device.flatMap { propertyInt($0,kIOHIDLocationIDKey) } ?? 0 : 1 }
    var hasFunctionKeyBackup: Bool { FileManager.default.fileExists(atPath:functionKeyBackupURL.path) }
    private var manager: IOHIDManager?
    private var lockFD: Int32 = -1
    private var device: IOHIDDevice?
    private var inputBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 64)
    private var replies = [[UInt8]]()
    private var removed = false
    private var key: UInt8 = 0
    private var lightingProfile: UInt8 = 0
    private var serial = ""
    private var backup: LightingBackup?
    private var mutationAttempted = false
    private var firstPaintVerified = false
    private var lastPaint: [UInt8]?
    private var lastRGBWriteAt: TimeInterval?
    private var protocolReady = false
    // In-process self-tests can exercise the complete session lifecycle without
    // opening IOKit. No JSON command or environment variable enables this seam.
    private let testExchange: (([UInt8]) throws -> [UInt8])?
    private var testConnected = false
    private(set) var firmware = [UInt8]()
    private(set) var ledCount = 0
    private(set) var armed = false
    var connected: Bool { (testExchange == nil ? device != nil : testConnected) && !removed }
    var ownsChanges: Bool { mutationAttempted }
    var recoveryPending: Bool { backup != nil || journals.hasLegacy || FileManager.default.fileExists(atPath: backupURL.path) }
    var deferredProfiles: [UInt8] { journals.profiles.filter { $0 != lightingProfile } }
    var hasPendingBackups: Bool { recoveryPending || !deferredProfiles.isEmpty }

    init(backupURL: URL, testExchange: (([UInt8]) throws -> [UInt8])? = nil) {
        journals = LightingJournals(legacyURL: backupURL)
        self.testExchange = testExchange
    }
    deinit { closeTransport(); inputBuffer.deallocate() }

    func receive(_ report: UnsafeMutablePointer<UInt8>, count: Int, result: IOReturn, reportID: UInt32) {
        guard result == kIOReturnSuccess, count == 64, reportID == 0 else { return }
        replies.append(Array(UnsafeBufferPointer(start: report, count: count)))
        if replies.count > 64 { replies.removeFirst(replies.count - 64) }
    }
    func didRemove() {
        removed = true; armed = false
        emit(["event": "disconnected", "needsRestore": recoveryPending,
              "message": "Keyboard disconnected; its lighting backup has been retained."])
    }
    private func propertyInt(_ device: IOHIDDevice, _ name: String) -> Int? {
        (IOHIDDeviceGetProperty(device, name as CFString) as? NSNumber)?.intValue
    }
    private func requireConnected() throws {
        guard connected else { throw failure("NOT_CONNECTED", "Connect the Air75 V3 by USB first.") }
    }
    private func openTransport() throws {
        closeTransport()
        if testExchange != nil { testConnected = true; serial = "self-test"; return }
        lockFD = Darwin.open("/tmp/air75-studio-hid-\(getuid()).lock", O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else {
            if lockFD >= 0 { Darwin.close(lockFD); lockFD = -1 }
            throw failure("HID_IN_USE", "Another Air75 Studio helper already owns the keyboard connection.")
        }
        let m = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        manager = m
        let match: [String: Any] = [kIOHIDVendorIDKey: 0x19f5, kIOHIDProductIDKey: 0x1028, kIOHIDTransportKey:"USB",
                                   kIOHIDPrimaryUsagePageKey: 1, kIOHIDPrimaryUsageKey: 0]
        IOHIDManagerSetDeviceMatching(m, match as CFDictionary)
        IOHIDManagerScheduleWithRunLoop(m, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
        let opened = IOHIDManagerOpen(m, IOOptionBits(kIOHIDOptionsTypeNone))
        guard opened == kIOReturnSuccess else {
            closeTransport()
            throw failure("HID_PERMISSION", "Cannot open the vendor HID interface (\(String(format: "0x%08x", opened))). Check Input Monitoring and close NuPhyIO.")
        }
        guard let all = IOHIDManagerCopyDevices(m) as? Set<IOHIDDevice> else {
            closeTransport(); throw failure("DEVICE_NOT_FOUND", "等待 Air75 V3 ANSI：请连接数据线，并将键盘切到有线模式。")
        }
        let matches = all.filter {
            propertyInt($0, kIOHIDVendorIDKey) == 0x19f5 && propertyInt($0, kIOHIDProductIDKey) == 0x1028 &&
            propertyInt($0, kIOHIDPrimaryUsagePageKey) == 1 && propertyInt($0, kIOHIDPrimaryUsageKey) == 0 &&
            propertyInt($0, kIOHIDMaxInputReportSizeKey) == 64 && propertyInt($0, kIOHIDMaxOutputReportSizeKey) == 64
        }
        guard !matches.isEmpty else {
            closeTransport(); throw failure("DEVICE_NOT_FOUND", "等待 Air75 V3 ANSI：请连接数据线，并将键盘切到有线模式。")
        }
        guard matches.count == 1, let selected = matches.first else {
            closeTransport()
            throw failure("DEVICE_AMBIGUOUS", "检测到多把 Air75 V3，请仅连接要使用的一把。")
        }
        device = selected; removed = false
        serial = IOHIDDeviceGetProperty(selected, kIOHIDSerialNumberKey as CFString) as? String ?? ""
        let context = Unmanaged.passUnretained(self).toOpaque()
        IOHIDDeviceRegisterInputReportCallback(selected, inputBuffer, 64, { context, result, _, _, reportID, report, count in
            guard let context = context else { return }
            Unmanaged<Air75Device>.fromOpaque(context).takeUnretainedValue().receive(report, count: count, result: result, reportID: reportID)
        }, context)
        IOHIDDeviceRegisterRemovalCallback(selected, { context, _, _ in
            guard let context = context else { return }
            Unmanaged<Air75Device>.fromOpaque(context).takeUnretainedValue().didRemove()
        }, context)
        pump(0.02)
    }
    private func closeTransport() {
        if let d = device {
            IOHIDDeviceRegisterInputReportCallback(d, inputBuffer, 64, nil, nil)
            IOHIDDeviceRegisterRemovalCallback(d, nil, nil)
        }
        if let m = manager {
            IOHIDManagerUnscheduleFromRunLoop(m, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
            IOHIDManagerClose(m, IOOptionBits(kIOHIDOptionsTypeNone))
        }
        device = nil; manager = nil; replies.removeAll(); removed = false; armed = false; lastRGBWriteAt = nil; protocolReady = false
        testConnected = false
        if lockFD >= 0 { flock(lockFD, LOCK_UN); Darwin.close(lockFD); lockFD = -1 }
    }
    private func exchange(_ frame: [UInt8], timeout: TimeInterval = 0.65) throws -> [UInt8] {
        try requireConnected()
        if let testExchange = testExchange { return try testExchange(frame) }
        guard let d = device else { throw failure("NOT_CONNECTED", "Connect the Air75 V3 by USB first.") }
        // Flush already delivered reports. Never resend an uncertain write or
        // send undocumented opcodes to unstick a desynchronized session.
        pump(0.001)
        replies.removeAll(keepingCapacity: true)
        let sent = frame.withUnsafeBufferPointer {
            IOHIDDeviceSetReport(d, kIOHIDReportTypeOutput, CFIndex(0), $0.baseAddress!, 64)
        }
        guard sent == kIOReturnSuccess else {
            throw failure("HID_WRITE_FAILED", "HID output failed (\(String(format: "0x%08x", sent))); reconnect the cable and close other lighting apps.")
        }
        let deadline = ProcessInfo.processInfo.systemUptime + timeout
        while ProcessInfo.processInfo.systemUptime < deadline {
            if removed { throw failure("DISCONNECTED", "Keyboard unplugged during a transaction; backup retained.") }
            while !replies.isEmpty {
                let reply = replies.removeFirst()
                if reply.count == 64, reply[0] == 0xaa, reply[1] == frame[1] {
                    try S4.validate(reply, command: frame[1])
                    return reply
                }
            }
            _ = CFRunLoopRunInMode(.defaultMode, 0.002, true)
        }
        throw failure("HID_TIMEOUT", "No valid \(String(format: "%02X", frame[1])) response. Stop other HID clients and reconnect; no blind write retry was performed.")
    }
    private func request(_ command: UInt8, length: Int, address: Int = 0, payload: [UInt8] = []) throws -> [UInt8] {
        let handle = [UInt8(0xd5),0xd6,0xd8].contains(command) ? lightingProfile : 0
        let frame = try S4.frame(command: command, length: length, address: address, payload: payload, handle: handle, key: key)
        let raw = try exchange(frame)
        return try S4.decode(raw, command: command, length: length, address: address, handle: handle, key: key)
    }
    private func refreshLightingProfile() throws {
        let geometry = try request(0xa0, length: 8)
        guard S4.validGeometry(geometry) else { throw failure("UNSUPPORTED_PROTOCOL", "键盘协议结构已改变，请更新 NuPhyLab 后重试。未修改键盘设置。") }
        lightingProfile = geometry[0]
    }
    private func verifyLightingProfileForWrite() throws {
        try refreshLightingProfile()
        if let saved = backup, Array(saved.firmware.prefix(6)) != Array(firmware.prefix(6)) {
            armed = false
            throw failure("BACKUP_FIRMWARE_MISMATCH", "固件与恢复记录不一致，已保留备份并停止写入。请重新连接键盘。")
        }
        if let saved = backup, (saved.lightingProfile ?? 0) != lightingProfile {
            armed = false
            throw failure("LIGHTING_PROFILE_CHANGED", "键盘档位已改变，请重新播放灯效。")
        }
    }
    private func selectRecoveryProfile(reconnected: Bool = false) throws {
        try journals.migrateLegacy(serial: serial)
        if let saved = backup, (saved.lightingProfile ?? 0) != lightingProfile {
            // The old profile's durable journal stays on disk. Drop only the
            // live ownership, so a new session can use its own profile safely.
            backup = nil; mutationAttempted = false; armed = false
            firstPaintVerified = false; lastPaint = nil
        }
        if backup == nil, FileManager.default.fileExists(atPath: backupURL.path) {
            backup = try loadBackup()
        }
        if let saved = backup, Array(saved.firmware.prefix(6)) != Array(firmware.prefix(6)) {
            guard protocolReady, !mutationAttempted || reconnected else {
                throw failure("BACKUP_FIRMWARE_MISMATCH", "固件与恢复记录不一致，已保留备份并停止写入。请重新连接键盘。")
            }
            // Firmware updates can change the configuration schema. Keep the
            // old journal as history instead of writing old settings into the
            // new firmware. Its currently read settings become the new baseline.
            let archived = try journals.archiveBeforeFirmwareChange(saved, serial: serial)
            diagnostic("Prior firmware recovery record preserved at \(archived.path)")
            backup = nil; mutationAttempted = false; armed = false
            firstPaintVerified = false; lastPaint = nil; lastRGBWriteAt = nil
        }
    }
    private func identify() throws {
        let initial = try S4.frame(command: 0xa1, length: 8, key: 0)
        let raw = try exchange(initial)
        let (newKey, newFirmware) = try S4.identify(raw)
        // Trailing A1 bytes are reserved/session data, not the firmware version.
        if Array(firmware.prefix(6)) != Array(newFirmware.prefix(6)) { protocolReady = false }
        key = newKey; firmware = newFirmware
        let countFrame = try S4.frame(command: 0xd1, length: S4.ledCountLength, key: key)
        ledCount = try S4.decodeLEDCount(try exchange(countFrame), key: key)
    }
    func connect() throws -> [String: Any] {
        if !connected {
            try openTransport()
        }
        // A separate configurator may have changed the in-RAM session key.
        // Refresh it using read-only A1 rather than mutating the key with EE.
        do { try identify() } catch { closeTransport(); throw error }
        let state = try readState()
        _ = try readRGB() // Validate the complete D2 route before allowing writes.
        protocolReady = true
        // A successfully reprobed firmware is a new lighting session even if
        // this helper controlled the pre-upgrade firmware. Retire that ownership
        // only here, after A1/A0/D1/D5/D2 all validate; status/restore still block.
        try selectRecoveryProfile(reconnected: true)
        if hasFunctionKeyBackup { _ = try restoreFunctionKey() }
        return ["connected": true, "firmware": firmware, "firmwareHex": firmware.map { String(format: "%02x", $0) }.joined(separator: " "),
                "firmwareVersion": S4.firmwareVersion(firmware), "ledCount": ledCount,
                "model": "Air75 V3 ANSI", "vendorId": 0x19f5, "productId": 0x1028, "transport": "USB",
                "keyLedCount": 84, "sideLedCount": 20, "sideIndependent": false, "originalState": state,
                "state": state, "lightingProfile": lightingProfile, "armed": armed, "needsRestore": recoveryPending, "recoveryPending": recoveryPending, "deferredProfiles": deferredProfiles, "backupPath": backupURL.path,
                "capabilities": capabilities]
    }
    private var capabilities: [String: Any] {
        ["perKey": protocolReady && S4.supportsPerKey(firmware), "sideWholeZone": protocolReady,
         "sidePixels": false, "protocol": "air75-s4", "stateBytes": S4.stateLength(firmware) ?? 0,
         "readProbeVerified": protocolReady]
    }
    func status() throws -> [String: Any] {
        var state: [UInt8]?
        if connected { state = try readState(); try selectRecoveryProfile() }
        var result: [String: Any] = ["connected": connected, "armed": armed, "needsRestore": recoveryPending,
                                     "recoveryPending": recoveryPending, "deferredProfiles": deferredProfiles, "backupPath": backupURL.path,
                                     "firmware": firmware, "ledCount": ledCount, "error": NSNull(),
                                     "permissions": permissionSnapshot()]
        if connected {
            result["state"] = state
            result["lightingProfile"] = lightingProfile
            result["firmwareVersion"] = S4.firmwareVersion(firmware)
            result["capabilities"] = capabilities
        }
        return result
    }
    func readState() throws -> [UInt8] {
        try refreshLightingProfile()
        guard let length = S4.stateLength(firmware) else {
            throw failure("UNSUPPORTED_PROTOCOL", "键盘协议结构已改变，请更新 NuPhyLab 后重试。未修改键盘设置。")
        }
        let state = try request(0xd5, length: length)
        guard S4.validState(state, firmware: firmware) else {
            protocolReady = false
            throw failure("UNSUPPORTED_PROTOCOL", "键盘协议结构已改变，请更新 NuPhyLab 后重试。未修改键盘设置。")
        }
        return state
    }
    private func keyLayer(_ command: UInt8, _ layer: Int) throws -> [Int] {
        var bytes = [UInt8]()
        while bytes.count < 196 {
            bytes += try request(command,length:min(56,196-bytes.count),address:layer*196+bytes.count)
        }
        return stride(from:0,to:196,by:2).map { Int(bytes[$0]) << 8 | Int(bytes[$0+1]) }
    }
    // This operation itself is read-only, including while F4 is leased.
    func readKeymap() throws -> [String: Any] {
        try requireConnected();try identify()
        let geometry = try request(0xa0,length:8)
        guard S4.validGeometry(geometry) else { throw failure("KEYMAP_UNSUPPORTED", "此键盘的键位结构尚不支持自动适配。") }
        let active = try keyLayer(0xb2,Int(geometry[0])*4)
        let defaults = try [keyLayer(0xb1,0),keyLayer(0xb1,4)]
        guard try request(0xa0,length:8) == geometry else { throw failure("KEYMAP_CHANGED", "键盘模式已改变，请重新适配。") }
        return ["mode":Int(geometry[0]),"active":active,"defaults":defaults,"locationId":locationId,
                "firmwareVersion":S4.firmwareVersion(firmware),"readOnly":true,
                "geometryVerified":true,"protocol":"air75-s4-keymap","functionKeyLease":hasFunctionKeyBackup]
    }
    private func loadFunctionKeyBackup() throws -> FunctionKeyBackup {
        let record:FunctionKeyBackup
        do { record = try JSONDecoder().decode(FunctionKeyBackup.self,from:Data(contentsOf:functionKeyBackupURL)) }
        catch { throw failure("KEY_LEASE_BACKUP", "F4 原键位备份无法读取，已保留文件并停止修改。") }
        guard record.firmware.count == 6,record.locationId > 0,(0..<96).contains(record.position),
              record.original.count == 98,record.original.allSatisfy({(0...65535).contains($0)}),
              record.original[record.position] == 32263 else {
            throw failure("KEY_LEASE_BACKUP", "F4 原键位备份格式无效，已停止修改。")
        }
        return record
    }
    private func writeFunctionKey(_ position:Int,_ value:Int) throws {
        guard (0..<96).contains(position),[61,32263].contains(value) else { throw failure("KEY_LEASE_INVALID", "Invalid F4 lease.") }
        let bytes=[UInt8(value >> 8),UInt8(value & 255)]
        _ = try request(0xb3,length:2,address:position*2,payload:bytes)
        // The ACK can precede the keymap commit. Read again, never blind-retry a write.
        for attempt in 0..<5 {
            if attempt > 0 {pump(0.04)}
            let read = try request(0xb2,length:2,address:position*2)
            if read == bytes {return}
        }
        throw failure("KEY_LEASE_VERIFY", "F4 配置未通过回读检查，原键位备份已保留。")
    }
    func prepareFunctionKey() throws -> [String:Any] {
        let map = try readKeymap()
        guard let mode=map["mode"] as? Int,let active=map["active"] as? [Int],let defaults=map["defaults"] as? [[Int]],
              let position=defaults[1].firstIndex(of:61),defaults[1].lastIndex(of:61)==position,position<96 else {
            throw failure("KEYMAP_UNSUPPORTED", "无法确认 F4 的物理位置。")
        }
        if hasFunctionKeyBackup {
            let saved = try loadFunctionKeyBackup()
            guard mode==0,saved.serial==serial,saved.locationId==locationId,
                  saved.firmware==Array(firmware.prefix(6)),saved.position==position,
                  active[position]==61,active.indices.allSatisfy({$0==position || active[$0]==saved.original[$0]}) else {
                throw failure("KEY_LEASE_CHANGED", "键盘配置已改变，请关闭模式并恢复原键位后重试。")
            }
            return ["leased":true,"verified":true]
        }
        guard mode==0,active[position]==32263,defaults[0][position]==32263 else {
            return ["leased":false,"verified":true]
        }
        guard protocolReady,S4.supportsPerKey(firmware),locationId>0 else { throw failure("KEYMAP_UNSUPPORTED", "键盘未通过功能键兼容检查。") }
        let record=FunctionKeyBackup(firmware:Array(firmware.prefix(6)),serial:serial,locationId:locationId,position:position,original:active)
        try FileManager.default.createDirectory(at:functionKeyBackupURL.deletingLastPathComponent(),withIntermediateDirectories:true)
        try JSONEncoder().encode(record).write(to:functionKeyBackupURL,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:functionKeyBackupURL.path)
        do { try writeFunctionKey(position,61) }
        catch { _ = try? restoreFunctionKey();throw error }
        return ["leased":true,"verified":true]
    }
    func restoreFunctionKey() throws -> [String:Any] {
        guard hasFunctionKeyBackup else {return ["restored":true]}
        guard connected else {return ["restored":false,"deferred":true]}
        let saved=try loadFunctionKeyBackup(),map=try readKeymap()
        guard let defaults=map["defaults"] as? [[Int]],defaults[1][saved.position]==61,
              defaults[0][saved.position]==32263,saved.serial==serial,saved.locationId==locationId else {
            throw failure("KEY_LEASE_DEVICE", "请将原键盘接回原 USB 接口以恢复 F4。备份已保留。")
        }
        let current = try keyLayer(0xb2,0)
        if current[saved.position]==61 {
            guard saved.firmware==Array(firmware.prefix(6)),current.indices.allSatisfy({$0==saved.position || current[$0]==saved.original[$0]}) else {
                throw failure("KEY_LEASE_CHANGED", "键盘配置已改变，F4 原键位备份已保留，未覆盖新配置。")
            }
            try writeFunctionKey(saved.position,32263)
        } else if current[saved.position] != 32263 {
            // Another configurator deliberately replaced F4. Preserve its edit
            // and retain our exact old record in history instead of overwriting.
            let dir=functionKeyBackupURL.deletingLastPathComponent().appendingPathComponent("key-recovery-history")
            try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
            try FileManager.default.moveItem(at:functionKeyBackupURL,to:dir.appendingPathComponent("function-key-\(UUID().uuidString).json"))
            return ["restored":true,"externalChangePreserved":true]
        }
        try FileManager.default.removeItem(at:functionKeyBackupURL)
        return ["restored":true,"verified":true]
    }
    func readRGB() throws -> [UInt8] {
        _ = try requireConnected()
        // D8 acknowledgement precedes the firmware's rendered D2 buffer update.
        // Reading immediately can mix 18 old LEDs with the rest of the new frame.
        // Wait only on diagnostic reads; ordinary animation writes stay unblocked.
        if let writtenAt = lastRGBWriteAt {
            let remaining = writtenAt + 0.045 - ProcessInfo.processInfo.systemUptime
            if remaining > 0 { pump(remaining) }
        }
        var bytes = [UInt8]()
        while bytes.count < 312 {
            let count = min(54, 312 - bytes.count)
            bytes += try request(0xd2, length: count, address: bytes.count)
            if bytes.count < 312 { pump(0.008) }
        }
        return bytes
    }
    private func loadBackup() throws -> LightingBackup {
        let record = try journals.read(backupURL, serial: serial)
        guard (record.lightingProfile ?? 0) == lightingProfile else {
            throw failure("INVALID_BACKUP", "The lighting backup does not belong to this profile.")
        }
        return record
    }
    private func ensureBackup() throws {
        _ = try requireConnected()
        if mutationAttempted, backup != nil { return }
        guard !recoveryPending else {
            throw failure("RECOVERY_REQUIRED", "A previous lighting backup exists. Call restore before starting another lighting session.")
        }
        guard protocolReady, S4.supportsPerKey(firmware) else { throw failure("UNVERIFIED_FIRMWARE", "此固件未通过逐键灯效能力检查，请检查固件或更新 NuPhyLab。") }
        let state = try readState()
        let capturedProfile = lightingProfile
        guard state[9] <= 4 else { throw failure("UNSUPPORTED_SIDE_MODE", "The current side mode is outside the five stock modes; no configuration was changed.") }
        if state.count == 17 && state[0] == 21 && state[1] != 100 {
            throw failure("CUSTOM_BACKUP_LOSSY", "Another custom renderer is active below 100% brightness. Its original RAM values cannot be recovered exactly; select a stock effect first.")
        }
        let colors = try readRGB()
        try refreshLightingProfile()
        guard capturedProfile == lightingProfile else {
            throw failure("LIGHTING_PROFILE_CHANGED", "键盘档位已改变，请重新播放灯效。")
        }
        let record = LightingBackup(createdAt: ISO8601DateFormatter().string(from: Date()), serial: serial,
                                    firmware: firmware, state: state, renderedColors: colors, lightingProfile: lightingProfile)
        do {
            try FileManager.default.createDirectory(at: backupURL.deletingLastPathComponent(), withIntermediateDirectories: true,
                                                    attributes: [.posixPermissions: 0o700])
            // Exclusive creation prevents two bridges from replacing the original.
            let fd = Darwin.open(backupURL.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, S_IRUSR | S_IWUSR)
            guard fd >= 0 else { throw failure("BACKUP_CREATE_FAILED", "Cannot exclusively create backup; another lighting session may be active.") }
            let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
            do {
                let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                try handle.write(contentsOf: encoder.encode(record))
                try handle.synchronize()
                try handle.close()
            } catch {
                try? handle.close()
                // A failed backup is retained for review; no device write follows.
                throw error
            }
            backup = record
        } catch let error as BridgeError { throw error }
        catch { throw failure("BACKUP_SAVE_FAILED", "No lighting was changed because the backup could not be saved: \(error.localizedDescription)") }
    }
    private func writeStateVerified(_ state: [UInt8]) throws {
        try verifyLightingProfileForWrite()
        guard S4.validState(state, firmware: firmware) else {
            throw failure("INVALID_STATE", "Refusing an invalid or non-stock side-light state.")
        }
        // On this verified firmware the full-state setter applies all fields.
        // A separate brightness-only commit experimentally changed saved RGB
        // 190/174 into 191/175, so it must NOT be used for exact restoration.
        let initialEcho = try request(0xd6, length: state.count, payload: state)
        guard initialEcho == state else { throw failure("STATE_ACK_MISMATCH", "D6 did not echo the complete lighting state.") }
        pump(0.12)
        var lastRead = [UInt8]()
        for attempt in 0..<5 {
            lastRead = try readState()
            if S4.statesMatch(state, lastRead, firmware: firmware) { return }
            if attempt < 4 { pump(0.12) }
        }
        diagnostic("D6 verify expected=\(state) actual=\(lastRead)")
        throw failure(S4.stateMismatchCode(expected: state, observed: lastRead), "D5 mismatch: expected \(state), observed \(lastRead).")
    }
    func arm() throws -> [String: Any] {
        if armed { return ["armed": true, "backupPath": backupURL.path, "alreadyArmed": true] }
        try ensureBackup()
        var next = try readState()
        next[0] = 21; next[1] = 100; next[4] = 1
        // New firmware renders the stored palette through the main colour's
        // value as well as brightness. Use white while owning per-key output.
        if next.count == 22 { next.replaceSubrange(6..<9, with: [255,255,255]) }
        mutationAttempted = true
        do {
            try writeStateVerified(next)
            if next.count == 22, let saved = backup, saved.customColors == nil {
                // Capture the board's loaded custom palette before the first
                // D8 can change it. The state-only journal already protects
                // crashes during this temporary switch to custom mode.
                let custom = try S4.paletteFromRendered(Array(try readRGB().prefix(252)), firmware: firmware)
                backup = try journals.saveCustomColors(custom, record: saved, serial: serial)
            }
            armed = true; firstPaintVerified = false; lastPaint = nil
            return ["armed": true, "state": next, "backupPath": backupURL.path, "verified": true]
        } catch { throw rollbackError(error) }
    }
    private func writeRGB(_ colors: [UInt8]) throws {
        try verifyLightingProfileForWrite()
        guard colors.count == 252 else { throw failure("INVALID_COLORS", "Expected RGB data for 84 keys.") }
        for start in stride(from: 0, to: 84, by: 13) {
            let end = min(start + 13, 84)
            var records = [UInt8]()
            for index in start..<end { records += [UInt8(index)] + Array(colors[(index * 3)..<(index * 3 + 3)]) }
            let echoed = try request(0xd8, length: records.count, payload: records)
            guard echoed == records else { throw failure("COLOR_ACK_MISMATCH", "D8 did not echo the complete indexed RGB records.") }
        }
        lastRGBWriteAt = ProcessInfo.processInfo.systemUptime
    }
    func paint(_ colors: [UInt8], verify: Bool) throws -> [String: Any] {
        guard armed else { throw failure("NOT_ARMED", "Call arm before painting the 84 key LEDs.") }
        if colors == lastPaint && !verify { return ["painted": 84, "skipped": true, "verification": "unchanged"] }
        do {
            let fullVerification = verify || !firstPaintVerified
            try writeRGB(colors)
            if fullVerification {
                let rendered = try readRGB()
                let expected = S4.renderedCustomColors(colors, firmware: firmware)
                guard Array(rendered.prefix(252)) == expected else {
                    let mismatches = expected.indices.filter { rendered[$0] != expected[$0] }
                    diagnostic("D2 verify firmware=\(S4.firmwareVersion(firmware)) mismatchedChannels=\(mismatches.count) samples=\(mismatches.prefix(12).map { "\($0):\(expected[$0])->\(rendered[$0])" }.joined(separator: ","))")
                    throw failure("COLOR_VERIFY_FAILED", "D2 did not show the requested key colors; original lighting will be restored.")
                }
                firstPaintVerified = true
            }
            lastPaint = colors
            return ["painted": 84, "skipped": false, "verification": fullVerification ? "readback" : "validatedAck"]
        } catch { throw rollbackError(error) }
    }
    func setSide(color: [UInt8], brightness: Int) throws -> [String: Any] {
        guard color.count == 3, (0...100).contains(brightness) else { throw failure("INVALID_SIDE", "side brightness must be an integer from 0 to 100.") }
        var state = try readState()
        state[9] = 2; state[10] = UInt8(brightness); state[12] = 0; state[13] = 0
        state.replaceSubrange(14..<17, with: color)
        if S4.statesMatch(state, try readState(), firmware: firmware) { return ["sideIndependent": false, "changed": false, "state": state] }
        try ensureBackup()
        mutationAttempted = true
        do {
            try writeStateVerified(state)
            return ["sideIndependent": false, "changed": true, "state": state, "verified": true]
        } catch { throw rollbackError(error) }
    }
    func restoreSide() throws -> [String: Any] {
        _ = try requireConnected()
        guard let saved = backup else { return ["changed": false, "reason": "noBackup", "sideIndependent": false] }
        var state = try readState()
        state.replaceSubrange(9..<17, with: saved.state[9..<17])
        if S4.statesMatch(state, try readState(), firmware: firmware) { return ["changed": false, "state": state, "sideIndependent": false] }
        mutationAttempted = true
        do {
            try writeStateVerified(state)
            return ["changed": true, "restored": true, "verified": true, "state": state, "sideIndependent": false]
        } catch { throw rollbackError(error) }
    }
    private func rollbackError(_ original: Error) -> BridgeError {
        if let error = original as? BridgeError, error.code == "LIGHTING_PROFILE_CHANGED" { return error }
        do {
            _ = try restore()
            return failure((original as? BridgeError)?.code ?? "LIGHTING_FAILED", "\(original). Original lighting was restored and verified.")
        } catch {
            return failure("RESTORE_REQUIRED", "Lighting operation failed: \(original). Restoration also failed: \(error). Backup retained at \(backupURL.path).")
        }
    }
    func restore() throws -> [String: Any] {
        if !connected, hasPendingBackups { _ = try connect() }
        else if connected { try identify(); _ = try readState(); try selectRecoveryProfile() }
        guard recoveryPending else { return ["restored": false, "reason": "noBackupForCurrentProfile", "verified": true, "needsRestore": false, "recoveryPending": false, "deferredProfiles": deferredProfiles] }
        let saved: LightingBackup
        if let current = backup { saved = current } else { saved = try loadBackup(); backup = saved }
        try verifyLightingProfileForWrite()
        guard Array(saved.firmware.prefix(6)) == Array(firmware.prefix(6)) else {
            throw failure("BACKUP_FIRMWARE_MISMATCH", "Firmware changed since the backup. Refusing to restore an unverified configuration.")
        }
        mutationAttempted = true
        if saved.state.count == 17 && saved.state[0] == 21 {
            guard saved.state[1] == 100 else { throw failure("CUSTOM_BACKUP_LOSSY", "Cannot exactly restore a dimmed custom framebuffer.") }
        }
        let custom = saved.customColors ?? (saved.state[0] == 21 ? Array(saved.renderedColors.prefix(252)) : nil)
        if let colors = custom {
            var current = try readState()
            var fullPalette = current
            fullPalette[0] = 21; fullPalette[1] = 100; fullPalette[4] = 1
            if current.count == 22 { fullPalette.replaceSubrange(6..<9, with: [255,255,255]) }
            if current != fullPalette {
                current = fullPalette
                try writeStateVerified(fullPalette)
            }
            try writeRGB(colors)
            // The inspected new firmware debounces palette persistence for
            // one second. Leave that idle window before completing recovery.
            if saved.customColors != nil { pump(1.15) }
            guard Array(try readRGB().prefix(252)) == S4.renderedCustomColors(colors, firmware: firmware) else {
                throw failure("RESTORE_COLOR_MISMATCH", "The original custom palette did not verify. Backup retained.")
            }
        }
        var target = S4.restoreTarget(saved.state)
        let restoresOff = target != saved.state
        if restoresOff, S4.statesMatch(saved.state, try readState(), firmware: firmware) {
            // A rejected arm may have left the board switched off throughout.
            // No write is needed to restore an already unchanged state.
            target = saved.state
        } else { try writeStateVerified(target) }
        if restoresOff {
            let rendered = try readRGB()
            guard rendered.allSatisfy({ $0 == 0 }) else {
                throw failure("RESTORE_COLOR_MISMATCH", "The prior off state did not render completely dark. Backup retained.")
            }
        }
        if saved.state[0] == 21 {
            pump(0.04)
            var actual = try readRGB()
            if let captured = saved.customColors, saved.state.count == 22,
               Array(actual.prefix(252)) != Array(saved.renderedColors.prefix(252)) {
                // D2 is quantized. Try the other end of each identical-output
                // interval only where the original dimmed output needs it.
                let full = S4.renderedCustomColors(captured, firmware: firmware)
                let upper = try S4.paletteFromRendered(full, firmware: firmware, high: true)
                var adjusted = captured
                for i in adjusted.indices where actual[i] != saved.renderedColors[i] { adjusted[i] = upper[i] }
                try writeRGB(adjusted); pump(1.15)
                actual = try readRGB()
            }
            guard Array(actual.prefix(252)) == Array(saved.renderedColors.prefix(252)) else {
                throw failure("RESTORE_COLOR_MISMATCH", "State restored, but the prior custom key colors did not verify. Backup retained.")
            }
        }
        let observed = try readState()
        guard S4.statesMatch(target, observed, firmware: firmware) else {
            throw failure("RESTORE_STATE_MISMATCH", "Lighting state changed during restoration. Backup retained.")
        }
        // A moving stock effect will not reproduce an old frame. D5 verifies
        // its complete configuration; D2 is required for an original custom frame.
        do { try FileManager.default.removeItem(at: backupURL) }
        catch { throw failure("BACKUP_CLEANUP_FAILED", "Lighting is verified restored, but the backup could not be removed: \(error.localizedDescription)") }
        backup = nil; mutationAttempted = false; armed = false; firstPaintVerified = false; lastPaint = nil
        return ["restored": true, "verified": true, "state": observed, "needsRestore": false, "recoveryPending": false, "deferredProfiles": deferredProfiles,
                "verification": restoresOff ? "allLightsOff" : (saved.state[0] == 21 ? "stateAndCustomColors" : "completeState")]
    }
    func disconnect() throws -> [String: Any] {
        var restored: [String: Any] = ["restored": false]
        if mutationAttempted { restored = try restore() }
        closeTransport()
        return ["connected": false, "restoration": restored, "recoveryPending": recoveryPending]
    }
    func shutdown() -> Bool {
        var ok = true
        if mutationAttempted {
            do {
                if !connected {
                    // USB removal makes restoration impossible. A validated
                    // durable journal is a safe deferred exit, not a restore.
                    let saved = try backup ?? loadBackup()
                    let retainedURL = journals.url(saved.lightingProfile ?? 0)
                    _ = try journals.read(retainedURL, serial: serial)
                    emit(["event": "restoreDeferred", "reason": "disconnected", "backupPath": retainedURL.path])
                } else {
                    let result = try restore(); emit(["event": "restoredOnExit", "result": result])
                }
            }
            catch { ok = false; diagnostic("RESTORE REQUIRED: \(error)"); emit(["event": "restoreFailed", "error": String(describing: error), "backupPath": backupURL.path]) }
        }
        closeTransport()
        return ok
    }
}

struct KeyBinding {
    let name: String
    let code: Int
    let flags: CGEventFlags
    let suppress: Bool
}

// A global hold needs real modifier transitions as well as a keyDown/keyUp.
// Codex's native release watcher observes the global event stream; posting an
// up directly to one PID leaves that watcher holding the shortcut forever.
struct ShortcutChord {
    struct Step {
        let code: CGKeyCode
        let type: CGEventType
        let flags: CGEventFlags
    }
    static let modifiers: [(CGEventFlags, CGKeyCode)] = [(.maskControl,59),(.maskShift,56),(.maskAlternate,58),(.maskCommand,55),(.maskSecondaryFn,63)]
    let down: [Step]
    let up: [Step]
    init(code: CGKeyCode, flags: CGEventFlags, modifierOnly: Bool, alreadyHeld: CGEventFlags) {
        var current = alreadyHeld
        var press = [Step](), release = [Step]()
        let owned = Self.modifiers.filter { flags.contains($0.0) && !alreadyHeld.contains($0.0) }
        for (flag,key) in owned {
            current.insert(flag); press.append(Step(code:key,type:.flagsChanged,flags:current))
        }
        if !modifierOnly {
            press.append(Step(code:code,type:.keyDown,flags:current))
            release.append(Step(code:code,type:.keyUp,flags:current))
        }
        for (flag,key) in owned.reversed() {
            current.remove(flag); release.append(Step(code:key,type:.flagsChanged,flags:current))
        }
        down = press; up = release
    }
}
final class KeyHooks {
    private struct HeldShortcut {
        let code: CGKeyCode
        let flags: CGEventFlags
        let pid: pid_t
        let globalRelease: [CGEvent]?
    }
    private var heldShortcut: HeldShortcut?
    private var releaseTimer: DispatchWorkItem?
    @discardableResult func releaseShortcut() -> Bool {
        releaseTimer?.cancel(); releaseTimer = nil
        guard let held = heldShortcut else { return false }
        heldShortcut = nil
        if let events = held.globalRelease {
            for event in events { event.post(tap:.cghidEventTap) }
        } else if let up = CGEvent(keyboardEventSource: nil, virtualKey: held.code, keyDown: false) {
            up.flags = held.flags
            // Finish only in the original app, even when the user changed focus.
            up.postToPid(held.pid)
        }
        return true
    }
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var bindings = [KeyBinding]()
    // Only the agreed Ctrl+Option+1…6 and Ctrl+Option+N combinations.
    // Arrow keys belong to the editor's focused game view, never a global tap.
    static let allowedMonitorCodes: Set<Int> = [18,19,20,21,23,22,45]
    static let modifierMask: CGEventFlags = [.maskCommand, .maskShift, .maskAlternate, .maskControl]
    static func flags(_ names: Any?) throws -> CGEventFlags {
        guard names == nil || names is [String] else { throw failure("INVALID_MODIFIERS", "modifiers must be an array of command, shift, option, control or fn.") }
        var result: CGEventFlags = []
        for name in names as? [String] ?? [] {
            switch name.lowercased() {
            case "command", "cmd": result.insert(.maskCommand)
            case "shift": result.insert(.maskShift)
            case "option", "alt": result.insert(.maskAlternate)
            case "control", "ctrl": result.insert(.maskControl)
            case "fn": result.insert(.maskSecondaryFn)
            default: throw failure("INVALID_MODIFIERS", "Unknown modifier: \(name)")
            }
        }
        return result
    }
    func stop() {
        if let tap = tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
        if let source = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        tap = nil; source = nil; bindings = []
    }
    func configure(_ command: [String: Any]) throws -> [String: Any] {
        if command["enabled"] as? Bool == false { stop(); return ["enabled": false] }
        let defaultBindings: [[String: Any]] = [18,19,20,21,23,22].enumerated().map {
            ["name": "slot-\($0.offset)", "keyCode": $0.element, "modifiers": ["control", "option"], "suppress": false]
        } + [["name": "newTask", "keyCode": 45, "modifiers": ["control", "option"], "suppress": false]]
        let raw = command["bindings"] as? [[String: Any]] ?? defaultBindings
        guard !raw.isEmpty, raw.count <= 7 else { throw failure("INVALID_BINDINGS", "At most seven agreed Control+Option bindings are supported.") }
        var configured = [KeyBinding]()
        for binding in raw {
            guard let code = binding["keyCode"] as? Int, Self.allowedMonitorCodes.contains(code),
                  let name = binding["name"] as? String, !name.isEmpty, name.count <= 80 else {
                throw failure("INVALID_BINDING", "A binding requires name and a macOS keyCode for 1–6 or N.")
            }
            let flags = try Self.flags(binding["modifiers"])
            guard flags == [.maskControl, .maskAlternate] else {
                throw failure("INVALID_BINDING", "Global monitoring is limited to Control+Option+1–6 / N; bare typing keys are forbidden.")
            }
            guard !configured.contains(where: { $0.code == code && $0.flags == flags }) else {
                throw failure("DUPLICATE_BINDING", "Two bindings have the same key and modifiers.")
            }
            configured.append(KeyBinding(name: name, code: code, flags: flags, suppress: binding["suppress"] as? Bool ?? false))
        }
        stop()
        let context = Unmanaged.passUnretained(self).toOpaque()
        let mask = (CGEventMask(1) << CGEventType.keyDown.rawValue) | (CGEventMask(1) << CGEventType.keyUp.rawValue)
        guard let newTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
                                             options: configured.contains(where: { $0.suppress }) ? .defaultTap : .listenOnly,
                                             eventsOfInterest: mask, callback: { _, type, event, context in
            guard let context = context else { return Unmanaged.passUnretained(event) }
            return Unmanaged<KeyHooks>.fromOpaque(context).takeUnretainedValue().handle(type, event)
        }, userInfo: context) else {
            throw failure("INPUT_MONITORING_REQUIRED", "macOS denied the key monitor. Enable Input Monitoring for the parent application; suppression may also require Accessibility.")
        }
        bindings = configured; tap = newTap
        source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, newTap, 0)
        if let source = source { CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes) }
        CGEvent.tapEnable(tap: newTap, enable: true)
        return ["enabled": true, "bindingCount": bindings.count, "ordinaryTypingRecorded": false]
    }
    private func handle(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        let code = Int(event.getIntegerValueField(.keyboardEventKeycode))
        let flags = event.flags.intersection(Self.modifierMask)
        guard let binding = bindings.first(where: { $0.code == code && $0.flags == flags }) else {
            return Unmanaged.passUnretained(event)
        }
        if type == .keyDown && event.getIntegerValueField(.keyboardEventAutorepeat) == 0 {
            if code == 45 { emit(["event": "shortcut", "action": "newTask"]) }
            else if let index = [18,19,20,21,23,22].firstIndex(of: code) {
                emit(["event": "shortcut", "action": "slot", "index": index])
            }
        }
        return binding.suppress ? nil : Unmanaged.passUnretained(event)
    }
    func shortcut(_ command: [String: Any]) throws -> [String: Any] {
        let phase = command["phase"] as? String ?? "tap"
        guard ["tap", "down", "up"].contains(phase) else { throw failure("INVALID_SHORTCUT", "Invalid shortcut phase.") }
        if phase == "up" { return ["released": releaseShortcut()] }
        if command["action"] as? String == "task" {
            releaseShortcut()
            guard let threadID = command["threadId"] as? String, (1...160).contains(threadID.count),
                  threadID.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-").contains($0) }),
                  let url = URL(string: "codex://threads/\(threadID)") else {
                throw failure("INVALID_TASK", "threadId must contain only letters, digits, underscores and hyphens.")
            }
            guard NSWorkspace.shared.open(url) else { throw failure("TASK_OPEN_FAILED", "macOS could not open the Codex task URL.") }
            return ["opened": true, "threadId": threadID]
        }
        guard let code = command["keyCode"] as? Int, (0...127).contains(code) else {
            throw failure("INVALID_SHORTCUT", "shortcut requires a macOS virtual keyCode from 0 to 127.")
        }
        let flags = try Self.flags(command["modifiers"])
        let target = command["target"] as? String ?? "com.openai.codex"
        guard target == "com.openai.codex" else { throw failure("INVALID_TARGET", "Shortcut delivery is limited to the Codex application.") }
        if command["activateTarget"] as? Bool == true,
           NSWorkspace.shared.frontmostApplication?.bundleIdentifier != target {
            guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: target).first else {
                throw failure("TARGET_NOT_RUNNING", "Open Codex before sending a shortcut.")
            }
            app.activate(options: [])
            let deadline = ProcessInfo.processInfo.systemUptime + 1.0
            while NSWorkspace.shared.frontmostApplication?.bundleIdentifier != target && ProcessInfo.processInfo.systemUptime < deadline { pump(0.02) }
        }
        guard let targetApp = NSWorkspace.shared.frontmostApplication, targetApp.bundleIdentifier == target else {
            throw failure("TARGET_NOT_FRONTMOST", "Codex did not become the foreground application; no shortcut was sent.")
        }
        guard CGPreflightPostEventAccess() else { throw failure("ACCESSIBILITY_REQUIRED", "Enable Accessibility for the parent application to send shortcuts.") }
        releaseShortcut()
        if let delivery = command["delivery"] as? String, ["globalHold","globalTap"].contains(delivery) {
            guard phase == (delivery == "globalHold" ? "down" : "tap") else { throw failure("INVALID_SHORTCUT", "Invalid global dictation gesture.") }
            let modifierOnly = command["modifierOnly"] as? Bool == true
            guard !modifierOnly || !flags.isEmpty else { throw failure("INVALID_SHORTCUT", "A modifier hold requires at least one modifier.") }
            let heldFlags = CGEventSource.flagsState(.combinedSessionState).intersection([.maskControl,.maskShift,.maskAlternate,.maskCommand,.maskSecondaryFn])
            let chord = ShortcutChord(code:CGKeyCode(code),flags:flags,modifierOnly:modifierOnly,alreadyHeld:heldFlags)
            let source = CGEventSource(stateID:.privateState)
            func events(_ steps:[ShortcutChord.Step]) throws -> [CGEvent] {
                try steps.map { step in
                    guard let event = CGEvent(keyboardEventSource:source,virtualKey:step.code,keyDown:step.type != .keyUp) else {
                        throw failure("SHORTCUT_FAILED", "macOS could not construct the dictation gesture.")
                    }
                    event.type=step.type; event.flags=step.flags
                    return event
                }
            }
            // Allocate the entire release before posting any part of the press.
            let down = try events(chord.down), up = try events(chord.up)
            if delivery == "globalHold" {
                heldShortcut = HeldShortcut(code:CGKeyCode(code),flags:flags,pid:targetApp.processIdentifier,globalRelease:up)
                for event in down { event.post(tap:.cghidEventTap) }
                let timer = DispatchWorkItem { [weak self] in self?.releaseShortcut() }
                releaseTimer=timer; DispatchQueue.main.asyncAfter(deadline:.now()+120,execute:timer)
            } else {
                for event in down + up { event.post(tap:.cghidEventTap) }
            }
            return ["sent":true,"keyCode":code,"phase":phase,"delivery":delivery]
        }
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: false) else {
            throw failure("SHORTCUT_FAILED", "macOS could not construct the shortcut events.")
        }
        down.flags = flags; up.flags = flags
        down.post(tap: .cgSessionEventTap)
        if phase == "down", let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier {
            heldShortcut = HeldShortcut(code:CGKeyCode(code),flags:flags,pid:pid,globalRelease:nil)
            let timer = DispatchWorkItem { [weak self] in self?.releaseShortcut() }
            releaseTimer = timer
            DispatchQueue.main.asyncAfter(deadline: .now()+120, execute: timer)
        } else { up.post(tap: .cgSessionEventTap) }
        return ["sent": true, "keyCode": code, "phase": phase]
    }
}

// An explicit lighting trigger is separate from the fixed Codex shortcuts.
// This observer emits only the selected physical key code, never text or other
// keystrokes, and cannot suppress or replace the original keyboard event.
final class TriggerHooks {
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var keyCode: Int?
    // Keep this allowlist aligned with shared/trigger-keys.json. Modifier keys,
    // Fn and the encoder are deliberately excluded from the keyDown observer.
    static let allowedCodes: Set<Int> = [
        0,1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19,20,21,22,23,24,
        25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,
        45,46,47,48,49,50,51,53,96,97,98,99,100,101,103,109,111,
        114,115,116,117,118,119,120,121,122,123,124,125,126
    ]
    static func requestedCode(_ command: [String: Any]) throws -> Int? {
        guard let enabledValue = command["enabled"] as? NSNumber,
              CFGetTypeID(enabledValue) == CFBooleanGetTypeID() else {
            throw failure("INVALID_TRIGGER_MONITOR", "triggerMonitor requires enabled: true or false.")
        }
        if !enabledValue.boolValue { return nil }
        guard let number = command["keyCode"] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue == Double(number.intValue),
              Self.allowedCodes.contains(number.intValue) else {
            throw failure("INVALID_TRIGGER_KEY", "Choose one supported physical keyboard key for the lighting trigger.")
        }
        guard command["suppress"] == nil, command["modifiers"] == nil else {
            throw failure("INVALID_TRIGGER_MONITOR", "The lighting trigger observes one unmodified key and cannot suppress input.")
        }
        return number.intValue
    }
    static func shouldTrigger(type: CGEventType, code: Int, flags: CGEventFlags,
                              autorepeat: Int64, configuredCode: Int?) -> Bool {
        type == .keyDown && configuredCode == code && autorepeat == 0 &&
            flags.intersection(KeyHooks.modifierMask).isEmpty
    }
    func stop() {
        if let tap = tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
        if let source = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        tap = nil; source = nil; keyCode = nil
    }
    func configure(_ command: [String: Any]) throws -> [String: Any] {
        let requestedCode = try Self.requestedCode(command)
        stop()
        guard let requestedCode = requestedCode else {
            return ["enabled": false, "ordinaryTypingRecorded": false]
        }
        let context = Unmanaged.passUnretained(self).toOpaque()
        let mask = CGEventMask(1) << CGEventType.keyDown.rawValue
        guard let newTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
                                             options: .listenOnly, eventsOfInterest: mask,
                                             callback: { _, type, event, context in
            if let context = context {
                Unmanaged<TriggerHooks>.fromOpaque(context).takeUnretainedValue().handle(type, event)
            }
            return Unmanaged.passUnretained(event)
        }, userInfo: context) else {
            throw failure("INPUT_MONITORING_REQUIRED", "macOS denied the lighting trigger observer. Input Monitoring permission is required for the parent application.")
        }
        guard let newSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, newTap, 0) else {
            CFMachPortInvalidate(newTap)
            throw failure("TRIGGER_MONITOR_FAILED", "macOS could not attach the lighting trigger observer.")
        }
        keyCode = requestedCode; tap = newTap; source = newSource
        CFRunLoopAddSource(CFRunLoopGetMain(), newSource, .commonModes)
        CGEvent.tapEnable(tap: newTap, enable: true)
        return ["enabled": true, "ordinaryTypingRecorded": false]
    }
    private func handle(_ type: CGEventType, _ event: CGEvent) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return
        }
        let code = Int(event.getIntegerValueField(.keyboardEventKeycode))
        if Self.shouldTrigger(type: type, code: code, flags: event.flags,
                              autorepeat: event.getIntegerValueField(.keyboardEventAutorepeat),
                              configuredCode: keyCode) {
            emit(["event": "triggerKey", "keyCode": code])
        }
    }
}

final class JSONServer {
    let device: Air75Device
    let adaptation: KeyAdaptation
    let keys = KeyHooks()
    let trigger = TriggerHooks()
    let bluetooth = BluetoothKeyboard()
    private var pending = [[String: Any]]()
    private var processing = false
    private var stopping = false
    private var inputEnded = false
    private var finishing = false
    init(device: Air75Device) {
        self.device = device
        adaptation = KeyAdaptation(journal:device.backupURL.deletingLastPathComponent().appendingPathComponent("key-mapping-backup.json"))
        do { _ = try adaptation.restore() } catch { diagnostic("Pending key restore: \(error)") }
    }
    func enqueue(_ command: [String: Any]) {
        if stopping { return }
        // Bound the queue rather than letting an animation create minutes of lag.
        if pending.count >= 8 {
            emit(["id": command["id"] ?? NSNull(), "ok": false,
                  "error": failure("BACKPRESSURE", "Wait for each paint response before sending the next frame.").json])
            return
        }
        pending.append(command)
        drain()
    }
    private func drain() {
        guard !processing else { return }
        processing = true
        while !pending.isEmpty && !stopping {
            let command = pending.removeFirst()
            let id = command["id"] ?? NSNull()
            do { emit(["id": id, "ok": true, "result": try execute(command)]) }
            catch let error as BridgeError { emit(["id": id, "ok": false, "error": error.json]) }
            catch { emit(["id": id, "ok": false, "error": failure("INTERNAL_ERROR", error.localizedDescription).json]) }
        }
        processing = false
        if stopping || inputEnded { finishShutdown() }
    }
    private func execute(_ command: [String: Any]) throws -> [String: Any] {
        guard let op = command["op"] as? String else { throw failure("INVALID_REQUEST", "Every line must include op and an id.") }
        switch op {
        case "connect": return try device.connect()
        case "status": return try device.status()
        case "permissions": return permissionSnapshot()
        case "bluetoothDevices": return bluetooth.snapshot()
        case "openPermissionSettings": return try openPermissionSettings(command["permission"])
        case "arm": return try device.arm()
        case "paint": return try device.paint(parseColors(command["colors"], count: 84), verify: command["verify"] as? Bool ?? false)
        case "readColors": return ["colors": hexColors(try device.readRGB()), "ledCount": 104,
                                   "customColorScale": S4.stateLength(device.firmware) == 22 ? 200 : 255]
        case "readKeymap": return try device.readKeymap()
        case "prepareFunctionKey": return try device.prepareFunctionKey()
        case "restoreFunctionKey": return try device.restoreFunctionKey()
        case "adaptKeys": return try adaptation.apply(command)
        case "keyMappingStatus": return try adaptation.status(command)
        case "restoreKeys": return try adaptation.restore()
        case "systemIdle":
            let seconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max)!)
            return ["idleMs": seconds.isFinite && seconds >= 0 ? seconds * 1000 : NSNull(), "recordsKeys": false]
        case "side":
            if command["restore"] as? Bool == true { return try device.restoreSide() }
            guard let color = command["color"] as? String else { throw failure("INVALID_SIDE", "side requires a color string.") }
            return try device.setSide(color: parseColor(color), brightness: command["brightness"] as? Int ?? 60)
        case "restore": return try device.restore()
        case "disconnect": _ = try adaptation.restore(); _ = try device.restoreFunctionKey(); return try device.disconnect()
        case "keyMonitor": return try keys.configure(command)
        case "triggerMonitor": return try trigger.configure(command)
        case "shortcut": return try keys.shortcut(command)
        case "quit": stopping = true; return ["quitting": true]
        default: throw failure("UNKNOWN_OPERATION", "Unknown operation: \(op)")
        }
    }
    func shutdown() {
        stopping = true
        if !processing { finishShutdown() }
    }
    func finishInput() {
        inputEnded = true
        if !processing { drain() }
    }
    private func finishShutdown() {
        guard !finishing else { return }
        finishing = true
        keys.releaseShortcut()
        keys.stop()
        trigger.stop()
        var keysRestored = true
        var keysDeferred = false
        do { _ = try adaptation.restore(); keysDeferred = try device.restoreFunctionKey()["deferred"] as? Bool == true } catch {
            keysRestored = false
            diagnostic("Key restore failed: \(error)")
            emit(["event":"keyRestoreFailed", "error":String(describing:error)])
        }
        let lightingRestored = device.shutdown()
        emit(["event":"shutdownComplete", "lightingRestored":lightingRestored && !device.hasPendingBackups,
              "lightingDeferred":lightingRestored && device.hasPendingBackups, "keysRestored":keysRestored && !keysDeferred,"keysDeferred":keysDeferred])
        let restored = lightingRestored && keysRestored
        Darwin.exit(restored ? 0 : 2)
    }
}

func testFunctionKeyLifecycle(_ check:@escaping (Bool,String)throws->Void) throws {
    let dir=FileManager.default.temporaryDirectory.appendingPathComponent("nuphylab-function-lease-test-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
    defer {try? FileManager.default.removeItem(at:dir)}
    let journal=dir.appendingPathComponent("function-key-backup.json")
    var mac=Array(repeating:0,count:98),win=mac
    let factory=[105,106,32262,32263,32264,32278,172,174,171,168,170,169]
    for i in 0..<12 {mac[i+1]=factory[i];win[i+1]=58+i}
    let original=mac
    var currentFirmware:[UInt8]=[23,0,1,170,6,0,0,0],mode:UInt8=0,writes=0,denyWrite=false,failAck=false
    let device=Air75Device(backupURL:dir.appendingPathComponent("lighting.json"),testExchange:{ frame in
        let op=frame[1],n=Int(frame[4]),address=Int(frame[5]) | Int(frame[6]) << 8
        var payload=[UInt8]()
        switch op {
        case 0xa1: payload=currentFirmware
        case 0xa0: payload=[mode,8,4,6,16,2,0,0]
        case 0xd1: payload=[104]
        case 0xd5: payload=[6,25,4,0,1,0,0,1,64,4,60,0,1,0,255,0,0,0,0,0,0,0]
        case 0xd2: payload=Array(repeating:0,count:n)
        case 0xb1,0xb2:
            let layer=address/196,offset=address%196
            let keys=layer==4 ? win : op==0xb1 ? original : mac
            let bytes=keys.flatMap{[UInt8($0 >> 8),UInt8($0 & 255)]}
            payload=Array(bytes[offset..<(offset+n)])
        case 0xb3:
            try check(FileManager.default.fileExists(atPath:journal.path),"F4 journal exists before every mutation")
            writes+=1
            try check(n==2 && address==8 && frame[7]==0,"F4 lease only touches exact Mac base position")
            if !denyWrite {mac[address/2]=Int(frame[8]) << 8 | Int(frame[9])}
            if failAck {failAck=false;throw failure("HID_TIMEOUT","lost mutation ACK")}
            payload=Array(frame[8..<(8+n)])
        default: throw failure("SELF_TEST","Unexpected function lease command")
        }
        var reply=[UInt8](repeating:0,count:64);reply[0]=0xaa;reply[1]=op
        reply.replaceSubrange(4..<8,with:frame[4..<8]);reply.replaceSubrange(8..<(8+n),with:payload)
        reply[3]=S4.checksum(reply);return reply
    })
    _ = try device.connect()
    try check(try device.prepareFunctionKey()["leased"] as? Bool == true,"factory F4 leased")
    try check(mac[4]==61 && writes==1,"only factory F4 becomes standard F4")
    _ = try device.prepareFunctionKey()
    try check(writes==1,"unchanged F4 lease is never rewritten on polling")
    let data=try Data(contentsOf:journal)
    try check(try JSONDecoder().decode(FunctionKeyBackup.self,from:data).original==original,"entire original base map is preserved")
    mode=1;_ = try device.restoreFunctionKey()
    try check(mac==original && writes==2 && !device.hasFunctionKeyBackup,"switching to Win restores saved Mac F4 without changing Win")
    mode=0;_ = try device.prepareFunctionKey();device.didRemove()
    try check(try device.restoreFunctionKey()["deferred"] as? Bool == true,"unplug retains durable F4 restoration")
    _ = try device.connect()
    try check(mac==original && !device.hasFunctionKeyBackup,"verified reconnect restores a pending lease")
    denyWrite=true
    do {_ = try device.prepareFunctionKey();throw failure("SELF_TEST","ignored F4 write accepted")}
    catch let error as BridgeError {try check(error.code=="KEY_LEASE_VERIFY","write must be read back")}
    try check(mac==original && !device.hasFunctionKeyBackup,"ignored write safely retires unchanged original")
    denyWrite=false;failAck=true
    do {_ = try device.prepareFunctionKey();throw failure("SELF_TEST","lost ACK accepted")}
    catch let error as BridgeError {try check(error.code=="HID_TIMEOUT","uncertain mutation is surfaced")}
    try check(mac==original && !device.hasFunctionKeyBackup,"lost ACK after actual mutation is rolled back")
    _ = try device.prepareFunctionKey();mac[4]=4
    _ = try device.restoreFunctionKey()
    try check(mac[4]==4 && !device.hasFunctionKeyBackup,"new user F4 assignment is preserved")
    try check(try FileManager.default.contentsOfDirectory(atPath:dir.appendingPathComponent("key-recovery-history").path).count==1,"external-edit backup is archived")
    mac=original;_ = try device.prepareFunctionKey();currentFirmware[0]=24
    let before=writes
    do {_ = try device.restoreFunctionKey();throw failure("SELF_TEST","cross-firmware F4 restore accepted")}
    catch let error as BridgeError {try check(error.code=="KEY_LEASE_CHANGED","cross-firmware leased key fails closed")}
    try check(writes==before && device.hasFunctionKeyBackup,"cross-firmware recovery never writes stale key data")
    currentFirmware[0]=23;_ = try device.restoreFunctionKey()
    mac[4]=62
    try check(try device.prepareFunctionKey()["leased"] as? Bool == false,"custom F4 mapping is never overwritten")
    for (page,usage):(UInt32,UInt32) in [(12,0x29f),(12,0xcf),(1,0x9b)] {
        let src=UInt64(page)<<32|UInt64(usage),row=["HIDKeyboardModifierMappingSrc":src,"HIDKeyboardModifierMappingDst":UInt64(0x70000003c)]
        try check(KeyAdaptation.validMappings([row],bluetooth:false),"verified factory special usage is accepted for USB")
        try check(!KeyAdaptation.validMappings([row],bluetooth:true),"factory special usage is not guessed for Bluetooth")
        try check(KeyAdaptation.serviceAcceptsSource(src,conforms:{p,u in p==page && u==(page==1 ? 0x80 : 1)}),"special usage targets its own HID service collection")
    }
    for (address,payload):(Int,[UInt8]) in [(1,[0,61]),(196,[0,61]),(8,[0,4]),(8,[])] {
        do {_ = try S4.frame(command:0xb3,length:2,address:address,payload:payload,key:0);throw failure("SELF_TEST","arbitrary B3 accepted")}
        catch let error as BridgeError {try check(error.code=="INVALID_FRAME","B3 cannot write arbitrary keys/layers")}
    }
}

func testFirmwareUpgradeLifecycle(_ check: (Bool, String) throws -> Void) throws {
    final class Board {
        var firmware: [UInt8] = [16,0,1,170,6,0,0,0]
        var state: [UInt8] = [6,25,4,0,1,0,0,1,64,4,60,0,1,0,255,0,0]
        var rgb = [UInt8](repeating: 20, count: 312)
        var writes = 0
        var rejectRGBProbe = false
        func exchange(_ frame: [UInt8]) throws -> [UInt8] {
            let command = frame[1], length = Int(frame[4])
            let address = Int(frame[5]) | Int(frame[6]) << 8
            var payload: [UInt8]
            switch command {
            case 0xa1: payload = firmware
            case 0xa0: payload = [0,8,4,6,16,2,0,0]
            case 0xd1: payload = [104]
            case 0xd5: payload = state
            case 0xd2:
                if rejectRGBProbe { throw failure("HID_TIMEOUT", "simulated incomplete read-only probe") }
                var rendered = rgb
                if firmware[0] >= 17 && state[0] == 21 {
                    let value = Int(state[6..<9].max()!) * 200 / 255
                    for i in 0..<252 {
                        let v = Int(rgb[i]) * value / 255
                        rendered[i] = UInt8(i >= 250 ? v * 150 / 255 : v)
                    }
                }
                payload = Array(rendered[address..<(address+length)])
            case 0xd6:
                writes += 1; payload = Array(frame[8..<(8+length)]); state = payload
            case 0xd8:
                writes += 1; payload = Array(frame[8..<(8+length)])
                for index in stride(from: 0, to: length, by: 4) {
                    let start = Int(payload[index])*3
                    rgb.replaceSubrange(start..<(start+3), with: payload[(index+1)..<(index+4)])
                }
            default: throw failure("SELF_TEST", "Unexpected lifecycle command")
            }
            guard payload.count == length else { throw failure("SELF_TEST", "Incorrect lifecycle response length") }
            var reply = [UInt8](repeating: 0, count: 64)
            reply[0] = 0xaa; reply[1] = command
            reply.replaceSubrange(4..<8, with: frame[4..<8])
            reply.replaceSubrange(8..<(8+length), with: payload)
            reply[3] = S4.checksum(reply)
            return reply
        }
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("nuphylab-upgrade-test-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let journals = LightingJournals(legacyURL: directory.appendingPathComponent("original.json"))
    let board = Board()
    let device = Air75Device(backupURL: journals.legacyURL, testExchange: { try board.exchange($0) })
    _ = try device.connect(); _ = try device.arm()
    _ = try device.paint(Array(repeating: 8, count: 252), verify: true)
    let oldJournal = try Data(contentsOf: journals.url(0))
    try check(device.ownsChanges, "old session owns its actual mutations before upgrade")
    board.firmware = [23,0,1,170,6,0,0,0]
    board.state = [22,75,2,0,0,3,0,190,174,4,60,2,1,0,255,0,0,3,24,48,96,2]
    // Use exact inverse representatives so the fixture can check both raw
    // palette restoration and the rendered-readback quantization path.
    board.rgb = try S4.paletteFromRendered(S4.renderedCustomColors((0..<252).map {UInt8($0 % 251)}, firmware: board.firmware), firmware: board.firmware) + Array(repeating: 0, count: 60)
    let upgradedState = board.state, upgradedRGB = board.rgb, priorWrites = board.writes
    do { _ = try device.restore(); throw failure("SELF_TEST", "cross-firmware live restore was accepted") }
    catch let error as BridgeError { try check(error.code == "BACKUP_FIRMWARE_MISMATCH", "upgrade stops stale owned restoration") }
    try check(board.writes == priorWrites && (try Data(contentsOf: journals.url(0))) == oldJournal,
              "blocked restore writes nothing and preserves the original journal")
    board.rejectRGBProbe = true
    do { _ = try device.connect(); throw failure("SELF_TEST", "incomplete reconnect was accepted") }
    catch let error as BridgeError { try check(error.code == "HID_TIMEOUT", "reconnect must finish every read-only probe") }
    try check(device.ownsChanges && (try Data(contentsOf: journals.url(0))) == oldJournal,
              "failed probe cannot retire ownership or archive the original")
    board.rejectRGBProbe = false
    let reconnected = try device.connect()
    try check(reconnected["recoveryPending"] as? Bool == false && !device.ownsChanges,
              "same-process verified reconnect retires old-firmware ownership")
    let history = try FileManager.default.contentsOfDirectory(at: directory.appendingPathComponent("firmware-recovery-history"), includingPropertiesForKeys: nil)
    try check(history.count == 1 && (try Data(contentsOf: history[0])) == oldJournal,
              "same-process upgrade archives the exact old journal once")
    try check(board.writes == priorWrites && board.state == upgradedState && board.rgb == upgradedRGB,
              "firmware transition never writes the old schema into the new board")
    _ = try device.arm(); _ = try device.paint(Array(repeating: 32, count: 252), verify: true)
    board.firmware[6] = 124; board.firmware[7] = 124
    let restored = try device.restore()
    try check(restored["verified"] as? Bool == true && board.state == upgradedState && board.rgb == upgradedRGB,
              "new session preserves the entire new state and original custom palette")
    let status = try device.status()
    try check((status["capabilities"] as? [String: Any])?["perKey"] as? Bool == true,
              "reserved A1 changes do not invalidate a verified protocol")
    _ = try device.arm(); let sameFirmwareJournal = try Data(contentsOf: journals.url(0))
    device.didRemove()
    let sameFirmwareReconnect = try device.connect()
    try check(sameFirmwareReconnect["recoveryPending"] as? Bool == true && device.ownsChanges &&
              (try Data(contentsOf: journals.url(0))) == sameFirmwareJournal,
              "ordinary unplug/reconnect retains same-firmware recovery instead of archiving it")
    _ = try device.restore()
    board.state = [21,40,2,0,1,3,64,128,192,4,60,2,1,0,255,0,0,3,24,48,96,2]
    board.rgb = (0..<312).map { UInt8(($0 * 73) % 256) }
    let dimState = board.state, dimRendered = try device.readRGB()
    _ = try device.arm(); _ = try device.paint(Array(repeating: 15, count: 252), verify: true)
    _ = try device.restore()
    try check(board.state == dimState && (try device.readRGB()) == dimRendered,
              "quantized palette candidates restore the exact original dimmed custom output")
    try check(device.shutdown(), "upgraded session shuts down with all owned state restored")
}

func selfTest() throws {
    var checks = 0
    func check(_ yes: Bool, _ name: String) throws {
        if !yes { throw failure("SELF_TEST", name) }
        checks += 1
    }
    let journalDir = FileManager.default.temporaryDirectory.appendingPathComponent("nuphylab-profile-test-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: journalDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: journalDir) }
    let journal = LightingJournals(legacyURL: journalDir.appendingPathComponent("original-lighting.json"))
    var record = LightingBackup(createdAt: "test", serial: "unit-board", firmware: [16,0,1,170,6,0,0,0],
                                state: [6,50,2,0,1,0,0,5,128,4,60,2,1,0,255,0,0], renderedColors: Array(repeating: 0, count: 312), lightingProfile: 1)
    let winData = try JSONEncoder().encode(record)
    try winData.write(to: journal.legacyURL)
    try journal.migrateLegacy(serial: "unit-board")
    try check(!journal.hasLegacy && journal.profiles == [1], "Win backup migrates without creating a Mac recovery requirement")
    try check(try Data(contentsOf: journal.url(1)) == winData, "migration preserves the original byte-for-byte")
    record.lightingProfile = nil // Pre-profile releases always addressed Mac.
    let macData = try JSONEncoder().encode(record)
    try macData.write(to: journal.legacyURL)
    try journal.migrateLegacy(serial: "unit-board")
    try check(journal.profiles == [0,1], "legacy Mac and Win journals coexist")
    try check(try Data(contentsOf: journal.url(1)) == winData, "Mac migration cannot replace the Win original")
    try check(try journal.read(journal.url(0), serial: "unit-board").lightingProfile == nil, "old profile-less backup stays readable")
    try winData.write(to: journal.legacyURL)
    do { try journal.migrateLegacy(serial: "unit-board"); throw failure("SELF_TEST", "overwrote a pending journal") }
    catch let error as BridgeError { try check(error.code == "BACKUP_MIGRATION_FAILED", "conflicting journals cannot overwrite originals") }
    try check(try Data(contentsOf: journal.legacyURL) == winData && Data(contentsOf: journal.url(1)) == winData, "both originals survive a migration conflict")
    try FileManager.default.removeItem(at: journal.legacyURL)
    try FileManager.default.removeItem(at: journal.url(0))
    try check(journal.profiles == [1], "completing one profile leaves the other profile pending")
    do { _ = try journal.read(journal.url(1), serial: "different-board"); throw failure("SELF_TEST", "accepted another device's journal") }
    catch let error as BridgeError { try check(error.code == "BACKUP_DEVICE_MISMATCH", "device identity still enforced") }
    try Data("broken".utf8).write(to: journal.legacyURL)
    do { try journal.migrateLegacy(serial: "unit-board"); throw failure("SELF_TEST", "moved corrupt recovery data") }
    catch let error as BridgeError { try check(error.code == "BACKUP_READ_FAILED" && journal.hasLegacy, "corrupt original is preserved") }
    let mapping = [["HIDKeyboardModifierMappingSrc":UInt64(0x700000069), "HIDKeyboardModifierMappingDst":UInt64(0x70000003b)]]
    var mappingWrites = 0, mappingReads = 0, mappingWaits = 0
    try KeyAdaptation.writeVerified([], read: { [] }, set: { mappingWrites += 1; return false }, settle: {})
    try check(mappingWrites == 0, "already restored mappings need no write")
    try KeyAdaptation.writeVerified([], read: { mappingReads += 1; return mappingReads < 4 ? mapping : [] },
        set: { mappingWrites += 1; return true }, settle: { mappingWaits += 1 })
    try check(mappingWrites == 1 && mappingWaits == 2, "delayed mapping restore reads again without rewriting")
    mappingWrites = 0; mappingWaits = 0
    do {
        try KeyAdaptation.writeVerified([], read: { mapping }, set: { mappingWrites += 1; return true }, settle: { mappingWaits += 1 })
        throw failure("SELF_TEST", "unverified mapping accepted")
    } catch let error as BridgeError {
        try check(error.code == "KEY_MAPPING_DENIED" && mappingWrites == 1 && mappingWaits == 5, "unverified mappings still fail after bounded readback")
    }
    try check(try permissionSettingsURL("inputMonitoring").absoluteString == "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent", "input monitoring settings destination")
    try check(try permissionSettingsURL("accessibility").absoluteString == "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility", "accessibility settings destination")
    for value: Any in ["camera", "https://example.com", 1, NSNull()] {
        do { _ = try permissionSettingsURL(value); throw failure("SELF_TEST", "arbitrary settings destination accepted") }
        catch let error as BridgeError { try check(error.code == "INVALID_PERMISSION", "unknown permission rejected") }
    }
    let bluetoothIdentity: [String:Any] = ["VendorID":2007,"ProductID":0,"Transport":"Bluetooth Low Energy","Manufacturer":"Nuphy","Product":"Air75 V3-1"]
    for name in ["Air75 V3", "Air75 V3-1", "Air75 V3-2", "Air75 V3-3"] {
        var p=bluetoothIdentity;p["Product"]=name
        try check(BluetoothKeyboard.matches(p), "Air75 V3 Bluetooth channel recognized")
    }
    for (key,value): (String,Any) in [("Product","Air75 V2-1"),("Product","ATK Ghost ULTIMATE"),("Product","Air75 V3-4"),("VendorID",0x19f5),("ProductID",1),("Manufacturer","Other"),("Transport","USB")] {
        var p=bluetoothIdentity;p[key]=value
        try check(!BluetoothKeyboard.matches(p), "unverified Bluetooth identity rejected")
    }
    for i:UInt64 in 0..<12 {
        let row=["HIDKeyboardModifierMappingSrc":0x700000068+i,"HIDKeyboardModifierMappingDst":0x70000003a+i]
        try check(KeyAdaptation.validMappings([row],bluetooth:true),"extended function key maps to corresponding standard key")
        try check(KeyAdaptation.validMappings([row],bluetooth:false),"USB extended function key maps to corresponding standard key")
        try check(!KeyAdaptation.validMappings([row,row],bluetooth:true),"duplicate mapping rejected")
        try check(!KeyAdaptation.validMappings([row,row],bluetooth:false),"USB duplicate mapping rejected")
        let keycap=["HIDKeyboardModifierMappingSrc":0x700000068+i,"HIDKeyboardModifierMappingDst":KeyAdaptation.keycapUsages[Int(i)]]
        for wireless in [false,true] {
            try check(KeyAdaptation.validMappings([keycap],bluetooth:wireless,keycaps:true),"keycap function follows exact physical F position")
            let shifted=["HIDKeyboardModifierMappingSrc":0x700000068+i,"HIDKeyboardModifierMappingDst":KeyAdaptation.keycapUsages[(Int(i)+1)%12]]
            try check(!KeyAdaptation.validMappings([shifted],bluetooth:wireless,keycaps:true),"shifted keycap order rejected")
        }
    }
    for (source,target):(UInt64,UInt64) in [(0x700000004,0x70000003a),(0xc000000e9,0x700000045),(0x700000068,0x70000003b),(0x700000074,0x700000046)] {
        try check(!KeyAdaptation.validMappings([["HIDKeyboardModifierMappingSrc":source,"HIDKeyboardModifierMappingDst":target]],bluetooth:true),"Bluetooth mapping cannot change typing, media or unrelated keys")
    }
    let frame = try S4.frame(command: 0xd5, length: 17, key: 0x5a)
    try check(frame.count == 64 && frame[0] == 0x55 && frame[3] == S4.checksum(frame), "request checksum")
    try check(frame[4] == 17 ^ 0x5a && frame[7] == 0x5a && frame[8] == 0, "route XOR and zero padding")
    let lightsOff: [UInt8] = [0,0,3,0,0,0,0,0,0,2,0,0,0,0,255,255,255]
    var lightsOn = lightsOff; lightsOn[0] = 21; lightsOn[1] = 100; lightsOn[4] = 1
    try check(S4.stateMismatchCode(expected: lightsOn, observed: lightsOff) == "LIGHTING_DISABLED", "disabled master switch mismatch")
    try check(S4.stateMismatchCode(expected: lightsOn, observed: lightsOn) == "STATE_VERIFY_FAILED", "ordinary mismatch keeps general error")
    try check(S4.stateMismatchCode(expected: lightsOff, observed: lightsOff) == "STATE_VERIFY_FAILED", "restoring off does not demand hardware wake")
    try check(S4.stateMismatchCode(expected: lightsOn, observed: []) == "STATE_VERIFY_FAILED", "truncated state cannot be classified as off")
    let offTarget = S4.restoreTarget(lightsOff)
    try check(offTarget[0] == 2 && Array(offTarget.dropFirst()) == Array(lightsOff.dropFirst()), "unwritable mode zero restores a stock dark state")
    try check(S4.restoreTarget(lightsOn) == lightsOn, "normal state restores exactly")
    var sideOn = lightsOff; sideOn[10] = 60
    try check(S4.restoreTarget(sideOn) == sideOn, "side lighting is not mistaken for a master-off state")
    let state: [UInt8] = [2,75,2,0,0,0,0,190,174,4,60,2,1,0,255,0,0]
    let verifiedFirmware: [UInt8] = [16,0,1,170,6,0,0,0]
    var reservedDrift = state; reservedDrift[5] = 81; reservedDrift[13] = 198
    try check(S4.statesMatch(state, reservedDrift, firmware: verifiedFirmware), "unimplemented palette fields cannot fail restoration")
    try check(!S4.statesMatch(state, reservedDrift, firmware: [17,0,1,170,6,0,0,0]), "other firmware keeps exact comparison")
    try check(!S4.statesMatch(state, [], firmware: verifiedFirmware), "truncated readback fails")
    let latestFirmware: [UInt8] = [23,0,1,170,6,0,0,0]
    let futureFirmware: [UInt8] = [99,0,1,170,6,0,0,0]
    let shapeState: [UInt8] = [22,75,2,0,0,3,0,190,174,4,60,2,1,0,255,0,0,3,24,48,96,2]
    try check(S4.stateLength(verifiedFirmware) == 17 && S4.stateLength(latestFirmware) == 22, "official old and extended state schemas")
    try check(S4.stateLength([17,0,1,170,6,0,0,0]) == 22, "shape schema begins at official 1.0.17.6 boundary")
    try check(S4.stateLength(futureFirmware) == 22 && S4.supportsPerKey(futureFirmware), "compatible future minor releases are not version-locked")
    try check(!S4.supportsPerKey([15,0,1,170,6,0,0,0]), "pre-custom firmware remains read-only")
    for invalid: [UInt8] in [[], [23,0,2,170,6,0,0,0], [23,0,1,0,6,0,0,0], [23,0,1,170,7,0,0,0]] {
        try check(S4.stateLength(invalid) == nil && !S4.supportsPerKey(invalid), "unknown protocol families fail closed")
    }
    try check(S4.validState(shapeState, firmware: latestFirmware), "complete preset configuration accepted")
    try check(!S4.validState(state, firmware: latestFirmware), "new firmware cannot silently use a truncated legacy backup")
    try check(!S4.validState(shapeState, firmware: verifiedFirmware), "extended state cannot be sent to old firmware")
    for (offset,value): (Int,UInt8) in [(0,23),(1,101),(2,5),(3,4),(4,2),(9,5),(10,101),(11,5),(12,2),(17,8),(21,5)] {
        var invalid = shapeState; invalid[offset] = value
        try check(!S4.validState(invalid, firmware: latestFirmware), "out-of-schema field rejected: \(offset)")
    }
    for offset in shapeState.indices {
        var changed = shapeState; changed[offset] ^= 1
        try check(S4.statesMatch(shapeState, changed, firmware: latestFirmware) == (offset == 13), "latest schema verifies every implemented byte: \(offset)")
        try check(!S4.statesMatch(shapeState, changed, firmware: futureFirmware), "future releases get no inferred reserved-byte exceptions: \(offset)")
    }
    let geometry: [UInt8] = [0,8,4,6,16,2,0,0]
    try check(S4.validGeometry(geometry), "ANSI S4 geometry accepted")
    for offset in 0...4 {
        var invalid = geometry; invalid[offset] = 99
        try check(!S4.validGeometry(invalid), "changed model or matrix rejected")
    }
    for profile: UInt8 in [0,1] {
        var reply = try S4.frame(command: 0xd5, length: 22, payload: shapeState, handle: profile, key: 0x80)
        reply[0] = 0xaa
        try check(try S4.decode(reply, command: 0xd5, length: 22, handle: profile, key: 0x80) == shapeState, "22-byte state including all shape fields roundtrips")
        do { _ = try S4.decode(reply, command: 0xd5, length: 17, handle: profile, key: 0x80); throw failure("SELF_TEST", "truncated schema route accepted") }
        catch let error as BridgeError { try check(error.code == "ROUTE_MISMATCH", "wrong state length rejected") }
        let frame = try S4.frame(command: 0xd8, length: 4, payload: [0,8,16,24], handle: profile, key: 0x80)
        try check(frame[7] == profile ^ 0x80, "custom colors use the active profile")
    }
    var extendedOff = lightsOff + [3,24,48,96,2]
    let restoredOff = S4.restoreTarget(extendedOff)
    try check(restoredOff[0] == 2 && Array(restoredOff.suffix(5)) == Array(extendedOff.suffix(5)), "off restoration retains preset fields")
    extendedOff[0] = 21; extendedOff[1] = 100
    try check(S4.stateMismatchCode(expected: extendedOff, observed: lightsOff + [3,24,48,96,2]) == "LIGHTING_DISABLED", "new schema still recognizes physical master off")
    var extendedBackup = record
    extendedBackup.firmware = latestFirmware; extendedBackup.state = shapeState; extendedBackup.lightingProfile = 0
    let extendedData = try JSONEncoder().encode(extendedBackup)
    try extendedData.write(to: journal.url(0))
    try check(try journal.read(journal.url(0), serial: "unit-board").state == shapeState, "extended journal keeps shape configuration")
    let archived = try journal.archiveBeforeFirmwareChange(extendedBackup, serial: "unit-board")
    try check(try Data(contentsOf: archived) == extendedData, "firmware upgrade history preserves original bytes")
    try check(!FileManager.default.fileExists(atPath: journal.url(0).path) && journal.profiles == [1], "archiving one firmware baseline leaves the other profile intact")
    try extendedData.write(to: journal.url(0))
    let secondArchive = try journal.archiveBeforeFirmwareChange(extendedBackup, serial: "unit-board")
    try check(archived != secondArchive && FileManager.default.fileExists(atPath: archived.path), "repeat upgrades cannot overwrite recovery history")
    try extendedData.write(to: journal.url(0))
    let custom = (0..<252).map { UInt8($0 % 251) }
    let paletteBackup = try journal.saveCustomColors(custom, record: extendedBackup, serial: "unit-board")
    let persistedPalette = try journal.read(journal.url(0), serial: "unit-board")
    try check(persistedPalette.customColors == custom && persistedPalette.state == shapeState, "custom palette is durable before D8 and original state is retained")
    try check(persistedPalette.renderedColors == extendedBackup.renderedColors, "capturing a hidden palette cannot replace the original rendered frame")
    do { _ = try journal.saveCustomColors([1,2,3], record: paletteBackup, serial: "unit-board"); throw failure("SELF_TEST", "short palette was persisted") }
    catch let error as BridgeError { try check(error.code == "INVALID_BACKUP", "short palette rejected before journal mutation") }
    try check(try journal.read(journal.url(0), serial: "unit-board").customColors == custom, "failed palette update retains recovery original")
    for index in state.indices where index != 5 && index != 13 {
        var mismatch = reservedDrift; mismatch[index] ^= 1
        try check(!S4.statesMatch(state, mismatch, firmware: verifiedFirmware), "every implemented setting remains strict: \(index)")
    }
    for profile: UInt8 in [0,1] {
        for plaintext in [true,false] {
            var reply = try S4.frame(command: 0xd5, length: 17, payload: state, handle: profile, key: 0x5a)
            try check(reply[7] == profile ^ 0x5a, "lighting route follows selected Mac/Win profile")
            reply[0] = 0xaa
            if plaintext { reply.replaceSubrange(4..<8, with: [17,0,0,profile]); reply[3] = S4.checksum(reply) }
            try check(try S4.decode(reply, command: 0xd5, length: 17, handle: profile, key: 0x5a) == state, "both profile routes decode")
            do { _ = try S4.decode(reply, command: 0xd5, length: 17, handle: 1-profile, key: 0x5a); throw failure("SELF_TEST", "wrong profile accepted") }
            catch let error as BridgeError { try check(error.code == "ROUTE_MISMATCH", "wrong profile remains rejected") }
        }
    }
    let oldBackup = LightingBackup(createdAt: "test", serial: "", firmware: [16,0,1,170,6,0,0,0], state: state, renderedColors: Array(repeating: 0, count: 312))
    let decodedOld = try JSONDecoder().decode(LightingBackup.self, from: JSONEncoder().encode(oldBackup))
    try check((decodedOld.lightingProfile ?? 0) == 0, "legacy backup belongs to old fixed Mac route")
    var winBackup = oldBackup; winBackup.lightingProfile = 1
    try check(try JSONDecoder().decode(LightingBackup.self, from: JSONEncoder().encode(winBackup)).lightingProfile == 1, "Win profile survives backup persistence")
    for plaintext in [true, false] {
        var reply = try S4.frame(command: 0xd5, length: 17, payload: state, key: 0x5a)
        reply[0] = 0xaa
        if plaintext { reply.replaceSubrange(4..<8, with: [17,0,0,0]); reply[3] = S4.checksum(reply) }
        try check(try S4.decode(reply, command: 0xd5, length: 17, key: 0x5a) == state, "both reply routing forms")
        reply[10] ^= 1
        do { _ = try S4.decode(reply, command: 0xd5, length: 17, key: 0x5a); throw failure("SELF_TEST", "corruption accepted") }
        catch let error as BridgeError { try check(error.code == "INVALID_CHECKSUM", "corruption rejected") }
    }
    var identity = try S4.frame(command: 0xa1, length: 8, payload: [0x10,0,1,0xaa,6,0,0,0], key: 0x37)
    identity[0] = 0xaa
    let (key, info) = try S4.identify(identity)
    try check(key == 0x37 && info[0] == 0x10, "A1 key derivation without EE")
    try check(S4.firmwareVersion(info) == "1.0.16.6", "current version from S4 fields")
    try check(S4.firmwareVersion([14,0,1,170,6,0,0,0]) == "1.0.14.6", "older version is readable")
    try check(S4.firmwareVersion([10,0,0,170,6,0,0,0]) == "0.0.10.6", "legacy zero-major version")
    try check(S4.firmwareVersion([17,2,1,170,1,2,88,99]) == "1.2.17.513", "16-bit fourth component and reserved tail")
    try check(S4.firmwareVersion([16,0,1,0,6,0,0,0]) == "unknown", "invalid version marker")
    try check(S4.firmwareVersion([16,0,1,170,6]) == "unknown", "truncated version rejected")
    var legacyIdentity = try S4.frame(command: 0xa1, length: 8, payload: [10,0,0,170,6,0,0,0], key: 0x80)
    legacyIdentity[0] = 0xaa
    let (_, legacyInfo) = try S4.identify(legacyIdentity)
    try check(S4.firmwareVersion(legacyInfo) == "0.0.10.6", "identify legacy firmware read-only")
    // Captured from this Air75 V3 with the existing session key 0x80.
    // D1 encrypts only E8 (68 XOR 80); all bytes after it remain zero.
    let capturedCount: [UInt8] = [0xaa,0xd1,0,0xe9,0x81,0x80,0x80,0x80,0xe8] + [UInt8](repeating: 0, count: 55)
    try check(try S4.decodeLEDCount(capturedCount, key: 0x80) == 104, "captured nonzero-key LED count")
    for sessionKey in UInt8.min...UInt8.max {
        for encryptedRoute in [false, true] {
            // Wire fixture, constructed independently from the request encoder.
            var reply: [UInt8] = [0xaa,0xd1,0,0,1,0,0,0,104 ^ sessionKey] + [UInt8](repeating: 0, count: 55)
            if encryptedRoute { for i in 4..<8 { reply[i] ^= sessionKey } }
            reply[3] = UInt8(reply.dropFirst(4).reduce(0) { $0 + Int($1) } & 255)
            try check(try S4.decodeLEDCount(reply, key: sessionKey) == 104, "one-byte D1 across every key and route")
        }
    }
    for wrongCount: UInt8 in [0,83,103,105,255] {
        var reply = capturedCount
        reply[8] = wrongCount ^ 0x80; reply[3] = S4.checksum(reply)
        do { _ = try S4.decodeLEDCount(reply, key: 0x80); throw failure("SELF_TEST", "wrong LED count accepted") }
        catch let error as BridgeError { try check(error.code == "WRONG_LED_COUNT", "unexpected LED count remains rejected") }
    }
    var staleCount = capturedCount
    staleCount[4] = 2 ^ 0x80; staleCount[3] = S4.checksum(staleCount)
    let legacyPayload = try S4.decode(staleCount, command: 0xd1, length: 2, key: 0x80)
    try check(Int(legacyPayload[0]) + 256 * Int(legacyPayload[1]) == 32872, "reproduce old padding-as-count bug")
    do { _ = try S4.decodeLEDCount(staleCount, key: 0x80); throw failure("SELF_TEST", "stale two-byte D1 route accepted") }
    catch let error as BridgeError { try check(error.code == "ROUTE_MISMATCH", "stale D1 response remains rejected") }
    var corruptCount = capturedCount; corruptCount[8] ^= 1
    do { _ = try S4.decodeLEDCount(corruptCount, key: 0x80); throw failure("SELF_TEST", "corrupt D1 accepted") }
    catch let error as BridgeError { try check(error.code == "INVALID_CHECKSUM", "D1 checksum remains enforced") }
    try check(try parseColors([String](repeating: "#ff4080", count: 84), count: 84).count == 252, "84-key input")
    try check(hexColors([255,64,128]) == ["#ff4080"], "RGB formatting")
    do { _ = try S4.frame(command: 0xef, length: 0, key: 0); throw failure("SELF_TEST", "IAP accepted") }
    catch let error as BridgeError { try check(error.code == "INVALID_FRAME", "IAP forbidden") }
    do { _ = try parseColors(["#ffffff"], count: 84); throw failure("SELF_TEST", "short frame accepted") }
    catch let error as BridgeError { try check(error.code == "INVALID_COLORS", "short frame rejected") }
    try check(try TriggerHooks.requestedCode(["enabled": true, "keyCode": 49]) == 49, "space lighting trigger")
    try check(try TriggerHooks.requestedCode(["enabled": false]) == nil, "lighting trigger disabled without key")
    try check(try TriggerHooks.requestedCode(["enabled": true, "keyCode": 0]) == 0, "zero key code remains valid")
    let invalidTriggerCommands: [[String: Any]] = [
        ["enabled": 1, "keyCode": 49], ["enabled": true, "keyCode": true],
        ["enabled": true, "keyCode": 49.5], ["enabled": true, "keyCode": -1],
        ["enabled": true, "keyCode": 55], ["enabled": true, "keyCode": 63],
        ["enabled": true, "keyCode": 49, "suppress": true],
        ["enabled": true, "keyCode": 49, "modifiers": ["command"]]
    ]
    for command in invalidTriggerCommands {
        do {
            _ = try TriggerHooks.requestedCode(command)
            throw failure("SELF_TEST", "invalid lighting trigger configuration accepted")
        } catch let error as BridgeError {
            try check(["INVALID_TRIGGER_KEY", "INVALID_TRIGGER_MONITOR"].contains(error.code), "invalid lighting trigger configuration rejected")
        }
    }
    try check(TriggerHooks.shouldTrigger(type: .keyDown, code: 49, flags: [], autorepeat: 0, configuredCode: 49), "selected trigger key matches")
    try check(!TriggerHooks.shouldTrigger(type: .keyDown, code: 0, flags: [], autorepeat: 0, configuredCode: 49), "unrelated typing ignored")
    try check(!TriggerHooks.shouldTrigger(type: .keyDown, code: 49, flags: [], autorepeat: 1, configuredCode: 49), "held trigger does not repeat")
    try check(!TriggerHooks.shouldTrigger(type: .keyUp, code: 49, flags: [], autorepeat: 0, configuredCode: 49), "trigger release ignored")
    try check(!TriggerHooks.shouldTrigger(type: .keyDown, code: 49, flags: [], autorepeat: 0, configuredCode: nil), "disabled trigger ignores keys")
    for flag: CGEventFlags in [.maskCommand, .maskAlternate, .maskControl, .maskShift] {
        try check(!TriggerHooks.shouldTrigger(type: .keyDown, code: 49, flags: flag, autorepeat: 0, configuredCode: 49), "modified trigger ignored")
    }
    try check(KeyHooks.allowedMonitorCodes == [18,19,20,21,23,22,45], "Codex shortcut allowlist remains separate")
    // Simulate an independent global listener: the chord remains down until
    // release, ends with no injected modifiers, and never releases a modifier
    // that the user was already physically holding. No system events are posted.
    for mask in 1..<32 {
        var requested: CGEventFlags = []
        for (index,pair) in ShortcutChord.modifiers.enumerated() where mask & (1 << index) != 0 { requested.insert(pair.0) }
        for bare in [false,true] {
            for baseline: CGEventFlags in [[],.maskControl,.maskShift] {
                let chord = ShortcutChord(code:2,flags:requested,modifierOnly:bare,alreadyHeld:baseline)
                let all = chord.down + chord.up
                try check((all.last?.flags ?? baseline) == baseline, "global hold restores pre-existing modifiers")
                try check(chord.down.filter{$0.type == .keyDown}.count == (bare ? 0 : 1), "one dictation keydown, none for bare modifiers")
                try check(chord.up.filter{$0.type == .keyUp}.count == (bare ? 0 : 1), "matching dictation release")
                try check(chord.up.filter{$0.type == .flagsChanged}.allSatisfy { step in
                    !ShortcutChord.modifiers.contains{ $0.1 == step.code && baseline.contains($0.0) }
                }, "user-held modifiers are never released")
            }
        }
    }
    try testFirmwareUpgradeLifecycle(check)
    try testFunctionKeyLifecycle(check)
    emit(["ok": true, "selfTest": "passed", "checks": checks, "hardwareOpened": false, "inputMonitorOpened": false])
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.contains("--self-test") {
    do { try selfTest(); Darwin.exit(0) } catch { diagnostic("\(error)"); Darwin.exit(1) }
}
if arguments.contains("--help") {
    print("air75-hid-bridge [--backup /absolute/path.json] [--self-test]\nJSONL stdin/stdout. See native/PROTOCOL.md. HID opens only after connect or restore.")
    Darwin.exit(0)
}
var backupPath = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/Air75 Studio/lighting-backup.json").path
var index = 0
while index < arguments.count {
    guard arguments[index] == "--backup", index + 1 < arguments.count, arguments[index + 1].hasPrefix("/") else {
        diagnostic("Use --backup followed by an absolute path."); Darwin.exit(64)
    }
    backupPath = arguments[index + 1]; index += 2
}
// Ignore SIGPIPE so shutdown can still restore when the parent closes stdout.
signal(SIGPIPE, SIG_IGN)
signal(SIGINT, SIG_IGN); signal(SIGTERM, SIG_IGN); signal(SIGHUP, SIG_IGN)
let server = JSONServer(device: Air75Device(backupURL: URL(fileURLWithPath: backupPath)))
let signals = [SIGINT, SIGTERM, SIGHUP].map { value -> DispatchSourceSignal in
    let source = DispatchSource.makeSignalSource(signal: value, queue: .main)
    source.setEventHandler { server.shutdown() }; source.resume(); return source
}
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        if line.utf8.count > 32768 {
            DispatchQueue.main.async { emit(["id": NSNull(), "ok": false, "error": failure("REQUEST_TOO_LARGE", "A JSONL request must be smaller than 32 KiB.").json]) }
            continue
        }
        do {
            guard let command = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] else {
                throw failure("INVALID_JSON", "Every line must be a JSON object.")
            }
            DispatchQueue.main.async { server.enqueue(command) }
        } catch {
            DispatchQueue.main.async { emit(["id": NSNull(), "ok": false, "error": failure("INVALID_JSON", "Invalid JSON request.").json]) }
        }
    }
    DispatchQueue.main.async { server.finishInput() }
}
CFRunLoopRun()
