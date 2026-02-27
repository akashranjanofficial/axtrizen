/// Sprint S11: Voice Pipeline
///
/// Covers:
/// - STT integration config (Deepgram / Whisper)
/// - TTS integration config (ElevenLabs / Kokoro)
/// - Voice Activity Detection (VAD) with configurable silence threshold
/// - Push-to-talk + hands-free modes
/// - End-to-end voice loop pipeline

use serde::{Deserialize, Serialize};

use crate::db;

// ─── STT (Speech-to-Text) ───────────────────────────────────────

/// Supported STT providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SttProvider {
    Deepgram,
    Whisper,
    WhisperLocal,
}

/// STT configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttConfig {
    pub provider: SttProvider,
    pub language: String,
    pub model: String,
    pub sample_rate_hz: u32,
    pub channels: u8,
    pub interim_results: bool,
}

impl Default for SttConfig {
    fn default() -> Self {
        Self {
            provider: SttProvider::Deepgram,
            language: "en-US".into(),
            model: "nova-2".into(),
            sample_rate_hz: 16000,
            channels: 1,
            interim_results: true,
        }
    }
}

// ─── TTS (Text-to-Speech) ───────────────────────────────────────

/// Supported TTS providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TtsProvider {
    ElevenLabs,
    Kokoro,
    SystemDefault,
}

/// TTS configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsConfig {
    pub provider: TtsProvider,
    pub voice_id: String,
    pub speed: f64,
    pub stability: f64,
    pub similarity_boost: f64,
    pub output_format: String,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            provider: TtsProvider::ElevenLabs,
            voice_id: "default".into(),
            speed: 1.0,
            stability: 0.5,
            similarity_boost: 0.75,
            output_format: "mp3_44100_128".into(),
        }
    }
}

// ─── Voice Activity Detection ───────────────────────────────────

/// VAD configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VadConfig {
    /// Silence duration (ms) before end-of-speech is detected
    pub silence_threshold_ms: u32,
    /// Minimum volume level (0.0..1.0) to consider as speech
    pub min_volume: f64,
    /// Pre-speech buffer (ms) to include before detected speech
    pub pre_speech_buffer_ms: u32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            silence_threshold_ms: 250,
            min_volume: 0.02,
            pre_speech_buffer_ms: 300,
        }
    }
}

/// VAD state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VadState {
    Idle,
    Listening,
    SpeechDetected,
    SilenceDetected,
    EndOfSpeech,
}

/// Process a volume sample and determine new VAD state
pub fn process_vad_sample(
    volume: f64,
    current_state: &VadState,
    silence_duration_ms: u32,
    config: &VadConfig,
) -> (VadState, bool) {
    let is_speech = volume >= config.min_volume;
    let end_of_speech = !is_speech && silence_duration_ms >= config.silence_threshold_ms;

    match current_state {
        VadState::Idle | VadState::Listening => {
            if is_speech {
                (VadState::SpeechDetected, false)
            } else {
                (VadState::Listening, false)
            }
        }
        VadState::SpeechDetected => {
            if !is_speech {
                (VadState::SilenceDetected, false)
            } else {
                (VadState::SpeechDetected, false)
            }
        }
        VadState::SilenceDetected => {
            if is_speech {
                (VadState::SpeechDetected, false)
            } else if end_of_speech {
                (VadState::EndOfSpeech, true)
            } else {
                (VadState::SilenceDetected, false)
            }
        }
        VadState::EndOfSpeech => {
            if is_speech {
                (VadState::SpeechDetected, false)
            } else {
                (VadState::Idle, false)
            }
        }
    }
}

// ─── Push-to-Talk / Hands-Free ──────────────────────────────────

/// Voice input mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VoiceInputMode {
    PushToTalk,
    HandsFree,
}

/// Push-to-talk configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushToTalkConfig {
    pub mode: VoiceInputMode,
    pub keyboard_shortcut: String,
    pub show_waveform: bool,
    pub show_pulsing_indicator: bool,
    pub max_recording_seconds: u32,
}

