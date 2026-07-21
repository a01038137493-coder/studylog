//
//  ShareViewController.swift
//  디턴로그 ShareExtension
//
//  공유 시트에서 스크린샷을 받아 App Group 에 저장하고 본앱을 연다.
//  OCR·일정 분석은 본앱(JS 파서)이 이어서 수행한다 — 파서 로직을 한 곳에 유지.
//

import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {

    private let appGroupID = "group.com.studylog.app"
    private let openURL = URL(string: "dittonlog://shared-screenshot")!

    private let statusLabel = UILabel()
    private let openButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        buildUI()
        loadAndStash()
    }

    private func buildUI() {
        statusLabel.text = "스크린샷을 준비하는 중…"
        statusLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        openButton.setTitle("디턴로그에서 일정 등록", for: .normal)
        openButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        openButton.backgroundColor = .black
        openButton.setTitleColor(.white, for: .normal)
        openButton.layer.cornerRadius = 14
        openButton.isHidden = true
        openButton.addTarget(self, action: #selector(openApp), for: .touchUpInside)

        let cancel = UIButton(type: .system)
        cancel.setTitle("취소", for: .normal)
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [statusLabel, openButton, cancel])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            openButton.heightAnchor.constraint(equalToConstant: 54),
        ])
    }

    // MARK: - 이미지 수신 → App Group 저장

    private func loadAndStash() {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] }
            .filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) } ?? []

        guard let provider = providers.first else {
            showError("이미지를 찾지 못했습니다.\n스크린샷을 공유해주세요.")
            return
        }

        provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] item, _ in
            var image: UIImage?
            switch item {
            case let ui as UIImage: image = ui
            case let url as URL: image = (try? Data(contentsOf: url)).flatMap(UIImage.init(data:))
            case let data as Data: image = UIImage(data: data)
            default: break
            }
            DispatchQueue.main.async {
                guard let image, let jpeg = Self.downscaledJPEG(image) else {
                    self?.showError("이미지를 처리하지 못했습니다.")
                    return
                }
                guard self?.writeToAppGroup(jpeg) == true else {
                    self?.showError("저장하지 못했습니다.\n앱을 업데이트한 뒤 다시 시도해주세요.")
                    return
                }
                self?.statusLabel.text = "스크린샷 준비 완료!\n디턴로그에서 일정 등록을 이어가세요."
                self?.openButton.isHidden = false
                // 자동으로 본앱 열기 시도 (실패해도 버튼으로 열 수 있음)
                self?.openApp()
            }
        }
    }

    private static func downscaledJPEG(_ image: UIImage, maxDim: CGFloat = 2048) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxDim ? maxDim / longest : 1
        let target = CGSize(width: floor(image.size.width * scale),
                            height: floor(image.size.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let drawn = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return drawn.jpegData(compressionQuality: 0.9)
    }

    private func writeToAppGroup(_ data: Data) -> Bool {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else { return false }
        let url = container.appendingPathComponent("pending-screenshot.jpg")
        return (try? data.write(to: url, options: .atomic)) != nil
    }

    // MARK: - 본앱 열기 (Share Extension 은 공식 openURL 이 없어 responder 체인 사용)

    @objc private func openApp() {
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication {
                app.open(openURL, options: [:], completionHandler: nil)
                break
            }
            // selector 기반 폴백 (일부 iOS 버전)
            if r.responds(to: NSSelectorFromString("openURL:")) {
                r.perform(NSSelectorFromString("openURL:"), with: openURL)
                break
            }
            responder = r.next
        }
        // 앱 열기 시도 후 시트 종료
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    @objc private func cancelTapped() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func showError(_ message: String) {
        statusLabel.text = message
        openButton.isHidden = true
    }
}
