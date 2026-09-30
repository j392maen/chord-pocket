import UIKit
import WebKit
import QuartzCore

/// Avoids the retain cycle WKUserContentController → handler → web view.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        target?.userContentController(c, didReceive: m)
    }
}

final class WebViewController: UIViewController, WKScriptMessageHandler, WKURLSchemeHandler, WKNavigationDelegate {
    private var webView: WKWebView!
    private let renderQueue = DispatchQueue(label: "chordpocket.prerender", qos: .userInitiated)
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let selection = UISelectionFeedbackGenerator()
    private var lastSelection: CFTimeInterval = 0
    private static let stateKey = "chordpocket.state.v1"

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self, forURLScheme: "cpapp")
        config.userContentController.add(WeakScriptHandler(self), name: "cp")
        if let saved = UserDefaults.standard.string(forKey: Self.stateKey),
           let data = saved.data(using: .utf8),
           (try? JSONSerialization.jsonObject(with: data)) != nil {
            let script = WKUserScript(source: "window.__CP_SAVED = \(saved);", injectionTime: .atDocumentStart, forMainFrameOnly: true)
            config.userContentController.addUserScript(script)
        }
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isOpaque = false
        wv.backgroundColor = UIColor(red: 0.137, green: 0.188, blue: 0.172, alpha: 1)
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.bounces = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.allowsLinkPreview = false
        wv.navigationDelegate = self
        if #available(iOS 16.4, *) { wv.isInspectable = true }
        webView = wv
        view = wv
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        [light, medium, heavy].forEach { $0.prepare() }
        selection.prepare()
        webView.load(URLRequest(url: URL(string: "cpapp://app/index.html")!))
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    // MARK: - Bundled web app served from the app bundle (stable origin → localStorage works)
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = Bundle.main.resourceURL!.appendingPathComponent("Web").appendingPathComponent(String(path.dropFirst()))
        guard let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let ext = file.pathExtension.lowercased()
        let mime = ["html": "text/html", "js": "text/javascript", "css": "text/css", "png": "image/png", "woff2": "font/woff2", "json": "application/json"][ext] ?? "application/octet-stream"
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": mime + (mime.hasPrefix("text") ? "; charset=utf-8" : ""), "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // MARK: - JS → native bridge
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let op = body["op"] as? String else { return }
        switch op {
        case "start":
            AudioEngine.shared.start()
        case "ping":
            let p = num(body, "p")
            webView.evaluateJavaScript("NativeEngine._pong(\(p), \(CACurrentMediaTime()))", completionHandler: nil)
        case "batch":
            if let list = body["m"] as? [[String: Any]] { list.forEach(handle) }
        case "haptic":
            haptic(body["k"] as? String ?? "light")
        case "scope":
            var buf = [Float](repeating: 0, count: 512)
            buf.withUnsafeMutableBufferPointer { cp_scope($0.baseAddress, 512) }
            let js = "NativeEngine._scopeIn([" + buf.map { String(format: "%.3f", $0) }.joined(separator: ",") + "])"
            webView.evaluateJavaScript(js, completionHandler: nil)
        case "sample":
            loadSample(body)
        case "save":
            if let s = body["data"] as? String { UserDefaults.standard.set(s, forKey: Self.stateKey) }
        default:
            break
        }
    }

    private func handle(_ m: [String: Any]) {
        guard let op = m["op"] as? String else { return }
        var e = cp_event_t()
        e.ch = Int32(num(m, "ch"))
        e.time = num(m, "t")
        e.glideFrom = -1
        switch op {
        case "on":
            e.type = Int32(CP_EV_NOTE_ON); e.id = Int32(num(m, "id")); e.midi = Float(num(m, "m")); e.vel = Float(num(m, "v", 0.8)); e.glideFrom = Float(num(m, "g", -1))
        case "off":
            e.type = Int32(CP_EV_NOTE_OFF); e.id = Int32(num(m, "id"))
        case "glide":
            e.type = Int32(CP_EV_GLIDE); e.id = Int32(num(m, "id")); e.midi = Float(num(m, "m"))
        case "gate":
            e.type = Int32(CP_EV_GATE); e.value = Float(num(m, "v", 1))
        case "kill":
            e.type = Int32(CP_EV_KILL)
        case "vol":
            e.type = Int32(CP_EV_VOLUME); e.value = Float(num(m, "v", 0.8))
        case "dtime":
            e.type = Int32(CP_EV_DELAYTIME); e.value = Float(num(m, "v", 0.25))
        case "click":
            e.type = Int32(CP_EV_CLICK); e.value = Float(num(m, "a"))
        case "drum":
            e.type = Int32(CP_EV_DRUM); e.drum = Int32(num(m, "i")); e.vel = Float(num(m, "v", 1)); e.kit = Int32(num(m, "k"))
        case "patch":
            guard let p = m["p"] as? [String: Any] else { return }
            e.type = Int32(CP_EV_PATCH); e.patch = patch(from: p)
            if Int(num(p, "eng")) == Int(CP_ENG_RENDER) { prerender(kind: Int32(num(p, "kind")), midis: Array(36...88)) }
        case "prerender":
            let midis = (m["m"] as? [NSNumber])?.map { $0.intValue } ?? []
            prerender(kind: Int32(num(m, "kind")), midis: midis)
            return
        default:
            return
        }
        _ = withUnsafePointer(to: &e) { cp_push($0) }
    }

    private func prerender(kind: Int32, midis: [Int]) {
        renderQueue.async {
            for midi in midis where cp_is_rendered(kind, Int32(midi)) == 0 { cp_prerender(kind, Int32(midi)) }
        }
    }

    private func patch(from p: [String: Any]) -> cp_patch_t {
        var out = cp_patch_t()
        var s = cp_sound_t()
        s.eng = Int32(num(p, "eng")); s.wave = Int32(num(p, "wave")); s.kind = Int32(num(p, "kind"))
        let waves = ints(p["waves"]), det = floats(p["det"]), mix = floats(p["mix"]), formant = floats(p["formant"])
        s.nwaves = Int32(min(3, waves.count))
        s.waves = (waves.at(0), waves.at(1), waves.at(2))
        s.det = (det.at(0), det.at(1), det.at(2))
        s.mix = (mix.at(0), mix.at(1), mix.at(2))
        s.nformant = Int32(min(3, formant.count))
        s.formant = (formant.at(0), formant.at(1), formant.at(2))
        s.lp = Float(num(p, "lp")); s.fenv = Float(num(p, "fenv")); s.lfoFilt = Float(num(p, "lfoFilt"))
        s.breath = Float(num(p, "breath")); s.cut = Float(num(p, "cut", 1)); s.oct = Int32(num(p, "oct"))
        s.ratio = Float(num(p, "ratio", 1)); s.index = Float(num(p, "index")); s.idxDecay = Float(num(p, "idxDecay"))
        s.idxAttack = Float(num(p, "idxAttack")); s.idxPeak = Float(num(p, "idxPeak")); s.tine = Float(num(p, "tine")); s.ratio2 = Float(num(p, "ratio2"))
        out.snd = s
        out.a = Float(num(p, "a", 0.01)); out.d = Float(num(p, "d", 0.3)); out.s = Float(num(p, "s", 0.8)); out.r = Float(num(p, "r", 0.5))
        out.level = Float(num(p, "level", 1))
        out.reverb = Float(num(p, "reverb")); out.delay = Float(num(p, "delay")); out.chorus = Float(num(p, "chorus"))
        out.flanger = Float(num(p, "flanger")); out.tremolo = Float(num(p, "tremolo")); out.tremRate = Float(num(p, "tremRate", 5))
        out.vibrato = Float(num(p, "vibrato")); out.cutoff = Float(num(p, "cutoff", 20000)); out.glide = Float(num(p, "glide"))
        out.stereo = Float(num(p, "stereo")); out.voices = Int32(num(p, "voices", 1))
        return out
    }

    private func loadSample(_ body: [String: Any]) {
        guard let b64 = body["data"] as? String, let data = Data(base64Encoded: b64) else { return }
        let count = data.count / MemoryLayout<Float>.size
        guard count > 0, let ptr = malloc(count * MemoryLayout<Float>.size)?.assumingMemoryBound(to: Float.self) else { return }
        data.withUnsafeBytes { raw in _ = memcpy(ptr, raw.baseAddress!, count * MemoryLayout<Float>.size) }
        let old = cp_set_user_sample(ptr, Int32(count), num(body, "sr", 44100), Float(num(body, "root", 261.63)))
        if let old = old {
            // free the previous buffer once the audio thread can no longer be reading it
            DispatchQueue.global().asyncAfter(deadline: .now() + 10) { free(old) }
        }
    }

    private func haptic(_ kind: String) {
        switch kind {
        case "heavy": heavy.impactOccurred(); heavy.prepare()
        case "medium": medium.impactOccurred(); medium.prepare()
        case "selection":
            let now = CACurrentMediaTime()
            if now - lastSelection > 0.03 { selection.selectionChanged(); selection.prepare(); lastSelection = now }
        default: light.impactOccurred(intensity: 0.8); light.prepare()
        }
    }

    // MARK: - helpers
    private func num(_ d: [String: Any], _ k: String, _ def: Double = 0) -> Double {
        if let n = d[k] as? NSNumber { return n.doubleValue }
        return def
    }
    private func ints(_ v: Any?) -> [Int32] { ((v as? [NSNumber]) ?? []).map { Int32(truncating: $0) } }
    private func floats(_ v: Any?) -> [Float] { ((v as? [NSNumber]) ?? []).map { $0.floatValue } }
}

private extension Array where Element == Int32 { func at(_ i: Int) -> Int32 { i < count ? self[i] : 0 } }
private extension Array where Element == Float { func at(_ i: Int) -> Float { i < count ? self[i] : 0 } }