impl Default for PushToTalkConfig {
    fn default() -> Self {
        Self {
            mode: VoiceInputMode::PushToTalk,
            keyboard_shortcut: "Space".into(),
            show_waveform: true,
            show_pulsing_indicator: true,
            max_recording_seconds: 120,
        }
    }
}

// ─── Voice Pipeline ─────────────────────────────────────────────

/// Pipeline stage
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PipelineStage {
    Idle,
    Recording,
    Transcribing,
    Processing,
    Synthesizing,
    Playing,
    Error,
}

/// Voice pipeline configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoicePipelineConfig {
    pub stt: SttConfig,
    pub tts: TtsConfig,
    pub vad: VadConfig,
    pub push_to_talk: PushToTalkConfig,
    /// Target end-to-end latency (ms)
    pub target_latency_ms: u64,
    /// Whether to show transcription in chat
    pub show_transcription_in_chat: bool,
    /// Whether to show audio playback button
    pub show_audio_playback_button: bool,
}

impl Default for VoicePipelineConfig {
    fn default() -> Self {
        Self {
            stt: SttConfig::default(),
            tts: TtsConfig::default(),
            vad: VadConfig::default(),
            push_to_talk: PushToTalkConfig::default(),
            target_latency_ms: 2000,
            show_transcription_in_chat: true,
            show_audio_playback_button: true,
        }
    }
}

/// Voice pipeline status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoicePipelineStatus {
    pub stage: PipelineStage,
    pub is_recording: bool,
    pub last_transcription: Option<String>,
    pub last_latency_ms: Option<u64>,
    pub microphone_permitted: bool,
}

impl Default for VoicePipelineStatus {
    fn default() -> Self {
        Self {
            stage: PipelineStage::Idle,
            is_recording: false,
            last_transcription: None,
            last_latency_ms: None,
            microphone_permitted: false,
        }
    }
}

/// Microphone permission request result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MicPermissionResult {
    pub granted: bool,
    pub prompt_shown: bool,
    pub error: Option<String>,
}

/// Request microphone permission (simulated)
pub fn request_microphone_permission(first_use: bool) -> MicPermissionResult {
    MicPermissionResult {
        granted: true,
        prompt_shown: first_use,
        error: None,
    }
}


// ─── Tauri Commands ─────────────────────────────────────────────

#[tauri::command]
pub fn get_voice_pipeline_config() -> VoicePipelineConfig {
    if let Ok(conn) = db::init_db() {
        if let Ok(val) = db::get_voice_pipeline_config_db(&conn) {
            if let Ok(cfg) = serde_json::from_value(val) {
                return cfg;
            }
        }
    }
    VoicePipelineConfig::default()
}

#[tauri::command]
pub fn get_voice_pipeline_status() -> VoicePipelineStatus {
    VoicePipelineStatus::default()
}

#[tauri::command]
pub fn get_stt_config() -> SttConfig {
    get_voice_pipeline_config().stt
}

#[tauri::command]
pub fn get_tts_config() -> TtsConfig {
    get_voice_pipeline_config().tts
}

#[tauri::command]
pub fn get_vad_config() -> VadConfig {
    get_voice_pipeline_config().vad
}

#[tauri::command]
pub fn get_push_to_talk_config() -> PushToTalkConfig {
    get_voice_pipeline_config().push_to_talk
}

#[tauri::command]
pub fn request_mic_permission(first_use: bool) -> MicPermissionResult {
    request_microphone_permission(first_use)
}

