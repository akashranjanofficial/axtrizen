import { Settings, Save, RotateCcw, Moon, Sun, Wifi, FolderOpen, Bug, Monitor } from "lucide-react";
import { useState, useEffect } from "react";
import { getSettings, updateSettings, type AppSettings } from "../tauri-api";

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (err) {
      setError(String(err));
      // Use defaults if Tauri is not available
      setSettings({
        theme: "dark",
        gateway_url: "ws://127.0.0.1:18789",
        openclaw_path: "~/Desktop/openclaw",
        debug_mode: false,
        auto_reconnect: true,
      });
    }
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }
    try {
      await updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleReset = () => {
    setSettings({
      theme: "dark",
      gateway_url: "ws://127.0.0.1:18789",
      openclaw_path: "~/Desktop/openclaw",
      debug_mode: false,
      auto_reconnect: true,
    });
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-73px)]">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-73px)] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Settings className="h-6 w-6 text-primary" />
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your Axtrizen AI experience
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
            <button
              onClick={handleSave}
              className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all ${
                saved
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              }`}
            >
              <Save className="h-4 w-4" /> {saved ? "Saved!" : "Save Changes"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Appearance */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" /> Appearance
          </h2>
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">Choose light or dark mode</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSettings({ ...settings, theme: "dark" })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
                    settings.theme === "dark"
                      ? "bg-primary/10 border border-primary/50 text-primary"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Moon className="h-4 w-4" /> Dark
                </button>
                <button
                  onClick={() => setSettings({ ...settings, theme: "light" })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
                    settings.theme === "light"
                      ? "bg-primary/10 border border-primary/50 text-primary"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sun className="h-4 w-4" /> Light
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Gateway Connection */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" /> Gateway Connection
          </h2>
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Gateway URL</label>
              <input
                type="text"
                value={settings.gateway_url}
                onChange={(e) => setSettings({ ...settings, gateway_url: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:border-primary/50 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                WebSocket endpoint for the OpenClaw Gateway
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto Reconnect</p>
                <p className="text-xs text-muted-foreground">
                  Automatically reconnect if connection drops
                </p>
              </div>
              <button
                onClick={() =>
                  setSettings({ ...settings, auto_reconnect: !settings.auto_reconnect })
                }
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  settings.auto_reconnect ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    settings.auto_reconnect ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Project Path */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" /> Project
          </h2>
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
            <label className="block text-sm font-medium text-foreground mb-2">OpenClaw Path</label>
            <input
              type="text"
              value={settings.openclaw_path}
              onChange={(e) => setSettings({ ...settings, openclaw_path: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:border-primary/50 text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Path to the OpenClaw installation directory
            </p>
          </div>
        </section>

        {/* Developer */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" /> Developer
          </h2>
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Debug Mode</p>
                <p className="text-xs text-muted-foreground">
                  Enable verbose logging and debug panels
                </p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, debug_mode: !settings.debug_mode })}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  settings.debug_mode ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    settings.debug_mode ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
