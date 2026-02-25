# Axtrizen AI

Enterprise Agentic Platform built on [OpenClaw](https://github.com/openclaw/openclaw).

## Structure

```
├── openclaw-core/       ← OpenClaw (git submodule)
├── axtrizen-app/        ← Tauri desktop backend (Rust)
├── axtrizenFrontEnd/    ← React frontend (Vite + TypeScript)
└── dev.sh               ← Start everything
```

## Quick Start

```bash
# Clone with submodule
git clone --recurse-submodules <repo-url>

# Install dependencies
cd openclaw-core && pnpm install && cd ..
cd axtrizenFrontEnd && npm install && cd ..

# Run
./dev.sh
```

## Update OpenClaw

```bash
cd openclaw-core && git pull origin main && cd ..
git add openclaw-core && git commit -m "bump openclaw-core"
```
