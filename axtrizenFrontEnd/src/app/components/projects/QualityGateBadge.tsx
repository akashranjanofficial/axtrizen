/**
 * QualityGateBadge — Sprint S6
 *
 * Displays phase-level quality gate status with colored badges (✅/❌/⚠️/🔄),
 * clickable detail panel showing verification findings, and Override/Retry actions.
 */
import { useState, useCallback } from "react";
import type {
  PhaseGateStatus,
  VerificationReport,
  VerificationFinding,
  LevelResult,
  CheckStatus,
} from "../../tauri-api";

// ─── Types ──────────────────────────────────────────────────────

interface QualityGateBadgeProps {
  /** All phase gate statuses for the project */
  phases: PhaseGateStatus[];
  /** Currently active phase index */
  activePhaseIndex: number;
  /** Callback to run verification on a phase */
  onVerify?: (phaseId: string) => Promise<VerificationReport | null>;
  /** Callback to override a failed gate */
  onOverride?: (phaseId: string, reason: string) => Promise<void>;
  /** Callback to retry (re-run) a phase */
  onRetry?: (phaseId: string) => Promise<void>;
  /** Configurable strictness label */
  strictness?: string;
}

interface FindingsPanelProps {
  report: VerificationReport;
  onOverride?: (reason: string) => void;
  onRetry?: () => void;
}

// ─── Badge Colors ───────────────────────────────────────────────

const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pass:       { bg: "#dcfce7", text: "#166534", border: "#86efac" },
  fail:       { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  warn:       { bg: "#fefce8", text: "#854d0e", border: "#fde047" },
  pending:    { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" },
  overridden: { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
};

const STATUS_ICON: Record<CheckStatus, string> = {
  Pass: "✅",
  Fail: "❌",
  Warn: "⚠️",
};

// ─── Phase Progress Tracker ─────────────────────────────────────

export function PhaseProgressTracker({
  phases,
  activePhaseIndex,
  onVerify,
  onOverride,
  onRetry,
  strictness = "Warn Only",
}: QualityGateBadgeProps) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [verificationReport, setVerificationReport] = useState<VerificationReport | null>(null);

  const handleBadgeClick = useCallback(async (phaseId: string) => {
    if (expandedPhase === phaseId) {
      setExpandedPhase(null);
      setVerificationReport(null);
      return;
    }
    setExpandedPhase(phaseId);
    if (onVerify) {
      const report = await onVerify(phaseId);
      setVerificationReport(report);
    }
  }, [expandedPhase, onVerify]);

  const handleOverride = useCallback(async (phaseId: string, reason: string) => {
    if (onOverride) {
      await onOverride(phaseId, reason);
    }
  }, [onOverride]);

  const handleRetry = useCallback(async (phaseId: string) => {
    if (onRetry) {
      await onRetry(phaseId);
    }
  }, [onRetry]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "12px",
        background: "#1a1a2e",
        borderRadius: "8px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>
          Quality Gates
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "#9ca3af",
            background: "#2d2d44",
            padding: "2px 8px",
            borderRadius: "4px",
          }}
        >
          {strictness}
        </span>
      </div>

      {/* Phase Row */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {phases.map((phase, idx) => {
          const colors = BADGE_COLORS[phase.badge] || BADGE_COLORS.pending;
          const isActive = idx === activePhaseIndex;

          return (
            <button
              key={phase.phase_id}
              data-testid={`gate-badge-${phase.phase_id}`}
              onClick={() => handleBadgeClick(phase.phase_id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                borderRadius: "16px",
                border: `2px solid ${isActive ? "#60a5fa" : colors.border}`,
                background: colors.bg,
                color: colors.text,
                fontSize: "12px",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.2s",
                outline: expandedPhase === phase.phase_id ? "2px solid #60a5fa" : "none",
              }}
              title={`${phase.phase_name}: ${phase.badge}${phase.last_verified ? ` (verified ${phase.last_verified})` : ""}`}
            >
              <span>{phase.badge_emoji}</span>
              <span>{phase.phase_name}</span>
            </button>
          );
        })}
      </div>

      {/* Detail Panel */}
      {expandedPhase && verificationReport && (
        <FindingsPanel
          report={verificationReport}
          onOverride={
            verificationReport.gate_blocked
              ? (reason) => handleOverride(expandedPhase, reason)
              : undefined
          }
          onRetry={() => handleRetry(expandedPhase)}
        />
      )}
    </div>
  );
}

// ─── Findings detail panel ──────────────────────────────────────

