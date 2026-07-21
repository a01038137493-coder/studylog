//
//  ActionViewController.swift
//  핀로그 ActionExtension — 공유 시트 하단 "동작" 목록용 (내용은 ShareExtension과 동일)
//
//  공유 시트에서 받은 항목을 App Group 에 저장하고 본앱을 연다.
//  - 이미지(스크린샷): OCR → 일정 자동 등록 흐름 (본앱 캘린더)
//  - 일반 파일(PDF·문서 등): 파일 보관함 자동 저장 흐름 (본앱 파일 페이지)
//

import UIKit
import UniformTypeIdentifiers

final class ActionViewController: UIViewController {

    private let appGroupID = "group.com.pinlog.app"
    private let maxFileSize = 25 * 1024 * 1024

    private let statusLabel = UILabel()
    private let openButton = UIButton(type: .system)
    private var openURLTarget = URL(string: "dittonlog://shared-screenshot")!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        buildUI()
        loadAndStash()
    }

    private func buildUI() {
        statusLabel.text = "준비하는 중…"
        statusLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        openButton.setTitle("핀로그에서 계속하기", for: .normal)
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

    // MARK: - 수신 항목 분기

    private func loadAndStash() {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] } ?? []

        if let imageProv = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }) {
            stashImage(imageProv)
        } else if let fileProv = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) ||
            $0.hasItemConformingToTypeIdentifier(UTType.data.identifier)
        }) {
            stashFile(fileProv)
        } else {
            showError("공유할 수 있는 항목을 찾지 못했습니다.")
        }
    }

    // MARK: - 이미지(스크린샷) → 일정 인식 흐름

    private func stashImage(_ provider: NSItemProvider) {
        statusLabel.text = "스크린샷을 준비하는 중…"
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
                guard self?.writeToAppGroup(jpeg, path: "pending-screenshot.jpg") == true else {
                    self?.showError("저장하지 못했습니다.\n앱을 업데이트한 뒤 다시 시도해주세요.")
                    return
                }
                self?.openURLTarget = URL(string: "dittonlog://shared-screenshot")!
                self?.statusLabel.text = "스크린샷 준비 완료!\n핀로그에서 일정 등록을 이어가세요."
                self?.openButton.setTitle("핀로그에서 일정 등록", for: .normal)
                self?.openButton.isHidden = false
                self?.openApp()
            }
        }
    }

    // MARK: - 일반 파일 → 파일 보관함 자동 저장 흐름

    private func stashFile(_ provider: NSItemProvider) {
        statusLabel.text = "파일을 준비하는 중…"
        let handle: (Data?, String?) -> Void = { [weak self] data, name in
            DispatchQueue.main.async {
                guard let self else { return }
                guard let data else { self.showError("파일을 읽지 못했습니다."); return }
                guard data.count <= self.maxFileSize else {
                    self.showError("25MB 이하 파일만 저장할 수 있어요.")
                    return
                }
                let safeName = (name?.isEmpty == false ? name! : "공유 파일")
                guard self.writeToAppGroup(data, path: "pending-file/\(safeName)", resetDir: "pending-file") else {
                    self.showError("저장하지 못했습니다.\n앱을 업데이트한 뒤 다시 시도해주세요.")
                    return
                }
                self.openURLTarget = URL(string: "dittonlog://shared-file")!
                self.statusLabel.text = "파일 준비 완료!\n핀로그 파일함에 자동으로 저장됩니다."
                self.openButton.setTitle("핀로그에 파일 저장", for: .normal)
                self.openButton.isHidden = false
                self.openApp()
            }
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                if let url = item as? URL {
                    handle(try? Data(contentsOf: url), url.lastPathComponent)
                } else { handle(nil, nil) }
            }
        } else {
            let suggested = provider.suggestedName
            provider.loadItem(forTypeIdentifier: UTType.data.identifier, options: nil) { item, _ in
                switch item {
                case let url as URL: handle(try? Data(contentsOf: url), url.lastPathComponent)
                case let data as Data: handle(data, suggested)
                default: handle(nil, nil)
                }
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

    @discardableResult
    private func writeToAppGroup(_ data: Data, path: String, resetDir: String? = nil) -> Bool {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else { return false }
        if let resetDir {
            let dir = container.appendingPathComponent(resetDir, isDirectory: true)
            try? FileManager.default.removeItem(at: dir)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        let url = container.appendingPathComponent(path)
        return (try? data.write(to: url, options: .atomic)) != nil
    }

    // MARK: - 본앱 열기 (Share Extension 은 공식 openURL 이 없어 responder 체인 사용)

    @objc private func openApp() {
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication {
                app.open(openURLTarget, options: [:], completionHandler: nil)
                break
            }
            if r.responds(to: NSSelectorFromString("openURL:")) {
                r.perform(NSSelectorFromString("openURL:"), with: openURLTarget)
                break
            }
            responder = r.next
        }
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
