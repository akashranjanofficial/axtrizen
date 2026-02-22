import type { Options } from "@wdio/types";

/**
 * WebDriverIO E2E Test Configuration for Axtrizen
 *
 * Connects to the tauri-plugin-webdriver server running inside
 * the native Tauri app on port 4445. All Tauri APIs (SQLite,
 * Gateway, WebSocket, etc.) are fully available.
 *
 * How to run:
 *   Terminal 1:  cd axtrizen-app && npx tauri dev
 *   Terminal 2:  cd axtrizenFrontEnd && npm run test:e2e
 */

export const config: Options.Testrunner = {
  runner: "local",
  autoCompileOpts: {
    autoCompile: true,
  },

  specs: ["./src/test/e2e/**/*.e2e.ts"],
  exclude: [],

  maxInstances: 1,

  // Connect to the tauri-plugin-webdriver server (NOT ChromeDriver)
  hostname: "127.0.0.1",
  port: 4445,
  path: "/",

  capabilities: [
    {
      // The plugin accepts any browser name — it controls the WKWebView
      browserName: "wry",
    } as WebdriverIO.Capabilities,
  ],

  logLevel: "info",
  bail: 0,
  baseUrl: "http://localhost:5174",
  waitforTimeout: 10000,
  connectionRetryTimeout: 30000,
  connectionRetryCount: 5,

  // No services — the WebDriver server is embedded in the Tauri app
  services: [],

  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
};