function FindingsPanel({ report, onOverride, onRetry }: FindingsPanelProps) {
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  return (
    <div
      data-testid="findings-panel"
      style={{
        background: "#16162a",
        borderRadius: "6px",
        padding: "12px",
        marginTop: "4px",
        border: "1px solid #2d2d44",
      }}
    >
      {/* Summary */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>
          {STATUS_ICON[report.overall_status]} {report.phase_name} — {report.overall_status}
        </span>
        <span style={{ fontSize: "11px", color: "#9ca3af" }}>
          {report.total_findings} finding{report.total_findings !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Level results */}
      {report.levels.map((level) => (
        <LevelSection key={level.level} level={level} />
      ))}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
        {onRetry && (
          <button
            data-testid="retry-phase-btn"
            onClick={onRetry}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid #60a5fa",
              background: "transparent",
              color: "#60a5fa",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            🔄 Retry Phase
          </button>
        )}
        {onOverride && !showOverrideForm && (
          <button
            data-testid="override-btn"
            onClick={() => setShowOverrideForm(true)}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid #f59e0b",
              background: "transparent",
              color: "#f59e0b",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ⏭️ Override Gate
          </button>
        )}
      </div>

      {/* Override form */}
      {showOverrideForm && onOverride && (
        <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
          <input
            data-testid="override-reason-input"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason for override (required)..."
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: "4px",
              border: "1px solid #4b5563",
              background: "#1f1f35",
              color: "#e0e0e0",
              fontSize: "12px",
            }}
          />
          <button
            data-testid="confirm-override-btn"
            onClick={() => {
              if (overrideReason.trim()) {
                onOverride(overrideReason);
                setShowOverrideForm(false);
                setOverrideReason("");
              }
            }}
            disabled={!overrideReason.trim()}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              border: "none",
              background: overrideReason.trim() ? "#f59e0b" : "#4b5563",
              color: "#000",
              fontSize: "12px",
              cursor: overrideReason.trim() ? "pointer" : "not-allowed",
            }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Level Section ──────────────────────────────────────────────

function LevelSection({ level }: { level: LevelResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: "6px" }}>
      <button
        data-testid={`level-${level.level}-header`}
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 8px",
          background: "#1f1f35",
          border: "1px solid #2d2d44",
          borderRadius: "4px",
          cursor: "pointer",
          color: "#e0e0e0",
          fontSize: "12px",
        }}
      >
        <span>
          {STATUS_ICON[level.status]} Level {level.level}: {level.level_name}
        </span>
        <span style={{ color: "#9ca3af" }}>
          {level.pass_count}✓ {level.fail_count}✗ {level.warn_count}⚠
          {expanded ? " ▾" : " ▸"}
        </span>
      </button>

      {expanded && level.findings.length > 0 && (
        <div
          style={{
            marginTop: "4px",
            padding: "4px 8px",
            background: "#0d0d1a",
            borderRadius: "4px",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          {level.findings.map((f, i) => (
            <FindingRow key={i} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Finding Row ────────────────────────────────────────────────

function FindingRow({ finding }: { finding: VerificationFinding }) {
  const statusColor =
    finding.status === "Pass" ? "#22c55e" :
    finding.status === "Fail" ? "#ef4444" : "#eab308";

  return (
    <div
      data-testid="finding-row"
      style={{
        display: "flex",
        gap: "8px",
        padding: "3px 0",
        borderBottom: "1px solid #1a1a2e",
        fontSize: "11px",
        color: "#d1d5db",
      }}
    >
      <span style={{ color: statusColor, minWidth: "16px" }}>
        {finding.status === "Pass" ? "✓" : finding.status === "Fail" ? "✗" : "⚠"}
      </span>
      <span style={{ flex: 1 }}>
        {finding.message}
        {finding.line_number && (
          <span style={{ color: "#6b7280" }}> (L{finding.line_number})</span>
        )}
      </span>
    </div>
  );
}

// ─── Compact Badge (for inline use) ─────────────────────────────

interface CompactGateBadgeProps {
  status: PhaseGateStatus;
  onClick?: () => void;
}

export function CompactGateBadge({ status, onClick }: CompactGateBadgeProps) {
  const colors = BADGE_COLORS[status.badge] || BADGE_COLORS.pending;

  return (
    <span
      data-testid={`compact-badge-${status.phase_id}`}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        padding: "2px 8px",
        borderRadius: "12px",
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontSize: "11px",
        cursor: onClick ? "pointer" : "default",
      }}
      title={`${status.phase_name}: ${status.badge}`}
    >
      {status.badge_emoji}
      <span>{status.badge}</span>
    </span>
  );
}
