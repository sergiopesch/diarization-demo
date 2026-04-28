import { defineConfig, devices } from "@playwright/test";

const appPort = Number(process.env.E2E_APP_PORT ?? 3100);
const workerPort = Number(process.env.E2E_WORKER_PORT ?? 18000);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${appPort}`,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `node tests/e2e/mock-local-worker.mjs --port ${workerPort}`,
      url: `http://127.0.0.1:${workerPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command: `LOCAL_TRANSCRIPTION_API_URL=http://127.0.0.1:${workerPort} npm run dev -- --port ${appPort}`,
      url: `http://localhost:${appPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
