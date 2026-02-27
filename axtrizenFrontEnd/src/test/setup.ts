import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock localStorage for JSDOM
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = value.toString();
    },
    clear() {
      store = {};
    },
    removeItem(key: string) {
      delete store[key];
    },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock Tauri IPC
const invokeMock = vi.fn((cmd) => {
  if (cmd === "get_agents") {
    return Promise.resolve([]);
  }
  if (cmd === "get_teams") {
    return Promise.resolve([]);
  }
  if (cmd === "get_projects") {
    return Promise.resolve([]);
  }
  if (cmd === "get_agent_config") {
    return Promise.resolve({});
  }
  if (cmd === "get_openclaw_config") {
    return Promise.resolve({});
  }
  return Promise.resolve(null);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

// Also mock window.__TAURI__ so `isTauri()` returns true
Object.defineProperty(window, "__TAURI__", {
  value: {
    core: { invoke: invokeMock },
    invoke: invokeMock,
  },
});

// Polyfill JSDOM missing DOM methods used by components
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
Element.prototype.scrollTo = Element.prototype.scrollTo || function () {};
