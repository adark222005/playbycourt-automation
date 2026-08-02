---
inclusion: always
---

# Project Structure

```
src/
  jobs/         # Entry points — thin wrappers that parse params and call a service
  services/     # Orchestration logic — coordinates utilities, no business logic here
  utilities/    # All business logic, grouped by concern
  tests/        # All test files (unit + PBT)
data/
  slot_history_<clubName>.xlsx  # Per-club slot history (read/written at runtime)
env-variables.ts                # Single source of truth for all env vars
playwright.config.ts            # Test runner config
```

## Dependency Flow

Jobs → Services → Utilities (strict one-way). Never import upward.

- Jobs: parse env/config, call a single service function, handle top-level errors and `process.exit`.
- Services: orchestrate multiple utilities, manage control flow (loops, try/catch per club). No business logic.
- Utilities: contain all business logic. Keep functions pure/stateless where possible.

## Naming Conventions

| Layer     | Pattern              | Example                         |
| --------- | -------------------- | ------------------------------- |
| Utility   | `<name>.util.ts`     | `goplaySlots.util.ts`           |
| Service   | `<name>.service.ts`  | `findAvailableSlots.service.ts` |
| Job       | `<name>.job.ts`      | `findAvailableSlots.job.ts`     |
| Unit test | `<name>.spec.ts`     | `goplaySlots.util.spec.ts`      |
| PBT test  | `<name>.pbt.spec.ts` | `goplaySlots.pbt.spec.ts`       |

- All types are defined in and exported from `src/utilities/types.util.ts`. Never define shared types elsewhere.

## Import Rules

Always use path aliases — never deep relative paths (`../../`).

| Alias         | Resolves to       |
| ------------- | ----------------- |
| `@src/*`      | `src/*`           |
| `@utils/*`    | `src/utilities/*` |
| `@services/*` | `src/services/*`  |
| `@jobs/*`     | `src/jobs/*`      |
| `@tests/*`    | `src/tests/*`     |

Typical import style:

```ts
import { ClubConfig, TimeSlot } from "@src/utilities/types.util";
import { getGoPlaySlots } from "@utils/goplaySlots.util";
import { CLUBS } from "env-variables";
```

## Testing Conventions

- All tests use Playwright Test (`test`, `expect`) — even pure unit logic.
- PBT tests use `fast-check` (`fc.assert`, `fc.property`) inside Playwright `test()` blocks.
- Tests live in `src/tests/`, co-located by utility name.
- Test helpers (factories, arbitraries) are defined inline in the test file — no shared test utility modules.
- Unit tests mock `globalThis.fetch` directly (save/restore in `beforeEach`/`afterEach`).
- PBT tests typically use `{ numRuns: 100 }`.
- Run tests single-pass only: `npx playwright test`. Never use watch mode.

## Code Style

- TypeScript strict mode, CommonJS (`module: "commonjs"`), ES2016 target.
- Exported functions use explicit return types.
- Discriminated unions for config types (see `ClubConfig` pattern in `types.util.ts`).
- Prefer `async/await` over raw Promises.
- Environment variables are never accessed via `process.env` — always import typed values from `env-variables.ts`.
- Console logging for operational output (no external logger library).

## File Organization Within Utilities

Each provider gets two files:

- `<provider>Api.util.ts` — raw HTTP calls, response validation, error handling.
- `<provider>Slots.util.ts` — slot parsing, filtering, merging logic (pure transforms).

Cross-cutting concerns have dedicated files: `date.utils.ts`, `general.util.ts`, `slotsHistory.util.ts`, `scanParams.util.ts`, `telegramSender.util.ts`.
