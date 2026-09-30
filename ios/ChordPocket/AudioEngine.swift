import AVFoundation
import QuartzCore

/// Hosts the C synth (cpsynth.c) inside AVAudioEngine. Because the audio is produced in the
/// app's own process, the app's audio session applies:
/// `.playback` + `.mixWithOthers` → other apps keep playing and the silent switch is ignored.
final class AudioEngine {
    static let shared = AudioEngine()

    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private(set) var started = false
    private var observers: [NSObjectProtocol] = []

    func configureSession() {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try s.setPreferredIOBufferDuration(0.005)
            try s.setActive(true)
        } catch {
            NSLog("ChordPocket audio session error: \(error)")
        }
    }

    func start() {
        guard !started else { resumeIfNeeded(); return }
        configureSession()
        var tb = mach_timebase_info_data_t()
        mach_timebase_info(&tb)
        let ticksToSeconds = Double(tb.numer) / Double(tb.denom) / 1_000_000_000.0

        let hw = engine.outputNode.outputFormat(forBus: 0)
        let sampleRate = hw.sampleRate > 0 ? hw.sampleRate : AVAudioSession.sharedInstance().sampleRate
        cp_init(sampleRate)
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2) else { return }

        let node = AVAudioSourceNode(format: format) { _, timestamp, frameCount, bufferList -> OSStatus in
            let abl = UnsafeMutableAudioBufferListPointer(bufferList)
            guard abl.count >= 2,
                  let l = abl[0].mData?.assumingMemoryBound(to: Float.self),
                  let r = abl[1].mData?.assumingMemoryBound(to: Float.self) else { return noErr }
            let ts = timestamp.pointee
            let host: Double = ts.mFlags.contains(.hostTimeValid)
                ? Double(ts.mHostTime) * ticksToSeconds
                : CACurrentMediaTime()
            cp_render(l, r, Int32(frameCount), host)
            return noErr
        }
        source = node
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 1.0
        engine.prepare()
        do {
            try engine.start()
            started = true
        } catch {
            NSLog("ChordPocket engine start error: \(error)")
        }
        observe()
    }

    func pause() {
        guard started else { return }
        engine.pause()
    }

    func resumeIfNeeded() {
        guard started, !engine.isRunning else { return }
        configureSession()
        do { try engine.start() } catch { NSLog("ChordPocket engine restart error: \(error)") }
    }

    private func observe() {
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            if type == .ended { self?.resumeIfNeeded() }
        })
        observers.append(nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            // Route change (headphones, AirPods): the mixer converts the sample rate, just restart.
            self?.resumeIfNeeded()
        })
        observers.append(nc.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            self?.resumeIfNeeded()
        })
    }
}
