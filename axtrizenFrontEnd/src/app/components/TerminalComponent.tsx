import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { createPty, writePty, resizePty } from "../tauri-api";
// Removed broken import: import { listen } from '@tauri-apps/api/event';
import "xterm/css/xterm.css";

interface TerminalComponentProps {
  id: string; // Agent ID or unique session ID
  className?: string;
}

interface PtyOutput {
  id: string;
  data: string;
}

export function TerminalComponent({ id, className }: TerminalComponentProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);

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
      convertEol: true, // Needed for proper line endings
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

    // Listen for PTY output
    // Use global Tauri object to avoid import issues causing white screen
    const initSession = async () => {
      try {
        // 1. Setup listener
        let unlisten: () => void = () => {};

        if (window.__TAURI__?.event) {
          unlisten = await window.__TAURI__.event.listen<PtyOutput>("pty-output", (event) => {
            if (event.payload.id === id) {
              term.write(event.payload.data);
            }
          });
        } else if (window.__TAURI__ && (window as any).__TAURI__.listening) {
          // Fallback for some v1 setups
          unlisten = await (window as any).__TAURI__.listening("pty-output", (event: any) => {
            if (event.payload.id === id) {
              term.write(event.payload.data);
            }
          });
        } else {
          console.warn("Tauri event system not found");
        }

        // 2. Create backend PTY session
        await createPty(id);
        console.log(`PTY session ${id} created`);
        term.writeln("\x1b[32mTargeting system...\x1b[0m");
        term.writeln("Connecting to local agent shell...");

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
    // Initial fit after mount
    setTimeout(handleResize, 100);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      sessionPromise.then((unlisten) => unlisten());
      term.dispose();
      initializedRef.current = false;
    };
  }, [id]);

  return (
    <div
      className={`w-full h-full bg-[#1e1e1e] rounded-lg overflow-hidden p-2 ${className || ""}`}
      ref={terminalRef}
    />
  );
}
