# Browser Automation

RecordWeb uses Playwright for repeatable browser automation and end-to-end tests. The initial configuration targets Chromium because the recording pipeline depends on Chromium media APIs.

## One-time installation

Install project dependencies and the Chromium browser binary:

```bash
npm install
npx playwright install chromium
```

## Run tests

Playwright starts the local Next.js development server automatically:

```bash
npm run test:e2e
```

Use a visible browser or the Playwright test explorer while developing:

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

Test reports are written to `playwright-report/`, and failure artifacts are written to `test-results/`. Both directories are ignored by Git.

## Test a deployed environment

Skip the local web server and target a deployed URL by setting `PLAYWRIGHT_BASE_URL`:

```bash
PLAYWRIGHT_BASE_URL=https://your-deployment.example npm run test:e2e
```

## Authentication

The first smoke test intentionally runs without an authenticated browser session and verifies that Clerk protects the Studio route. Future authenticated tests should create a dedicated Clerk test account and save Playwright `storageState` under `playwright/.auth/`. That directory is ignored by Git and must never contain production credentials.

## Media permissions

Chromium is launched with fake camera and microphone devices so automated tests do not require physical hardware or interactive permission prompts. Browser screen-sharing dialogs are controlled by the browser or operating system and should remain a manual verification step unless a dedicated fake-capture fixture is introduced.

## Codex browser use

Playwright is repository-level automation. Codex Browser Use is a separate desktop-client capability. If Browser Use is available, start RecordWeb with `npm run dev`, open `http://localhost:3000` in `@Browser` or a connected Chrome tab, and approve access to that local origin.
