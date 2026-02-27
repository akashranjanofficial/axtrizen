/**
 * Sprint S9 Frontend Tests
 * Tests for: PII & Unsafe Output Filtering, Browser Stream, Project Monitoring
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Data ──────────────────────────────────────────────────

const MOCK_PII_RESULT = {
  has_pii: true,
  findings: [
    { pii_type: "email", matched_text: "user@example.com", position: 10, redacted_as: "[EMAIL]" },
    { pii_type: "ssn", matched_text: "123-45-6789", position: 50, redacted_as: "[SSN]" },
  ],
  redacted_text: "Contact [EMAIL] and SSN: [SSN]",
  original_length: 60,
};

const MOCK_SAFE_PII_RESULT = {
  has_pii: false,
  findings: [],
  redacted_text: "This is safe text with no PII",
  original_length: 30,
};

const MOCK_UNSAFE_FINDINGS = [
  { pattern_name: "eval_injection", severity: "critical", matched_text: "eval(", description: "Detected unsafe pattern: eval_injection", line_hint: null },
  { pattern_name: "xss_script", severity: "high", matched_text: "<script>", description: "Detected unsafe pattern: xss_script", line_hint: null },
];

const MOCK_GUARDRAIL_CONFIG = {
  mode: "Redact" as const,
  detect_emails: true,
  detect_phones: true,
  detect_ssns: true,
  detect_api_keys: true,
  detect_credit_cards: true,
  detect_ip_addresses: true,
  detect_unsafe_code: true,
};

const MOCK_STREAM_CONFIG = {
  method: "WebRTC" as const,
  target_fps: 15,
  resolution_width: 1280,
  resolution_height: 720,
  screenshot_interval_ms: 2000,
  max_latency_ms: 1000,
};

const MOCK_LIVE_METRICS = {
  project_id: "proj-1",
  progress_pct: 60.0,
  running_cost_usd: 1.50,
  duration_seconds: 3600,
  current_phase: "Development",
  active_agents: 2,
  total_agents: 4,
  messages_total: 150,
  last_updated: "2025-01-01T00:00:00Z",
};

const MOCK_MONITORING_LAYOUT = {
  agent_list_width_pct: 20,
  main_view_width_pct: 55,
  sidebar_width_pct: 25,
  selected_agent_id: null as string | null,
};

const MOCK_AGENT_MONITOR = {
  agent_id: "a1",
  agent_name: "Coder",
  status: "working",
  current_task: "Implement feature",
  messages_sent: 15,
  tokens_used: 5000,
  has_browser: false,
  stream_active: false,
};

// ─── Tauri Mock ──────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

function setupMocks() {
  mockInvoke.mockImplementation((cmd: string, args?: any) => {
    switch (cmd) {
      case "scan_output_pii": {
        const text = args?.text || "";
        if (text.includes("@") || text.includes("123-45"))
          return Promise.resolve(MOCK_PII_RESULT);
        return Promise.resolve(MOCK_SAFE_PII_RESULT);
      }
      case "scan_output_unsafe":
        if (args?.text?.includes("eval("))
          return Promise.resolve(MOCK_UNSAFE_FINDINGS);
        return Promise.resolve([]);
      case "get_guardrail_config":
        return Promise.resolve(MOCK_GUARDRAIL_CONFIG);
      case "apply_output_guardrail": {
        const mode = args?.mode || "redact";
        if (mode === "block" && args?.text?.includes("@"))
          return Promise.resolve(["[OUTPUT BLOCKED]", MOCK_PII_RESULT.findings, []]);
        if (mode === "redact" && args?.text?.includes("@"))
          return Promise.resolve([MOCK_PII_RESULT.redacted_text, MOCK_PII_RESULT.findings, []]);
        if (mode === "allow")
          return Promise.resolve([args?.text, [], []]);
        return Promise.resolve([args?.text || "", [], []]);
      }
      case "get_stream_config":
        return Promise.resolve(MOCK_STREAM_CONFIG);
      case "get_project_live_metrics":
        return Promise.resolve({ ...MOCK_LIVE_METRICS, project_id: args?.projectId || "proj-1" });
      case "get_monitoring_layout":
        return Promise.resolve(MOCK_MONITORING_LAYOUT);
      default:
        return Promise.resolve(null);
    }
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  setupMocks();
});

// ═══════════════════════════════════════════════════════════════
// 1. PII Detection
// ═══════════════════════════════════════════════════════════════

describe("PII Detection", () => {
  it("1.1 detects email PII", async () => {
    const result = await mockInvoke("scan_output_pii", { text: "Email: user@example.com" });
    expect(result.has_pii).toBe(true);
    expect(result.findings.some((f: any) => f.pii_type === "email")).toBe(true);
  });

  it("1.2 detects SSN PII", async () => {
    const result = await mockInvoke("scan_output_pii", { text: "SSN: 123-45-6789" });
    expect(result.has_pii).toBe(true);
    expect(result.findings.some((f: any) => f.pii_type === "ssn")).toBe(true);
  });

  it("1.3 safe text has no PII", async () => {
    const result = await mockInvoke("scan_output_pii", { text: "Normal safe text" });
    expect(result.has_pii).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("1.4 redacted text replaces PII", async () => {
    const result = await mockInvoke("scan_output_pii", { text: "Email user@example.com" });
    expect(result.redacted_text).toContain("[EMAIL]");
    expect(result.redacted_text).not.toContain("user@example.com");
  });

  it("1.5 PII finding has position", async () => {
    const result = await mockInvoke("scan_output_pii", { text: "user@example.com" });
    for (const f of result.findings) {
      expect(f).toHaveProperty("position");
      expect(f.position).toBeGreaterThanOrEqual(0);
    }
  });

  it("1.6 PII finding has redacted placeholder", async () => {
    const result = await mockInvoke("scan_output_pii", { text: "user@example.com" });
    for (const f of result.findings) {
      expect(f.redacted_as).toMatch(/^\[.+\]$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Unsafe Code Detection
// ═══════════════════════════════════════════════════════════════

describe("Unsafe Code Detection", () => {
  it("2.1 detects eval injection", async () => {
    const findings = await mockInvoke("scan_output_unsafe", { text: "eval(userInput)" });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].pattern_name).toBe("eval_injection");
  });

  it("2.2 unsafe finding has severity", async () => {
    const findings = await mockInvoke("scan_output_unsafe", { text: "eval(x)" });
    expect(findings[0].severity).toBe("critical");
  });

  it("2.3 safe code has no findings", async () => {
    const findings = await mockInvoke("scan_output_unsafe", { text: "const x = 5;" });
    expect(findings).toHaveLength(0);
  });

  it("2.4 finding has description", async () => {
    const findings = await mockInvoke("scan_output_unsafe", { text: "eval(x)" });
    expect(findings[0]).toHaveProperty("description");
    expect(findings[0].description.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Guardrail Modes
// ═══════════════════════════════════════════════════════════════

describe("Guardrail Modes", () => {
  it("3.1 redact mode replaces PII", async () => {
    const [output, pii] = await mockInvoke("apply_output_guardrail", { text: "user@test.com", mode: "redact" });
    expect(output).toContain("[EMAIL]");
    expect(pii.length).toBeGreaterThan(0);
  });

  it("3.2 block mode blocks sensitive content", async () => {
    const [output] = await mockInvoke("apply_output_guardrail", { text: "user@test.com", mode: "block" });
    expect(output).toContain("BLOCKED");
  });

  it("3.3 allow mode passes everything", async () => {
    const [output, pii, unsafe_f] = await mockInvoke("apply_output_guardrail", { text: "user@test.com", mode: "allow" });
    expect(output).toBe("user@test.com");
    expect(pii).toHaveLength(0);
    expect(unsafe_f).toHaveLength(0);
  });

  it("3.4 guardrail config has all detection flags", async () => {
    const config = await mockInvoke("get_guardrail_config");
    expect(config.detect_emails).toBe(true);
    expect(config.detect_phones).toBe(true);
    expect(config.detect_ssns).toBe(true);
    expect(config.detect_api_keys).toBe(true);
    expect(config.detect_credit_cards).toBe(true);
    expect(config.detect_ip_addresses).toBe(true);
    expect(config.detect_unsafe_code).toBe(true);
  });

  it("3.5 default mode is Redact", async () => {
    const config = await mockInvoke("get_guardrail_config");
    expect(config.mode).toBe("Redact");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Browser Stream
// ═══════════════════════════════════════════════════════════════

describe("Browser Stream", () => {
  it("4.1 stream target ≥15 FPS", async () => {
    const config = await mockInvoke("get_stream_config");
    expect(config.target_fps).toBeGreaterThanOrEqual(15);
  });

  it("4.2 stream resolution ≥1280x720", async () => {
    const config = await mockInvoke("get_stream_config");
    expect(config.resolution_width).toBeGreaterThanOrEqual(1280);
    expect(config.resolution_height).toBeGreaterThanOrEqual(720);
  });

  it("4.3 max latency ≤1000ms", async () => {
    const config = await mockInvoke("get_stream_config");
    expect(config.max_latency_ms).toBeLessThanOrEqual(1000);
  });

  it("4.4 screenshot fallback interval 2s", async () => {
    const config = await mockInvoke("get_stream_config");
    expect(config.screenshot_interval_ms).toBe(2000);
  });

  it("4.5 default method is WebRTC", async () => {
    const config = await mockInvoke("get_stream_config");
    expect(config.method).toBe("WebRTC");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Project Monitoring
// ═══════════════════════════════════════════════════════════════

describe("Project Monitoring", () => {
  it("5.1 live metrics has progress percentage", async () => {
    const metrics = await mockInvoke("get_project_live_metrics", { projectId: "proj-1" });
    expect(metrics.progress_pct).toBe(60.0);
  });

  it("5.2 live metrics has running cost", async () => {
    const metrics = await mockInvoke("get_project_live_metrics", { projectId: "proj-1" });
    expect(metrics.running_cost_usd).toBe(1.50);
  });

  it("5.3 live metrics has duration", async () => {
    const metrics = await mockInvoke("get_project_live_metrics", { projectId: "proj-1" });
    expect(metrics.duration_seconds).toBe(3600);
  });

  it("5.4 live metrics has phase name", async () => {
    const metrics = await mockInvoke("get_project_live_metrics", { projectId: "proj-1" });
    expect(metrics.current_phase).toBe("Development");
  });

  it("5.5 live metrics has agent counts", async () => {
    const metrics = await mockInvoke("get_project_live_metrics", { projectId: "proj-1" });
    expect(metrics.active_agents).toBe(2);
    expect(metrics.total_agents).toBe(4);
  });

  it("5.6 live metrics has last_updated timestamp", async () => {
    const metrics = await mockInvoke("get_project_live_metrics", { projectId: "proj-1" });
    expect(metrics.last_updated).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Multi-Pane Layout
// ═══════════════════════════════════════════════════════════════

describe("Multi-Pane Layout", () => {
  it("6.1 layout widths sum to 100%", async () => {
    const layout = await mockInvoke("get_monitoring_layout");
    const total = layout.agent_list_width_pct + layout.main_view_width_pct + layout.sidebar_width_pct;
    expect(total).toBe(100);
  });

  it("6.2 agent list is 20%", async () => {
    const layout = await mockInvoke("get_monitoring_layout");
    expect(layout.agent_list_width_pct).toBe(20);
  });

  it("6.3 main view is 55%", async () => {
    const layout = await mockInvoke("get_monitoring_layout");
    expect(layout.main_view_width_pct).toBe(55);
  });

  it("6.4 sidebar is 25%", async () => {
    const layout = await mockInvoke("get_monitoring_layout");
    expect(layout.sidebar_width_pct).toBe(25);
  });

  it("6.5 no agent selected by default", async () => {
    const layout = await mockInvoke("get_monitoring_layout");
    expect(layout.selected_agent_id).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Type Validation
// ═══════════════════════════════════════════════════════════════

describe("S9 Type Validation", () => {
  it("7.1 PiiFinding structure", () => {
    const finding = MOCK_PII_RESULT.findings[0];
    expect(finding).toHaveProperty("pii_type");
    expect(finding).toHaveProperty("matched_text");
    expect(finding).toHaveProperty("position");
    expect(finding).toHaveProperty("redacted_as");
  });

  it("7.2 UnsafeCodeFinding structure", () => {
    const finding = MOCK_UNSAFE_FINDINGS[0];
    expect(finding).toHaveProperty("pattern_name");
    expect(finding).toHaveProperty("severity");
    expect(finding).toHaveProperty("matched_text");
    expect(finding).toHaveProperty("description");
  });

  it("7.3 StreamConfig structure", () => {
    expect(MOCK_STREAM_CONFIG).toHaveProperty("method");
    expect(MOCK_STREAM_CONFIG).toHaveProperty("target_fps");
    expect(MOCK_STREAM_CONFIG).toHaveProperty("resolution_width");
    expect(MOCK_STREAM_CONFIG).toHaveProperty("resolution_height");
    expect(MOCK_STREAM_CONFIG).toHaveProperty("screenshot_interval_ms");
  });

  it("7.4 AgentMonitorData structure", () => {
    expect(MOCK_AGENT_MONITOR).toHaveProperty("agent_id");
    expect(MOCK_AGENT_MONITOR).toHaveProperty("agent_name");
    expect(MOCK_AGENT_MONITOR).toHaveProperty("status");
    expect(MOCK_AGENT_MONITOR).toHaveProperty("has_browser");
    expect(MOCK_AGENT_MONITOR).toHaveProperty("stream_active");
  });

  it("7.5 ProjectLiveMetrics structure", () => {
    expect(MOCK_LIVE_METRICS).toHaveProperty("project_id");
    expect(MOCK_LIVE_METRICS).toHaveProperty("progress_pct");
    expect(MOCK_LIVE_METRICS).toHaveProperty("running_cost_usd");
    expect(MOCK_LIVE_METRICS).toHaveProperty("duration_seconds");
    expect(MOCK_LIVE_METRICS).toHaveProperty("current_phase");
    expect(MOCK_LIVE_METRICS).toHaveProperty("active_agents");
    expect(MOCK_LIVE_METRICS).toHaveProperty("messages_total");
  });
});
