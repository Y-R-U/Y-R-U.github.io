// macOS Vision text finder for the classic-posters pilot: prints JSON [{file, boxes: [{text, conf, x, y, w, h}]}]
// with boxes in 0–1 image coordinates, origin top-left. Usage: swift tools/pd_ocr.swift a.jpg b.jpg …
import Foundation
import Vision
import AppKit

var out: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    out.append(["file": path, "error": "unreadable"]); continue
  }
  var boxes: [[String: Any]] = []
  let req = VNRecognizeTextRequest { r, _ in
    for o in (r.results as? [VNRecognizedTextObservation]) ?? [] {
      guard let c = o.topCandidates(1).first else { continue }
      let b = o.boundingBox
      boxes.append(["text": c.string, "conf": c.confidence, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height])
    }
  }
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  req.minimumTextHeight = 0.008
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
  out.append(["file": path, "boxes": boxes])
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted])
print(String(data: data, encoding: .utf8)!)
