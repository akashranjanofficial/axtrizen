import React, { useState, useEffect, useCallback } from "react";
import {
  Mic,
  MicOff,
  Activity,
  Volume2,
  Keyboard,
  Gauge,
  AudioLines,
  CircleDot,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  getVoicePipelineConfig,
  getVoicePipelineStatus,
  requestMicPermission,
  type VoicePipelineConfig,
  type VoicePipelineStatus,
  type PipelineStage,
} from "../../tauri-api";

const STAGE_COLORS: Record<PipelineStage, string> = {
  Idle: "bg-gray-400",
  Recording: "bg-red-500 animate-pulse",
  Transcribing: "bg-yellow-500 animate-pulse",
  Processing: "bg-blue-500 animate-pulse",
  Synthesizing: "bg-purple-500 animate-pulse",
  Playing: "bg-green-500 animate-pulse",
  Error: "bg-red-700",
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  Idle: "Idle",
  Recording: "Recording…",
  Transcribing: "Transcribing…",
  Processing: "Processing…",
  Synthesizing: "Synthesizing…",
  Playing: "Playing",
  Error: "Error",
};

function SectionCard({
  title,
  icon,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      <div className="space-y-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function VoicePipelinePanel() {
  const [config, setConfig] = useState<VoicePipelineConfig | null>(null);
  const [status, setStatus] = useState<VoicePipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permRequesting, setPermRequesting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [cfg, sts] = await Promise.all([
        getVoicePipelineConfig(),
        getVoicePipelineStatus(),
      ]);
      setConfig(cfg);
      setStatus(sts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load voice pipeline data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(async () => {
      try {
        const sts = await getVoicePipelineStatus();
        setStatus(sts);
      } catch {
        // silently ignore polling errors
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRequestPermission = useCallback(async () => {
    setPermRequesting(true);
    try {
      const result = await requestMicPermission(true);
      if (result.error) {
        setError(result.error);
      } else {
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Permission request failed");
    } finally {
      setPermRequesting(false);
    }
  }, [fetchData]);

  if (loading) {
    return (
      <div
        data-testid="voice-pipeline-loading"
        className="flex items-center justify-center gap-2 p-8 text-muted-foreground"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading voice pipeline…</span>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div
        data-testid="voice-pipeline-error"
        className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-400"
      >
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!config || !status) return null;

  return (
    <div data-testid="voice-pipeline-panel" className="space-y-4">
      {/* Pipeline Status */}
      <div
        data-testid="voice-pipeline-status"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center gap-3">
          <span className={`inline-block h-3 w-3 rounded-full ${STAGE_COLORS[status.stage]}`} />
          <span className="text-sm font-semibold text-foreground">
            {STAGE_LABELS[status.stage]}
          </span>
          {status.is_recording && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
              REC
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {status.microphone_permitted ? (
            <span className="flex items-center gap-1 text-green-400">
              <Mic className="h-3.5 w-3.5" /> Mic OK
            </span>
          ) : (
            <span className="flex items-center gap-1 text-yellow-400">
              <MicOff className="h-3.5 w-3.5" /> No Mic
            </span>
          )}
        </div>
      </div>

      {/* Mic Permission Button */}
      {!status.microphone_permitted && (
        <button
          data-testid="request-mic-permission-btn"
          onClick={handleRequestPermission}
          disabled={permRequesting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {permRequesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          Request Microphone Permission
        </button>
      )}

      {/* Error banner (non-fatal) */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* STT Config */}
        <SectionCard title="Speech-to-Text" icon={<AudioLines className="h-4 w-4" />} testId="stt-config">
          <ConfigRow label="Provider" value={config.stt.provider} />
          <ConfigRow label="Language" value={config.stt.language} />
          <ConfigRow label="Model" value={config.stt.model} />
          <ConfigRow label="Sample Rate" value={`${config.stt.sample_rate_hz} Hz`} />
          <ConfigRow label="Interim Results" value={config.stt.interim_results ? "On" : "Off"} />
        </SectionCard>

        {/* TTS Config */}
        <SectionCard title="Text-to-Speech" icon={<Volume2 className="h-4 w-4" />} testId="tts-config">
          <ConfigRow label="Provider" value={config.tts.provider} />
          <ConfigRow label="Voice" value={config.tts.voice_id} />
          <ConfigRow label="Speed" value={`${config.tts.speed}x`} />
          <ConfigRow label="Stability" value={config.tts.stability.toFixed(2)} />
          <ConfigRow label="Format" value={config.tts.output_format} />
        </SectionCard>

        {/* VAD Config */}
        <SectionCard title="Voice Activity Detection" icon={<Activity className="h-4 w-4" />} testId="vad-config">
          <ConfigRow label="Silence Threshold" value={`${config.vad.silence_threshold_ms} ms`} />
          <ConfigRow label="Min Volume" value={config.vad.min_volume.toFixed(2)} />
          <ConfigRow label="Pre-speech Buffer" value={`${config.vad.pre_speech_buffer_ms} ms`} />
        </SectionCard>

        {/* Push-to-Talk */}
        <SectionCard title="Push-to-Talk" icon={<Keyboard className="h-4 w-4" />} testId="push-to-talk-config">
          <ConfigRow label="Mode" value={config.push_to_talk.mode} />
          <ConfigRow
            label="Shortcut"
            value={
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                {config.push_to_talk.keyboard_shortcut}
              </kbd>
            }
          />
          <ConfigRow label="Waveform" value={config.push_to_talk.show_waveform ? "Visible" : "Hidden"} />
          <ConfigRow label="Pulse Indicator" value={config.push_to_talk.show_pulsing_indicator ? "On" : "Off"} />
          <ConfigRow label="Max Recording" value={`${config.push_to_talk.max_recording_seconds}s`} />
        </SectionCard>
      </div>

      {/* Latency Indicator */}
      <div
        data-testid="latency-indicator"
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3"
      >
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Latency</span>
        <span className="ml-auto text-sm font-medium text-foreground">
          {status.last_latency_ms !== null ? `${status.last_latency_ms} ms` : "—"}
        </span>
        <span className="text-xs text-muted-foreground">
          (target: {config.target_latency_ms} ms)
        </span>
      </div>

      {/* Last Transcription */}
      <div
        data-testid="last-transcription"
        className="rounded-lg border border-border bg-card p-4"
      >
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <CircleDot className="h-4 w-4" />
          Last Transcription
        </h3>
        {status.last_transcription ? (
          <p className="whitespace-pre-wrap text-sm text-foreground/90">
            {status.last_transcription}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No transcription yet.</p>
        )}
      </div>

      {/* Global options */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          Transcription in chat:{" "}
          <strong className="text-foreground">
            {config.show_transcription_in_chat ? "Yes" : "No"}
          </strong>
        </span>
        <span>
          Audio playback button:{" "}
          <strong className="text-foreground">
            {config.show_audio_playback_button ? "Yes" : "No"}
          </strong>
        </span>
      </div>
    </div>
  );
}
