"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPty, writePty } from "../tauri-api";

// ── Embedded Terminal — Run project commands ───────────────────────────

interface EmbeddedTerminalProps {
  workspacePath: string;
  initialCommand?: string;
  onClose?: () => void;
}

export function EmbeddedTerminal({
  workspacePath,
  initialCommand,
  onClose,
}: EmbeddedTerminalProps) {
  const [output, setOutput] = useState<string[]>([]);
  const [inputCmd, setInputCmd] = useState("");
  const [running, setRunning] = useState(false);
  const [ptyId, setPtyId] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const projectName = workspacePath.split("/").pop() || "project";
  const termId = `run-${projectName}-${Date.now()}`;

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const startPty = useCallback(
    async (cmd: string) => {
      try {
        setRunning(true);
        setOutput((prev) => [...prev, `$ cd ${workspacePath} && ${cmd}`, ""]);
        setPtyId(termId);

        await createPty(termId);
        // Change to workspace directory first
        await writePty(termId, `cd "${workspacePath}" && ${cmd}\n`);
      } catch (err) {
        setOutput((prev) => [...prev, `Error: ${err}`, ""]);
        setRunning(false);
      }
    },
    [workspacePath, termId],
  );

  // Run initial command if provided
  useEffect(() => {
    if (initialCommand) {
      startPty(initialCommand);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendInput = () => {
    if (!inputCmd.trim() || !ptyId) return;
    setOutput((prev) => [...prev, `$ ${inputCmd}`]);
    writePty(ptyId, inputCmd + "\n").catch((err) => {
      setOutput((prev) => [...prev, `Error: ${err}`]);
    });
    setInputCmd("");
  };

  const handleStop = async () => {
    if (ptyId) {
      try {
        // Send Ctrl+C
        await writePty(ptyId, "\x03");
        setOutput((prev) => [...prev, "^C Process interrupted"]);
      } catch {
        // Ignore
      }
    }
    setRunning(false);
  };

  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        background: "rgba(10, 10, 15, 0.95)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: "350px",
      }}
    >
      {/* Terminal Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "rgba(255, 255, 255, 0.04)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <span style={{ fontSize: "12px" }}>⚡</span>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)" }}>
          Terminal — {projectName}
        </span>
        {running && (
          <span
            style={{
              fontSize: "10px",
              color: "rgba(34, 197, 94, 0.8)",
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "rgba(34, 197, 94, 0.8)",
                animation: "pulse-dot 1.5s ease-in-out infinite",
              }}
            />
            Running
          </span>
        )}
        {running && (
          <button
            onClick={handleStop}
            style={{
              padding: "3px 10px",
              borderRadius: "4px",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "rgba(239, 68, 68, 0.8)",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 500,
            }}
          >
            ⬛ Stop
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255, 255, 255, 0.4)",
              cursor: "pointer",
              fontSize: "12px",
              marginLeft: running ? "0" : "auto",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "8px 12px",
          fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: "12px",
          lineHeight: 1.5,
          color: "rgba(255, 255, 255, 0.75)",
          minHeight: "150px",
        }}
      >
        {output.length === 0 ? (
          <div style={{ color: "rgba(255, 255, 255, 0.3)", fontStyle: "italic" }}>
            Ready. Enter a command or use the quick-run buttons above.
          </div>
        ) : (
          output.map((line, i) => (
            <div
              key={i}
              style={{
                color: line.startsWith("$")
                  ? "rgba(34, 197, 94, 0.8)"
                  : line.startsWith("Error")
                    ? "rgba(239, 68, 68, 0.8)"
                    : "rgba(255, 255, 255, 0.7)",
              }}
            >
              {line || "\u00A0"}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          padding: "8px 12px",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          background: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <span style={{ color: "rgba(34, 197, 94, 0.6)", fontSize: "13px", lineHeight: "28px" }}>
          $
        </span>
        <input
          ref={inputRef}
          value={inputCmd}
          onChange={(e) => setInputCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendInput();
          }}
          placeholder={running ? "Send input to process..." : "Type a command..."}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "rgba(255, 255, 255, 0.8)",
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: "12px",
          }}
        />
        {!running && (
          <button
            onClick={() => {
              if (inputCmd.trim()) {
                startPty(inputCmd.trim());
                setInputCmd("");
              }
            }}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              background: "rgba(34, 197, 94, 0.1)",
              color: "rgba(34, 197, 94, 0.8)",
              cursor: "pointer",
              fontSize: "11px",
            }}
          >
            Run
          </button>
        )}
      </div>

      {/* Quick commands */}
      {!running && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            padding: "6px 12px 8px",
            flexWrap: "wrap",
          }}
        >
          {["npm run dev", "npm start", "npm test", "python main.py", "cargo run"].map((cmd) => (
            <button
              key={cmd}
              onClick={() => startPty(cmd)}
              style={{
                padding: "3px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(255, 255, 255, 0.03)",
                color: "rgba(255, 255, 255, 0.5)",
                cursor: "pointer",
                fontSize: "10px",
                fontFamily: "monospace",
              }}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
