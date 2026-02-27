// SecurityScanner.tsx — Sprint S8: Security guardrails UI
// Inline message scanner + security audit log viewer

import React, { useState, useCallback } from 'react';
import {
  scanForInjection,
  getInjectionPatterns,
  type ScanResult,
  type PatternMatch,
} from '../../tauri-api';

// ═══════════════════ SecurityScanner ═══════════════════

export interface SecurityScannerProps {
  agentId?: string;
  onScanComplete?: (result: ScanResult) => void;
}

export function SecurityScanner({ agentId, onScanComplete }: SecurityScannerProps) {
  const [message, setMessage] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [patternCount, setPatternCount] = useState<number | null>(null);

  interface AuditLogEntry {
    timestamp: string;
    safe: boolean;
    riskScore: number;
    matchCount: number;
    preview: string;
  }

  const handleScan = useCallback(async () => {
    if (!message.trim()) return;
    setScanning(true);
    try {
      const result = await scanForInjection(message);
      if (!result) return;
      setLastResult(result);
      onScanComplete?.(result);

      setAuditLog(prev => [
        {
          timestamp: new Date().toISOString(),
          safe: result.is_safe,
          riskScore: result.risk_score,
          matchCount: result.matched_patterns.length,
          preview: message.slice(0, 80),
        },
        ...prev.slice(0, 99),
      ]);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  }, [message, onScanComplete]);

  const handleLoadPatterns = useCallback(async () => {
    try {
      const patterns = await getInjectionPatterns();
      if (patterns) setPatternCount(patterns.length);
    } catch {
      // ignore errors
    }
  }, []);

  return (
    <div className="security-scanner" data-testid="security-scanner">
      <div className="scanner-header">
        <h3>Security Scanner</h3>
        <button
          className="btn btn-sm"
          onClick={handleLoadPatterns}
          data-testid="load-patterns-btn"
        >
          {patternCount !== null ? `${patternCount} patterns loaded` : 'Load Patterns'}
        </button>
      </div>

      <div className="scanner-input">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter message to scan for injection patterns..."
          rows={3}
          data-testid="scan-input"
        />
        <button
          className="btn btn-primary"
          onClick={handleScan}
          disabled={scanning || !message.trim()}
          data-testid="scan-btn"
        >
          {scanning ? 'Scanning...' : 'Scan Message'}
        </button>
      </div>

      {lastResult && <ScanResultPanel result={lastResult} />}

      {auditLog.length > 0 && (
        <div className="audit-log" data-testid="audit-log">
          <h4>Audit Log ({auditLog.length} entries)</h4>
          <div className="audit-entries">
            {auditLog.map((entry, i) => (
              <div
                key={i}
                className={`audit-entry ${entry.safe ? 'safe' : 'blocked'}`}
                data-testid={`audit-entry-${i}`}
              >
                <span className="audit-status">
                  {entry.safe ? '✅' : '🚫'}
                </span>
                <span className="audit-preview">{entry.preview}</span>
                <span className="audit-risk">
                  Risk: {(entry.riskScore * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ ScanResultPanel ═══════════════════

function ScanResultPanel({ result }: { result: ScanResult }) {
  const statusColor = result.is_safe ? '#22c55e' : '#ef4444';
  const statusLabel = result.is_safe ? 'SAFE' : 'BLOCKED';
  const statusEmoji = result.is_safe ? '✅' : '🚫';

  return (
    <div
      className="scan-result"
      data-testid="scan-result"
      style={{ borderLeft: `4px solid ${statusColor}` }}
    >
      <div className="result-header">
        <span className="result-status" data-testid="scan-status">
          {statusEmoji} {statusLabel}
        </span>
        <span className="result-score" data-testid="risk-score">
          Risk: {(result.risk_score * 100).toFixed(0)}%
        </span>
        <span className="result-time">
          {result.scan_time_ms.toFixed(1)}ms
        </span>
      </div>

      {result.matched_patterns.length > 0 && (
        <div className="pattern-matches" data-testid="pattern-matches">
          <h4>Matched Patterns ({result.matched_patterns.length})</h4>
          {result.matched_patterns.map((match, i) => (
            <PatternMatchRow key={i} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════ PatternMatchRow ═══════════════════

function PatternMatchRow({ match }: { match: PatternMatch }) {
  const severityColors: Record<string, string> = {
    critical: '#dc2626',
    high: '#f97316',
    medium: '#eab308',
    low: '#60a5fa',
  };

  return (
    <div className="pattern-match" data-testid={`pattern-${match.pattern_id}`}>
      <span
        className="severity-badge"
        style={{ backgroundColor: severityColors[match.severity] || '#9ca3af' }}
      >
        {match.severity.toUpperCase()}
      </span>
      <span className="pattern-category">{match.category}</span>
      <span className="pattern-id">{match.pattern_id}</span>
      <code className="matched-text">{match.matched_text}</code>
    </div>
  );
}

export default SecurityScanner;
