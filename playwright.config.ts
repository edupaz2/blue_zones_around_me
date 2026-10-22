import { defineConfig, devices } from '@playwright/test';

// Madrid point chosen from public/data/madrid/candidates.json: the target of
// zone 91b956e4df58 (40.436893, -3.655012), which has the most other zones
// (12 including itself) within 600 m, so "Around me" yields 3 cards and, after
// excluding one, a different set of 3.
const MADRID_SPOT = { latitude: 40.436893, longitude: -3.655012 };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'block',
    permissions: ['geolocation'],
    geolocation: MADRID_SPOT,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
