//
//  AppViewController.swift
//  디턴로그
//
//  앱 내장 플러그인(VisionOCR)을 브리지에 등록하는 커스텀 브리지 컨트롤러.
//  (npm 플러그인은 packageClassList 로 자동 등록되지만, 앱 로컬 플러그인은
//   cap sync 가 목록을 덮어쓰므로 여기서 직접 등록한다)
//

import UIKit
import Capacitor

class AppViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VisionOCRPlugin())
    }
}
