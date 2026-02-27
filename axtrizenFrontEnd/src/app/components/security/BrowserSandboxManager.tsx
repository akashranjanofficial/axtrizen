// BrowserSandboxManager.tsx — Sprint S8: Browser sandbox management UI
// Spawn/destroy Docker sandboxes, CDP action tester, resource monitor

import React, { useState, useCallback } from 'react';
import {
  spawnBrowserSandbox,
  getSandboxConfig,
  executeCdp,
  type SandboxConfig,
  type SandboxInstance,
  type CdpActionResult,
} from '../../tauri-api';

// ═══════════════════ BrowserSandboxManager ═══════════════════

export interface BrowserSandboxManagerProps {
  projectId?: string;
}

export function BrowserSandboxManager({ projectId }: BrowserSandboxManagerProps) {
  const [config, setConfig] = useState<SandboxConfig | null>(null);
  const [sandboxes, setSandboxes] = useState<SandboxInstance[]>([]);
  const [spawning, setSpawning] = useState(false);
  const [cdpResults, setCdpResults] = useState<CdpActionResult[]>([]);

  const loadConfig = useCallback(async () => {
    const cfg = await getSandboxConfig();
    setConfig(cfg);
  }, []);

  const handleSpawn = useCallback(async () => {
    setSpawning(true);
    try {
      const id = `sb-${Date.now()}`;
      const instance = await spawnBrowserSandbox(id);
      if (instance) {
        setSandboxes(prev => [...prev, instance]);
      }
    } catch (err) {
      console.error('Spawn failed:', err);
    } finally {
      setSpawning(false);
    }
  }, []);

  const handleCdpAction = useCallback(async (action: string, target?: string) => {
    try {
      const result = await executeCdp(action, target);
      if (result) {
        setCdpResults(prev => [result, ...prev.slice(0, 19)]);
      }
    } catch (err) {
      console.error('CDP action failed:', err);
    }
  }, []);

  const runningCount = sandboxes.filter(s => s.status === 'running').length;
  const maxReached = config ? runningCount >= config.max_concurrent : false;

  return (
    <div className="sandbox-manager" data-testid="sandbox-manager">
      <div className="sandbox-header">
        <h3>Browser Sandboxes</h3>
        <div className="sandbox-controls">
          <button
            className="btn btn-sm"
            onClick={loadConfig}
            data-testid="load-config-btn"
          >
            Load Config
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSpawn}
            disabled={spawning || maxReached}
            data-testid="spawn-btn"
          >
            {spawning ? 'Spawning...' : 'Spawn Sandbox'}
          </button>
        </div>
      </div>

      {config && (
        <div className="sandbox-config" data-testid="sandbox-config">
          <span>Max: {config.max_concurrent}</span>
          <span>CPU: {config.cpu_limit}</span>
          <span>RAM: {config.memory_limit_mb}MB</span>
          <span>Timeout: {config.idle_timeout_min}min</span>
        </div>
      )}

      <div className="sandbox-status" data-testid="sandbox-status">
        <span>Running: {runningCount}</span>
        {maxReached && <span className="limit-warning">⚠️ Limit reached</span>}
      </div>

      {sandboxes.length > 0 && (
        <div className="sandbox-list" data-testid="sandbox-list">
          {sandboxes.map((sb) => (
            <SandboxCard key={sb.id} sandbox={sb} />
          ))}
        </div>
      )}

      <CdpTester onAction={handleCdpAction} results={cdpResults} />
    </div>
  );
}

// ═══════════════════ SandboxCard ═══════════════════

function SandboxCard({ sandbox }: { sandbox: SandboxInstance }) {
  const statusColor = sandbox.status === 'running' ? '#22c55e' : '#9ca3af';

  return (
    <div
      className="sandbox-card"
      data-testid={`sandbox-${sandbox.id}`}
      style={{ borderLeft: `3px solid ${statusColor}` }}
    >
      <div className="sandbox-card-header">
        <span className="sandbox-id">{sandbox.id}</span>
        <span className="sandbox-card-status">{sandbox.status}</span>
        {sandbox.health_ok && <span className="health-ok">💚</span>}
      </div>
      <div className="sandbox-card-details">
        <code className="cdp-url">{sandbox.cdp_url}</code>
      </div>
    </div>
  );
}

// ═══════════════════ CdpTester ═══════════════════

interface CdpTesterProps {
  onAction: (action: string, target?: string) => Promise<void>;
  results: CdpActionResult[];
}

function CdpTester({ onAction, results }: CdpTesterProps) {
  const [action, setAction] = useState('goto');
  const [target, setTarget] = useState('');

  const actions = ['goto', 'click', 'fill', 'textContent', 'screenshot'];

  return (
    <div className="cdp-tester" data-testid="cdp-tester">
      <h4>CDP Action Tester</h4>
      <div className="cdp-controls">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          data-testid="cdp-action-select"
        >
          {actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target (URL, selector...)"
          data-testid="cdp-target-input"
        />
        <button
          className="btn btn-sm"
          onClick={() => onAction(action, target || undefined)}
          data-testid="cdp-execute-btn"
        >
          Execute
        </button>
      </div>

      {results.length > 0 && (
        <div className="cdp-results" data-testid="cdp-results">
          {results.filter(Boolean).map((r, i) => (
            <div
              key={i}
              className={`cdp-result ${r.success ? 'success' : 'error'}`}
              data-testid={`cdp-result-${i}`}
            >
              <span>{r.success ? '✅' : '❌'}</span>
              <span>{r.action}</span>
              <span>{r.duration_ms.toFixed(1)}ms</span>
              {r.error && <span className="cdp-error">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BrowserSandboxManager;
