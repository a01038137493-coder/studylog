//
//  VisionOCRPlugin.swift
//  디턴로그 — 앱 내장 Capacitor 플러그인
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

@objc(VisionOCRPlugin)
public class VisionOCRPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "VisionOCRPlugin"
    public let jsName = "VisionOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeSharedScreenshot", returnType: CAPPluginReturnPromise)
    ]

    private static let appGroupID = "group.com.studylog.app"

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
