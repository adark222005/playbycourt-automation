---
inclusion: always
---

# Tech Stack & Tooling

## Runtime & Language

- Runtime: Node.js with CommonJS modules (`"type": "commonjs"` in package.json)
- Language: TypeScript 5.8+ in strict mode, targeting ES2016
- Module resolution: `baseUrl: "./"` with path aliases (see structure.md for alias table)
- Key tsconfig flags: `esModuleInterop`, `forceConsistentCasingInFileNames`, `skipLibCheck`

## Dependencies

| Package              | Role                                      | Type    |
| -------------------- | ----------------------------------------- | ------- |
| `dotenv` + `env-var` | Typed, validated env access               | runtime |
| `node-cron`          | Cron scheduling                           | runtime |
| `xlsx`               | Excel read/write for slot history         | runtime |
| `@playwright/test`   | Test runner (all tests)                   | dev     |
| `fast-check`         | Property-based testing arbitraries        | dev     |
| `tsx`                | TypeScript execution without compile step | dev     |
| `tsconfig-paths`     | Runtime path alias resolution             | dev     |

## Commands

```bash
# Run all tests (single pass, never use watch mode)
npx playwright test

# Run a single test file
npx playwright test src/tests/<file>.spec.ts

# Execute a TypeScript file directly
npx tsx <file>.ts

# View last HTML test report
npx playwright show-report
```

Never use `npm test` in watch mode. Always single-execution.

## Playwright Test Configuration

- Test directory: `./src/tests`
- Runs fully parallel locally; single worker on CI
- Reporter: HTML (`playwright-report/`)
- Retries: 0 locally, 2 on CI
- Project: Chromium only

## Environment Variables

All env vars are declared and validated in `env-variables.ts` at the project root. Never access `process.env` directly — always import typed values from `env-variables.ts`.

| Variable                  | Required | Type                | Notes                                 |
| ------------------------- | -------- | ------------------- | ------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | yes      | string              |                                       |
| `TELEGRAM_CHAT_ID`        | yes      | string              |                                       |
| `COOKIE`                  | yes      | string              | Auth cookie for provider APIs         |
| `CLUBS`                   | yes      | string (JSON array) | Club config list                      |
| `SCAN_START_HOUR`         | yes      | float               | Hour filter lower bound               |
| `SCAN_END_HOUR`           | yes      | float               | Hour filter upper bound               |
| `SCAN_START_DATE_OFFSET`  | no       | string              | Days from today (offset mode)         |
| `SCAN_END_DATE_OFFSET`    | no       | string              | Days from today (offset mode)         |
| `SCAN_SKIP_WEEKEND`       | no       | string → boolean    | Default `"false"`                     |
| `SCAN_SKIP_WEEKDAYS`      | no       | string              | Comma-separated day names             |
| `SCAN_SPECIFIC_DATES`     | no       | string              | Comma-separated dates (specific mode) |
| `SCAN_MIN_PLAYTIME_HOURS` | no       | float               | Default `1.5`                         |
| `MATCHPOINTER_API_KEY`    | no       | string              | Required only for matchpointer clubs  |

## Key Conventions for AI Assistants

- When adding new env vars, add them to `env-variables.ts` with appropriate `env-var` validation, then export them. Never read from `process.env` elsewhere.
- Use `tsx` to run scripts ad-hoc. Do not compile to JS first.
- Path aliases (`@utils/*`, `@src/*`, etc.) are resolved at runtime by `tsconfig-paths` — they work in both test and execution contexts.
- The project has no build/compile step for production; it runs TypeScript directly via `tsx`.
- Do not add new dev dependencies without justification. The stack is intentionally minimal.
