# Testing Strategy & QA Plan

# Axtrizen AI Platform

**Version:** 1.0 | **Date:** 2026-02-26

---

## 1. Testing Pyramid

```
                    ┌─────────┐
                    │  E2E    │    WebDriverIO + Tauri WebDriver
                    │  Tests  │    (Slow, high confidence)
                   ┌┴─────────┴┐
                   │ Integration│   Vitest + Tauri IPC mocks
                   │   Tests   │   (Medium speed)
                  ┌┴───────────┴┐
                  │  Unit Tests  │  Vitest + Testing Library
                  │              │  (Fast, isolated)
                  └──────────────┘
```

| Level       | Framework                       | Count Target | Coverage Target |
| ----------- | ------------------------------- | ------------ | --------------- |
| Unit        | Vitest + Testing Library        | 200+         | 80%             |
| Integration | Vitest + Tauri mocks            | 50+          | Critical paths  |
| E2E         | WebDriverIO 9 + Tauri WebDriver | 30+          | Core user flows |

---

## 2. Testing Frameworks

### 2.1 Unit Testing (Frontend)

**Framework:** Vitest 4.0.18 + @testing-library/react 16.3.2

```bash
# Run all unit tests
npm run test

# Watch mode
npm run test:watch
```

**Configuration:** `vitest.config.ts`

**What to test:**

- React component rendering
- Store logic (activity-store, agent-store)
- Utility functions and helpers
- Service layer functions
- API wrapper functions (with mocked `invoke`)

### 2.2 E2E Testing (Full Application)

**Framework:** WebDriverIO 9.24.0 + tauri-plugin-webdriver

```bash
# Run E2E tests
npm run test:e2e
```

**Configuration:** `wdio.conf.ts` (connects to port 4445, browser: `wry`)

**What to test:**

- Full user flows (create agent → create team → create project → execute)
- Navigation between views
- CRUD operations
- Real-time UI updates

### 2.3 Backend Testing (Rust)

**Framework:** Rust built-in `#[cfg(test)]` + `cargo test`

```bash
cd axtrizen-app/src-tauri && cargo test
```

**What to test:**

- Database operations (CRUD for all 17 tables)
- Code extraction functions
- Plan parsing logic
- Orchestrator state management

---

## 3. Test Plan by Feature

### 3.1 Agent Management

| Test Case                            | Type        | Priority |
| ------------------------------------ | ----------- | -------- |
| Create agent with valid name/role    | E2E         | P0       |
| Create agent with empty name → error | Unit        | P0       |
| Delete agent with confirmation       | E2E         | P0       |
| Agent list populates from Gateway    | E2E         | P0       |
| Agent status updates from polling    | Integration | P1       |
| Edit agent file (SOUL.md)            | E2E         | P1       |

### 3.2 Team Composition

| Test Case                     | Type | Priority |
| ----------------------------- | ---- | -------- |
| Create team → appears in list | E2E  | P0       |
| Assign manager to team        | E2E  | P0       |
| Add member to team            | E2E  | P0       |
| Remove member from team       | E2E  | P1       |
| Delete team with members      | E2E  | P1       |
| Open group chat from team     | E2E  | P0       |

### 3.3 Project Execution

| Test Case                            | Type        | Priority |
| ------------------------------------ | ----------- | -------- |
| Create project with requirements     | E2E         | P0       |
| Start execution → phases progress    | E2E         | P0       |
| Planning phase generates board items | Integration | P0       |
| Board updates during execution       | E2E         | P0       |
| Development phase creates files      | Integration | P0       |
| Final report renders on completion   | E2E         | P0       |
| Human feedback loop works            | E2E         | P1       |
| Cancel execution mid-phase           | E2E         | P1       |

### 3.4 Project Board

| Test Case                             | Type        | Priority |
| ------------------------------------- | ----------- | -------- |
| Board renders with epics              | E2E         | P0       |
| Kanban → List view toggle             | E2E         | P0       |
| Progress bars update from task status | Unit        | P0       |
| Sprint filter works                   | Integration | P1       |
| Empty state shown when no plan        | Unit        | P0       |

### 3.5 Chat Interface

| Test Case                                | Type        | Priority |
| ---------------------------------------- | ----------- | -------- |
| Send message → receive response          | E2E         | P0       |
| Chat history persists across app restart | E2E         | P0       |
| Markdown renders correctly in chat       | Unit        | P0       |
| Photo/video messages render              | Unit        | P2       |
| Search across conversations              | Integration | P1       |

### 3.6 Code Extraction

| Test Case                            | Type        | Priority |
| ------------------------------------ | ----------- | -------- |
| Extract FILE: marker from code block | Unit (Rust) | P0       |
| Extract markdown header filename     | Unit (Rust) | P0       |
| Guess filename from language hint    | Unit (Rust) | P1       |
| Create nested directories            | Unit (Rust) | P0       |
| Multiple files from one response     | Unit (Rust) | P0       |
| Empty code block → no file created   | Unit (Rust) | P1       |

---

## 4. Test Data Strategy

### Fixtures

| Entity   | Strategy                              |
| -------- | ------------------------------------- |
| Agents   | Created via Gateway in E2E setup      |
| Teams    | Created during test, cleaned up after |
| Projects | Fresh projects per test case          |
| Messages | Mocked for unit tests                 |

### Database

- E2E tests use a separate SQLite DB (`~/.axtrizen/test_axtrizen.db`)
- Unit tests use in-memory SQLite
- Fixtures are reset before each test suite

---

## 5. CI/CD Integration

### Pre-Commit

```bash
# Frontend
npm run test           # Unit tests
npm run build          # Type checking + build

# Backend
cargo check            # Compilation check
cargo test             # Rust unit tests
```

### Pull Request Gates

| Gate       | Command       | Pass Criteria |
| ---------- | ------------- | ------------- |
| Rust Build | `cargo check` | Exit 0        |
| Rust Tests | `cargo test`  | All pass      |
| TS Build   | `vite build`  | Exit 0        |
| Unit Tests | `vitest run`  | All pass      |
| E2E Tests  | `wdio run`    | All pass      |

---

## 6. Performance Testing

| Metric                      | Target  | Method                      |
| --------------------------- | ------- | --------------------------- |
| Board render (12 tasks)     | < 200ms | Chrome DevTools Performance |
| Agent list load             | < 100ms | Vitest benchmark            |
| Chat message send/receive   | < 2s    | E2E timing                  |
| Gateway reconnect           | < 3s    | E2E timing                  |
| DB query (tasks by project) | < 50ms  | Rust bench                  |

---

## 7. Bug Reporting Template

```markdown
## Bug Report

**Environment:** macOS 15.x / Axtrizen v0.1.0-alpha
**Steps to Reproduce:**

1.
2.
3.

**Expected:**
**Actual:**
**Screenshots/Logs:**
**Severity:** Critical / High / Medium / Low
```
