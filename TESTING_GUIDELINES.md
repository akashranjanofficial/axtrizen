# Axtrizen Testing Guidelines

## ⚠️ CRITICAL: Do NOT Test in Browser

> [!CAUTION]
> **Never test this application directly in a web browser (Chrome, Firefox, Safari, etc.).**
>
> The application is a **Tauri-based macOS native app**. The browser cannot access:
>
> - Tauri `invoke` commands (e.g., `get_gateway_token`, database access)
> - Native file system APIs
> - System tray / native window management
> - Secure token storage
>
> Browser-only testing will produce **false negatives** — features will appear broken
> that work correctly in the native app.

## How to Test

### 1. Start the Full Application Stack

```bash
cd /path/to/openclaw
./dev.sh
```

This starts:

- OpenClaw Gateway (port 18789)
- Vite dev server (port 5174) — frontend HMR
- Tauri native app — wraps the frontend with native APIs

### 2. Test in the Native macOS App

The Tauri app window opens automatically after `./dev.sh` completes. **All testing must be done in this window.**

### 3. Check Logs

| Log Source       | How to View                                             |
| ---------------- | ------------------------------------------------------- |
| Gateway logs     | Terminal running `./dev.sh`                             |
| Frontend console | `View → Toggle Developer Tools` in the Tauri app window |
| Tauri backend    | Terminal running `./dev.sh` (stderr)                    |

### 4. Hot Module Replacement (HMR)

Code changes to `.tsx`, `.ts`, and `.css` files are picked up automatically by Vite HMR **inside the Tauri app window**. You do NOT need to restart `./dev.sh` for frontend changes.

For Rust backend changes (`src-tauri/`), you DO need to restart `./dev.sh`.

## Automated Tests

```bash
# Frontend unit tests (vitest) — 907 tests, 38 files
cd axtrizenFrontEnd && npx vitest run

# Rust backend tests — 437 tests
cd axtrizen-app/src-tauri && cargo test

# Gateway config-reload tests — 11 tests
cd openclaw-core && npx vitest run src/gateway/config-reload.test.ts

# Build check
cd axtrizenFrontEnd && npx vite build --logLevel error
```

**Total test count: 1,355** (437 Rust + 907 Frontend + 11 Gateway)

These can run outside the Tauri app since they don't require native APIs.

## AI Agent Testing (for AI assistants)

> [!IMPORTANT]
> AI coding assistants (Gemini, Copilot, Cursor, etc.) **must not** use browser automation
> tools (Playwright, Puppeteer, browser subagents) to test this application.
>
> Instead:
>
> 1. Run `npx vitest run` for unit tests
> 2. Run `npx vite build` for build verification
> 3. Ask the user to manually verify UI changes in the native Tauri app
> 4. Use terminal logs from `./dev.sh` to debug runtime issues
