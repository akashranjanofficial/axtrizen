import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { createPty, writePty, resizePty } from "../tauri-api";
import "xterm/css/xterm.css";

interface TerminalComponentProps {
  id: string; // Agent ID or unique session ID
  className?: string;
  visible?: boolean; // When false, terminal is hidden but NOT unmounted
}

interface PtyOutput {
  id: string;
  data: string;
}

// Global registry of active PTY sessions to prevent re-creation
const activePtySessions = new Set<string>();

export interface TerminalHandle {
  getBuffer: () => string;
}

export const TerminalComponent = forwardRef<TerminalHandle, TerminalComponentProps>(
  function TerminalComponent({ id, className, visible = true }, ref) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const initializedRef = useRef(false);

    // Expose getBuffer to parent via ref
    useImperativeHandle(ref, () => ({
      getBuffer: () => {
        const term = xtermRef.current;
        if (!term) {
          return "";
        }
        const buf = term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buf.length; i++) {
          const line = buf.getLine(i);
          if (line) {
            lines.push(line.translateToString(true));
          }
        }
        return lines.join("\n");
      },
    }));

    useEffect(() => {
      if (!terminalRef.current || initializedRef.current) {
        return;
      }
      initializedRef.current = true;

      // Initialize xterm.js
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#1e1e1e",
          foreground: "#ffffff",
        },
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      // Mount terminal
      term.open(terminalRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Handle user input
      term.onData((data) => {
        writePty(id, data).catch(console.error);
      });

      // Listen for PTY output and create session
      const initSession = async () => {
        try {
          let unlisten: () => void = () => {};

          if (window.__TAURI__?.event) {
            unlisten = await window.__TAURI__.event.listen<PtyOutput>("pty-output", (event) => {
              if (event.payload.id === id) {
                term.write(event.payload.data);
              }
            });
          } else {
            console.warn("Tauri event system not found");
          }

          // Only create PTY if one doesn't already exist for this id
          if (!activePtySessions.has(id)) {
            await createPty(id);
            activePtySessions.add(id);
            console.log(`PTY session ${id} created`);
            term.writeln("\x1b[32mTargeting system...\x1b[0m");
            term.writeln("Connecting to local agent shell...");
          } else {
            console.log(`PTY session ${id} already exists, reusing`);
          }

          return unlisten;
        } catch (err) {
          term.writeln(`\x1b[31mFailed to create PTY: ${err}\x1b[0m`);
          console.error("PTY creation error:", err);
          return () => {};
        }
      };

      const sessionPromise = initSession();

      // Handle resize
      const handleResize = () => {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            resizePty(id, dims.rows, dims.cols).catch(console.error);
          }
        } catch (e) {
          console.error("Resize error:", e);
        }
      };

      window.addEventListener("resize", handleResize);
      setTimeout(handleResize, 100);

      // Cleanup — only runs when component truly unmounts (agent deleted)
      return () => {
        window.removeEventListener("resize", handleResize);
        sessionPromise.then((unlisten) => unlisten());
        term.dispose();
        initializedRef.current = false;
        // Note: we do NOT remove from activePtySessions here;
        // that's handled by killPtySession() when deleting an agent
      };
    }, [id]);

    // Refit when becoming visible
    useEffect(() => {
      if (visible && fitAddonRef.current) {
        setTimeout(() => {
          try {
            fitAddonRef.current?.fit();
          } catch (e) {
            // ignore
          }
        }, 50);
      }
    }, [visible]);

    return (
      <div
        className={`w-full h-full bg-[#1e1e1e] rounded-lg overflow-hidden p-2 ${className || ""}`}
        ref={terminalRef}
      />
    );
  },
);

/**
 * Call this when an agent is deleted to clean up its PTY session tracking
 */
export function killPtySession(id: string) {
  activePtySessions.delete(id);
}
