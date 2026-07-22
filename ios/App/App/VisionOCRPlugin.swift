//
//  VisionOCRPlugin.swift
//  핀로그 — 앱 내장 Capacitor 플러그인
//
//  스크린샷 이미지를 온디바이스 Vision OCR(한국어)로 읽는다.
//  JS: window.Capacitor.Plugins.VisionOCR.recognize({ base64 })
//      → { text: string, lines: string[], confidence: number }
//
//  개인정보: 이미지·텍스트 모두 기기 안에서만 처리되며 어디에도 저장·전송하지 않는다.
//

import Foundation
import UIKit
import Vision
import Capacitor
import QuickLook

@objc(VisionOCRPlugin)
public class VisionOCRPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "VisionOCRPlugin"
    public let jsName = "VisionOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeSharedScreenshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasSharedFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeSharedFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasSharedText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeSharedText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewFile", returnType: CAPPluginReturnPromise)
    ]

    private var previewURL: URL?

    /* iOS 내장 뷰어(QuickLook)로 파일 열기 — 이미지·PDF·오피스 문서 등 */
    @objc func previewFile(_ call: CAPPluginCall) {
        guard let b64 = call.getString("base64"),
              let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else {
            call.reject("invalid_data")
            return
        }
        let rawName = call.getString("name") ?? "파일"
        let safeName = rawName.replacingOccurrences(of: "/", with: "_")
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("dt-preview", isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(safeName)
        do { try data.write(to: url, options: .atomic) } catch {
            call.reject("write_failed")
            return
        }
        DispatchQueue.main.async {
            self.previewURL = url
            let ql = QLPreviewController()
            ql.dataSource = self
            self.bridge?.viewController?.present(ql, animated: true)
            call.resolve()
        }
    }

    private static let appGroupID = "group.com.pinlog.app"

    /// Share Extension 이 App Group 에 남긴 스크린샷을 꺼내온다 (꺼내면서 삭제).
    /// JS: VisionOCR.takeSharedScreenshot() → { base64: string | null }
    @objc func takeSharedScreenshot(_ call: CAPPluginCall) {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupID) else {
            call.resolve(["base64": NSNull()])
            return
        }
        let url = container.appendingPathComponent("pending-screenshot.jpg")
        guard let data = try? Data(contentsOf: url) else {
            call.resolve(["base64": NSNull()])
            return
        }
        try? FileManager.default.removeItem(at: url)
        call.resolve(["base64": data.base64EncodedString()])
    }

    /* 공유 시트로 받은 일반 파일 (App Group pending-file/) */
    private func pendingSharedFileURL() -> URL? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupID) else { return nil }
        let dir = container.appendingPathComponent("pending-file", isDirectory: true)
        let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return items.first
    }

    @objc func hasSharedFile(_ call: CAPPluginCall) {
        call.resolve(["pending": pendingSharedFileURL() != nil])
    }

    @objc func takeSharedFile(_ call: CAPPluginCall) {
        guard let url = pendingSharedFileURL(), let data = try? Data(contentsOf: url) else {
            call.resolve(["base64": NSNull()])
            return
        }
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        call.resolve(["base64": data.base64EncodedString(), "name": url.lastPathComponent])
    }

    /* 공유 시트로 받은 텍스트 (일정 자동 인식용, App Group pending-text.txt) */
    private func pendingSharedTextURL() -> URL? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupID) else { return nil }
        let url = container.appendingPathComponent("pending-text.txt")
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    @objc func hasSharedText(_ call: CAPPluginCall) {
        call.resolve(["pending": pendingSharedTextURL() != nil])
    }

    @objc func takeSharedText(_ call: CAPPluginCall) {
        guard let url = pendingSharedTextURL(),
              let text = try? String(contentsOf: url, encoding: .utf8) else {
            call.resolve(["text": NSNull()])
            return
        }
        try? FileManager.default.removeItem(at: url)
        call.resolve(["text": text])
    }

    @objc func recognize(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"),
              let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data),
              let cgImage = normalized(image)?.cgImage else {
            call.reject("invalid_image")
            return
        }

        let request = VNRecognizeTextRequest { request, error in
            if let error {
                call.reject("ocr_failed", nil, error)
                return
            }
            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            let result = Self.postprocess(observations)
            call.resolve([
                "text": result.text,
                "lines": result.lines,
                "confidence": result.confidence,
            ])
        }
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["ko-KR", "en-US"]
        request.usesLanguageCorrection = true

        DispatchQueue.global(qos: .userInitiated).async {
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                call.reject("ocr_failed", nil, error)
            }
        }
    }

    /// 방향 보정 + 긴 변 2048px 제한
    private func normalized(_ image: UIImage) -> UIImage? {
        let maxDim: CGFloat = 2048
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxDim ? maxDim / longest : 1
        let target = CGSize(width: floor(image.size.width * scale),
                            height: floor(image.size.height * scale))
        if scale == 1, image.imageOrientation == .up { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    /// 상태바 제거 → 위→아래 정렬 → 같은 줄 좌우 병합
    static func postprocess(
        _ observations: [VNRecognizedTextObservation]
    ) -> (text: String, lines: [String], confidence: Double) {

        struct Line { var text: String; var confidence: Float; var box: CGRect }

        var lines: [Line] = observations.compactMap { obs in
            guard let candidate = obs.topCandidates(1).first else { return nil }
            let text = candidate.string.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return nil }
            return Line(text: text, confidence: candidate.confidence, box: obs.boundingBox)
        }

        // 상태바(최상단)의 시간·배터리·통신사 텍스트 제거
        lines.removeAll { line in
            guard line.box.minY > 0.955 else { return false }
            let compact = line.text.replacingOccurrences(of: " ", with: "")
            let patterns = [#"^\d{1,2}:\d{2}$"#, #"^\d{1,3}%?$"#,
                            #"^(LTE|5G|4G|3G)$"#, #"^(오전|오후)\d{1,2}:\d{2}$"#]
            return patterns.contains { compact.range(of: $0, options: .regularExpression) != nil }
        }

        // Vision 은 좌하단 원점 → y 내림차순이 화면 위→아래
        lines.sort { $0.box.midY > $1.box.midY }

        var merged: [Line] = []
        for line in lines {
            if let last = merged.last,
               abs(last.box.midY - line.box.midY) < min(last.box.height, line.box.height) * 0.6 {
                let pair = [last, line].sorted { $0.box.minX < $1.box.minX }
                merged[merged.count - 1] = Line(
                    text: pair.map(\.text).joined(separator: " "),
                    confidence: min(last.confidence, line.confidence),
                    box: last.box.union(line.box)
                )
            } else {
                merged.append(line)
            }
        }

        let texts = merged.map(\.text)
        let avg = merged.isEmpty ? 0 : merged.map { Double($0.confidence) }.reduce(0, +) / Double(merged.count)
        return (texts.joined(separator: "\n"), texts, avg)
    }
}

extension VisionOCRPlugin: QLPreviewControllerDataSource {
    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return previewURL == nil ? 0 : 1
    }
    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return (previewURL ?? URL(fileURLWithPath: "/")) as NSURL
    }
}