#[tauri::command]
pub fn process_vad_sample_cmd(volume: f64, current_state: VadState, silence_ms: u32) -> (VadState, bool) {
    let config = get_voice_pipeline_config().vad;
    process_vad_sample(volume, &current_state, silence_ms, &config)
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stt_default_deepgram() {
        let config = SttConfig::default();
        assert_eq!(config.provider, SttProvider::Deepgram);
        assert_eq!(config.language, "en-US");
        assert_eq!(config.sample_rate_hz, 16000);
    }

    #[test]
    fn test_tts_default_elevenlabs() {
        let config = TtsConfig::default();
        assert_eq!(config.provider, TtsProvider::ElevenLabs);
        assert!((config.speed - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_vad_default_250ms_silence() {
        let config = VadConfig::default();
        assert_eq!(config.silence_threshold_ms, 250);
    }

    #[test]
    fn test_vad_idle_to_speech() {
        let config = VadConfig::default();
        let (state, end) = process_vad_sample(0.1, &VadState::Idle, 0, &config);
        assert_eq!(state, VadState::SpeechDetected);
        assert!(!end);
    }

    #[test]
    fn test_vad_speech_to_silence() {
        let config = VadConfig::default();
        let (state, end) = process_vad_sample(0.0, &VadState::SpeechDetected, 0, &config);
        assert_eq!(state, VadState::SilenceDetected);
        assert!(!end);
    }

    #[test]
    fn test_vad_silence_to_end_of_speech() {
        let config = VadConfig::default();
        let (state, end) = process_vad_sample(0.0, &VadState::SilenceDetected, 300, &config);
        assert_eq!(state, VadState::EndOfSpeech);
        assert!(end);
    }

    #[test]
    fn test_vad_silence_not_long_enough() {
        let config = VadConfig::default();
        let (state, end) = process_vad_sample(0.0, &VadState::SilenceDetected, 100, &config);
        assert_eq!(state, VadState::SilenceDetected);
        assert!(!end);
    }

    #[test]
    fn test_vad_silence_resumed_speech() {
        let config = VadConfig::default();
        let (state, end) = process_vad_sample(0.1, &VadState::SilenceDetected, 100, &config);
        assert_eq!(state, VadState::SpeechDetected);
        assert!(!end);
    }

    #[test]
    fn test_push_to_talk_default() {
        let config = PushToTalkConfig::default();
        assert_eq!(config.mode, VoiceInputMode::PushToTalk);
        assert_eq!(config.keyboard_shortcut, "Space");
        assert!(config.show_waveform);
    }

    #[test]
    fn test_pipeline_target_latency_2s() {
        let config = VoicePipelineConfig::default();
        assert_eq!(config.target_latency_ms, 2000);
    }

    #[test]
    fn test_pipeline_shows_transcription() {
        let config = VoicePipelineConfig::default();
        assert!(config.show_transcription_in_chat);
        assert!(config.show_audio_playback_button);
    }

    #[test]
    fn test_pipeline_status_default_idle() {
        let status = VoicePipelineStatus::default();
        assert_eq!(status.stage, PipelineStage::Idle);
        assert!(!status.is_recording);
        assert!(!status.microphone_permitted);
    }

    #[test]
    fn test_mic_permission_first_use_shows_prompt() {
        let result = request_microphone_permission(true);
        assert!(result.granted);
        assert!(result.prompt_shown);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_mic_permission_subsequent_no_prompt() {
        let result = request_microphone_permission(false);
        assert!(result.granted);
        assert!(!result.prompt_shown);
    }

    #[test]
    fn test_cmd_voice_pipeline_config() {
        let config = get_voice_pipeline_config();
        assert_eq!(config.stt.provider, SttProvider::Deepgram);
        assert_eq!(config.tts.provider, TtsProvider::ElevenLabs);
    }

    #[test]
    fn test_cmd_vad_sample() {
        let (state, end) = process_vad_sample_cmd(0.1, VadState::Idle, 0);
        assert_eq!(state, VadState::SpeechDetected);
        assert!(!end);
    }

    #[test]
    fn test_cmd_vad_end_of_speech() {
        let (state, end) = process_vad_sample_cmd(0.0, VadState::SilenceDetected, 300);
        assert_eq!(state, VadState::EndOfSpeech);
        assert!(end);
    }

    #[test]
    fn test_vad_end_to_idle() {
        let config = VadConfig::default();
        let (state, _) = process_vad_sample(0.0, &VadState::EndOfSpeech, 0, &config);
        assert_eq!(state, VadState::Idle);
    }

    #[test]
    fn test_vad_end_to_new_speech() {
        let config = VadConfig::default();
        let (state, _) = process_vad_sample(0.1, &VadState::EndOfSpeech, 0, &config);
        assert_eq!(state, VadState::SpeechDetected);
    }
}
