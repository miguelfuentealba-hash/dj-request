// Ícono 1024x1024 estilo macOS: cuadrado redondeado con el logo DJ Miky y una insignia de QR.
import Cocoa
let a = CommandLine.arguments
let logo = NSImage(contentsOfFile: a[1])!
let S: CGFloat = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(S), pixelsHigh: Int(S), bitsPerSample: 8,
  samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
// fondo redondeado (margen estándar de íconos de macOS: 100px)
let box = NSRect(x: 100, y: 100, width: 824, height: 824)
let shape = NSBezierPath(roundedRect: box, xRadius: 185, yRadius: 185)
NSGraphicsContext.saveGraphicsState()
let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.4)
sh.shadowBlurRadius = 24; sh.shadowOffset = NSSize(width: 0, height: -12); sh.set()
NSColor(srgbRed: 0.114, green: 0.125, blue: 0.2, alpha: 1).setFill(); shape.fill()
NSGraphicsContext.restoreGraphicsState()
NSGraphicsContext.saveGraphicsState(); shape.addClip()
logo.draw(in: box.insetBy(dx: -20, dy: -20))
NSGraphicsContext.restoreGraphicsState()
// insignia: cuadrito blanco con un QR esquemático, abajo a la derecha
let b = NSRect(x: 694, y: 110, width: 230, height: 230)
NSGraphicsContext.saveGraphicsState()
let sh2 = NSShadow(); sh2.shadowColor = NSColor.black.withAlphaComponent(0.5); sh2.shadowBlurRadius = 18; sh2.set()
NSColor.white.setFill(); NSBezierPath(roundedRect: b, xRadius: 44, yRadius: 44).fill()
NSGraphicsContext.restoreGraphicsState()
let ink = NSColor(srgbRed: 0.93, green: 0.13, blue: 0.47, alpha: 1)
let m: CGFloat = 26, cell = (b.width - 2*m) / 7
func px(_ x: Int, _ y: Int) { ink.setFill(); NSRect(x: b.minX + m + CGFloat(x)*cell, y: b.minY + m + CGFloat(y)*cell, width: cell, height: cell).fill() }
func finder(_ x: Int, _ y: Int) {
  let r = NSRect(x: b.minX + m + CGFloat(x)*cell, y: b.minY + m + CGFloat(y)*cell, width: cell*3, height: cell*3)
  ink.setFill(); r.fill(); NSColor.white.setFill(); r.insetBy(dx: cell*0.55, dy: cell*0.55).fill()
  ink.setFill(); r.insetBy(dx: cell, dy: cell).fill()
}
finder(0, 4); finder(4, 4); finder(0, 0)
for (x, y) in [(4,0),(6,0),(5,1),(4,2),(6,2),(5,3),(3,5),(3,1),(3,3),(6,1)] { px(x, y) }
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
