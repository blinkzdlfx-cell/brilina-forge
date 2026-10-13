# Brilina Forge — testing

## Running

```bash
npm test          # backend suite, Node's built-in runner via tsx
npm run build     # type-check the backend
npm --prefix web run build   # build the frontend
```

The CI workflow (`.github/workflows/ci.yml`) runs `verify` (build + test for
backend and web) and `security-audit` (`npm audit --audit-level=high` for both).

## Suite

**103 passing tests.** The suite grew from 17 at the previous handoff.

Backend files:

- `src/agent/controller.observer.test.ts` — tool lifecycle events emitted to the observer
- `src/agent/controller.cancellation.test.ts` — cooperative cancellation at step boundaries
- `src/ai/openai-compatible.test.ts` — adapter normalization, streaming tool-call reassembly, rate-limit handling
- `src/ai/retry.test.ts` — cooldown retry honoring retry-after and exponential fallback
- `src/ai/provider-model.test.ts` — provider adapter, registry, context mapping
- `src/execution/local-worker.test.ts` — command policy and the server-side execution layer
- `src/execution/socket.test.ts` — WebSocket transport behavior
- `src/execution/api.test.ts` — terminal route authentication
- `src/phase4/model.test.ts` — deterministic model and the run event bus
- `src/security/redact.test.ts` — secret redaction
- `src/security/http.test.ts` — security headers, origin checks, path traversal

Cloudflare Worker files:

- `worker/api.test.ts`
- `worker/oauth-state.test.ts`

## What the tests do not cover

- Live AI provider responses. The OpenAI-compatible adapter is exercised against
  recorded/faked response shapes only.
- Live GitHub OAuth. The callback, cookie state binding and session persistence
  are tested with stubbed GitHub endpoints.
- Neon-backed paths end to end.
- Browser behavior. No automated UI acceptance test exists.
- The companion, device verification, and the approval UI have not been built.

A successful build and passing tests do not prove OAuth, Neon connectivity, live
provider responses, or SSE behavior in a browser.

## Rule

Do not report a feature as verified when only unit tests cover it.