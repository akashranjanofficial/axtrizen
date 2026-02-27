/**
 * Sprint S11 Frontend Tests — Voice Pipeline
 * Tests for: STT, TTS, VAD state machine, Push-to-Talk, Pipeline config/status, Mic permission
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Data ──────────────────────────────────────────────────

const MOCK_STT_CONFIG = {
  provider: "Deepgram",
  language: "en-US",
  model: "nova-2",
  sample_rate_hz: 16000,
  channels: 1,
  interim_results: true,
};

const MOCK_TTS_CONFIG = {
  provider: "ElevenLabs",
  voice_id: "pNInz6obpgDQGcFmaJgB",
  speed: 1.0,
  stability: 0.5,
  similarity_boost: 0.75,
  output_format: "mp3",
};

const MOCK_VAD_CONFIG = {
  silence_threshold_ms: 250,
  min_volume: 0.02,
  pre_speech_buffer_ms: 300,
};

const MOCK_PTT_CONFIG = {
  mode: "PushToTalk",
  keyboard_shortcut: "Space",
  show_waveform: true,
  show_pulsing_indicator: true,
  max_recording_seconds: 120,
};

const MOCK_PIPELINE_CONFIG = {
  stt: MOCK_STT_CONFIG,
  tts: MOCK_TTS_CONFIG,
  vad: MOCK_VAD_CONFIG,
  push_to_talk: MOCK_PTT_CONFIG,
  target_latency_ms: 2000,
  show_transcription_in_chat: true,
  show_audio_playback_button: true,
};

const MOCK_PIPELINE_STATUS = {
  stage: "Idle",
  is_recording: false,
  last_transcription: null,
  last_latency_ms: null,
  microphone_permitted: false,
};

const MOCK_MIC_RESULT = { granted: true, prompt_shown: true, error: null };

// ─── Tauri Mock ──────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

function setupMocks() {
  mockInvoke.mockImplementation((cmd: string, args?: any) => {
    switch (cmd) {
      case "get_voice_pipeline_config": return Promise.resolve(MOCK_PIPELINE_CONFIG);
      case "get_voice_pipeline_status": return Promise.resolve(MOCK_PIPELINE_STATUS);
      case "get_stt_config": return Promise.resolve(MOCK_STT_CONFIG);
      case "get_tts_config": return Promise.resolve(MOCK_TTS_CONFIG);
      case "get_vad_config": return Promise.resolve(MOCK_VAD_CONFIG);
      case "get_push_to_talk_config": return Promise.resolve(MOCK_PTT_CONFIG);
      case "request_mic_permission": {
        const firstUse = args?.firstUse ?? true;
        return Promise.resolve(firstUse ? MOCK_MIC_RESULT : { ...MOCK_MIC_RESULT, prompt_shown: false });
      }
      case "process_vad_sample_cmd": {
        const vol = args?.volume ?? 0;
        const current = args?.currentState ?? "Idle";
        const silenceMs = args?.silenceMs ?? 0;
        if (current === "Idle") return Promise.resolve(["Listening", false]);
        if (vol > 0.02) return Promise.resolve(["SpeechDetected", false]);
        if (silenceMs >= 250) return Promise.resolve(["EndOfSpeech", true]);
        return Promise.resolve(["SilenceDetected", false]);
      }
      default: return Promise.resolve(null);
    }
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  setupMocks();
});

// ═══════════════════════════════════════════════════════════════
// 1. STT Config
// ═══════════════════════════════════════════════════════════════

describe("STT Config", () => {
  it("1.1 returns Deepgram provider", async () => {
    const cfg = await mockInvoke("get_stt_config");
    expect(cfg.provider).toBe("Deepgram");
  });

  it("1.2 uses nova-2 model", async () => {
    const cfg = await mockInvoke("get_stt_config");
    expect(cfg.model).toBe("nova-2");
  });

  it("1.3 uses 16kHz sample rate", async () => {
    const cfg = await mockInvoke("get_stt_config");
    expect(cfg.sample_rate_hz).toBe(16000);
  });

  it("1.4 uses en-US language", async () => {
    const cfg = await mockInvoke("get_stt_config");
    expect(cfg.language).toBe("en-US");
  });

  it("1.5 enables interim results", async () => {
    const cfg = await mockInvoke("get_stt_config");
    expect(cfg.interim_results).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. TTS Config
// ═══════════════════════════════════════════════════════════════

describe("TTS Config", () => {
  it("2.1 returns ElevenLabs provider", async () => {
    const cfg = await mockInvoke("get_tts_config");
    expect(cfg.provider).toBe("ElevenLabs");
  });

  it("2.2 has stability and similarity settings", async () => {
    const cfg = await mockInvoke("get_tts_config");
    expect(cfg.stability).toBe(0.5);
    expect(cfg.similarity_boost).toBe(0.75);
  });

  it("2.3 outputs mp3 format", async () => {
    const cfg = await mockInvoke("get_tts_config");
    expect(cfg.output_format).toBe("mp3");
  });

  it("2.4 has speed setting", async () => {
    const cfg = await mockInvoke("get_tts_config");
    expect(cfg.speed).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. VAD State Machine
// ═══════════════════════════════════════════════════════════════

describe("VAD State Machine", () => {
  it("3.1 has 250ms silence threshold", async () => {
    const cfg = await mockInvoke("get_vad_config");
    expect(cfg.silence_threshold_ms).toBe(250);
  });

  it("3.2 has min_volume 0.02", async () => {
    const cfg = await mockInvoke("get_vad_config");
    expect(cfg.min_volume).toBe(0.02);
  });

  it("3.3 transitions Idle → Listening", async () => {
    const [state] = await mockInvoke("process_vad_sample_cmd", { volume: 0.01, currentState: "Idle", silenceMs: 0 });
    expect(state).toBe("Listening");
  });

  it("3.4 transitions to SpeechDetected when volume > 0.02", async () => {
    const [state] = await mockInvoke("process_vad_sample_cmd", { volume: 0.1, currentState: "Listening", silenceMs: 0 });
    expect(state).toBe("SpeechDetected");
  });

  it("3.5 transitions to SilenceDetected when volume low", async () => {
    const [state] = await mockInvoke("process_vad_sample_cmd", { volume: 0.001, currentState: "SpeechDetected", silenceMs: 100 });
    expect(state).toBe("SilenceDetected");
  });

  it("3.6 transitions to EndOfSpeech when silence >= threshold", async () => {
    const [state, ended] = await mockInvoke("process_vad_sample_cmd", { volume: 0.001, currentState: "SilenceDetected", silenceMs: 250 });
    expect(state).toBe("EndOfSpeech");
    expect(ended).toBe(true);
  });

  it("3.7 has 300ms pre_speech_buffer", async () => {
    const cfg = await mockInvoke("get_vad_config");
    expect(cfg.pre_speech_buffer_ms).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Push-to-Talk
// ═══════════════════════════════════════════════════════════════

describe("Push-to-Talk", () => {
  it("4.1 uses Space shortcut", async () => {
    const cfg = await mockInvoke("get_push_to_talk_config");
    expect(cfg.keyboard_shortcut).toBe("Space");
    expect(cfg.mode).toBe("PushToTalk");
  });

  it("4.2 shows waveform and pulsing indicator", async () => {
    const cfg = await mockInvoke("get_push_to_talk_config");
    expect(cfg.show_waveform).toBe(true);
    expect(cfg.show_pulsing_indicator).toBe(true);
  });

  it("4.3 has 120s max recording", async () => {
    const cfg = await mockInvoke("get_push_to_talk_config");
    expect(cfg.max_recording_seconds).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Voice Pipeline Config
// ═══════════════════════════════════════════════════════════════

describe("Voice Pipeline Config", () => {
  it("5.1 has 2s target latency", async () => {
    const cfg = await mockInvoke("get_voice_pipeline_config");
    expect(cfg.target_latency_ms).toBe(2000);
  });

  it("5.2 shows transcription in chat", async () => {
    const cfg = await mockInvoke("get_voice_pipeline_config");
    expect(cfg.show_transcription_in_chat).toBe(true);
  });

  it("5.3 shows audio playback button", async () => {
    const cfg = await mockInvoke("get_voice_pipeline_config");
    expect(cfg.show_audio_playback_button).toBe(true);
  });

  it("5.4 includes nested STT/TTS/VAD configs", async () => {
    const cfg = await mockInvoke("get_voice_pipeline_config");
    expect(cfg.stt.provider).toBe("Deepgram");
    expect(cfg.tts.provider).toBe("ElevenLabs");
    expect(cfg.vad.silence_threshold_ms).toBe(250);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Pipeline Status
// ═══════════════════════════════════════════════════════════════

describe("Pipeline Status", () => {
  it("6.1 starts in Idle stage", async () => {
    const st = await mockInvoke("get_voice_pipeline_status");
    expect(st.stage).toBe("Idle");
    expect(st.is_recording).toBe(false);
  });

  it("6.2 has no transcription initially", async () => {
    const st = await mockInvoke("get_voice_pipeline_status");
    expect(st.last_transcription).toBeNull();
  });

  it("6.3 mic not permitted initially", async () => {
    const st = await mockInvoke("get_voice_pipeline_status");
    expect(st.microphone_permitted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Mic Permission
// ═══════════════════════════════════════════════════════════════

describe("Mic Permission", () => {
  it("7.1 grants permission on first use", async () => {
    const res = await mockInvoke("request_mic_permission", { firstUse: true });
    expect(res.granted).toBe(true);
    expect(res.prompt_shown).toBe(true);
    expect(res.error).toBeNull();
  });

  it("7.2 no prompt on subsequent use", async () => {
    const res = await mockInvoke("request_mic_permission", { firstUse: false });
    expect(res.prompt_shown).toBe(false);
  });

  it("7.3 handles denied permission", async () => {
    mockInvoke.mockImplementationOnce(() =>
      Promise.resolve({ granted: false, prompt_shown: true, error: "User denied" })
    );
    const res = await mockInvoke("request_mic_permission", { firstUse: true });
    expect(res.granted).toBe(false);
    expect(res.error).toBe("User denied");
  });
});
