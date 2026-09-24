import AppKit

// Import the supplied artwork without redrawing or recoloring the logo.
// Keep the complete mark, including ®, with room around the main lettering.
guard CommandLine.arguments.count == 3,
      let source = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let sourceData = try? Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])),
      let sourceBitmap = NSBitmapImageRep(data: sourceData) else {
    fatalError("Usage: icon SOURCE.png DESTINATION.iconset")
}
let width = sourceBitmap.pixelsWide, height = sourceBitmap.pixelsHigh
source.size = NSSize(width: width, height: height)
var minX = width, minY = height, maxX = 0, maxY = 0
// Ignore the dark margin while keeping all visible letters and the registered mark.
for y in 0..<height {
    for x in 0..<width {
        guard let color = sourceBitmap.colorAt(x: x, y: y)?.usingColorSpace(.sRGB),
              color.alphaComponent > 0.5,
              max(color.redComponent, color.greenComponent, color.blueComponent) > 0.18 else { continue }
        minX = min(minX, x); maxX = max(maxX, x)
        minY = min(minY, y); maxY = max(maxY, y)
    }
}
guard minX < maxX, minY < maxY else { fatalError("No visible logo found") }
let artworkCoverage: CGFloat = 0.72
// The small ® extends the bounds rightward but carries little visual weight.
// Shift the lettering slightly right and down for optical balance (AppKit y is up).
let opticalOffset = NSPoint(x: 0.04, y: -0.01)
let cropSize = CGFloat(max(maxX - minX + 1, maxY - minY + 1)) / artworkCoverage
let crop = NSRect(x: CGFloat(minX + maxX + 1) / 2 - cropSize / 2 - opticalOffset.x * cropSize,
    y: CGFloat(height) - CGFloat(minY + maxY + 1) / 2 - cropSize / 2 - opticalOffset.y * cropSize,
    width: cropSize, height: cropSize)
let corner = sourceBitmap.colorAt(x: 0, y: 0)?.usingColorSpace(.sRGB) ?? .black
let background = NSColor(srgbRed: corner.redComponent, green: corner.greenComponent,
    blue: corner.blueComponent, alpha: 1)
let destination = URL(fileURLWithPath: CommandLine.arguments[2])
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)

for size in [16, 32, 64, 128, 256, 512, 1024] {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: size * 4, bitsPerPixel: 32),
        let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Cannot create icon bitmap")
    }
    bitmap.size = NSSize(width: size, height: size)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    let unit = CGFloat(size) / 1024
    let tile = NSRect(x: 48 * unit, y: 48 * unit, width: 928 * unit, height: 928 * unit)
    let outline = NSBezierPath(roundedRect: tile, xRadius: 210 * unit, yRadius: 210 * unit)
    outline.addClip()
    // Match the dark background already present in the supplied PNG.
    background.setFill()
    outline.fill()
    source.draw(in: tile, from: crop,
        operation: .sourceOver, fraction: 1, respectFlipped: false, hints: nil)
    NSGraphicsContext.restoreGraphicsState()
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Cannot encode icon PNG")
    }
    let names: [String]
    switch size {
    case 16: names = ["icon_16x16.png"]
    case 32: names = ["icon_16x16@2x.png", "icon_32x32.png"]
    case 64: names = ["icon_32x32@2x.png"]
    case 128: names = ["icon_128x128.png"]
    case 256: names = ["icon_128x128@2x.png", "icon_256x256.png"]
    case 512: names = ["icon_256x256@2x.png", "icon_512x512.png"]
    default: names = ["icon_512x512@2x.png"]
    }
    for name in names { try png.write(to: destination.appendingPathComponent(name)) }
}
