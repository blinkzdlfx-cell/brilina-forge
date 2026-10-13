# Brilina Forge — Phase 4 Chat UI

Status: **complete in code; browser acceptance not performed**

## Completed

- branded Brilina Forge application shell
- responsive expandable/collapsible sidebar
- sign-in gate driven by `GET /api/session`, sign-out via `POST /auth/github/logout`
- conversation list and creation
- persistent conversation message history backed by Neon
- conversation history loading when reopening a chat
- chat composer with streaming cursor
- tool activity cards keyed by the provider `callId`, covering requested / running / completed / approval-required / rejected
- approval-required and tool-rejected presentation
- repository selector backed by the authenticated GitHub repository API
- branch selector backed by the selected repository's GitHub branches
- repository context synchronization into Forge's repository table
- conversation context update API for repository/branch selection
- branch comparison diff panel (`GET /api/github/repos/:owner/:repo/compare`)
- backend conversation, run-start and SSE run-event APIs
- deterministic Phase 4 model adapter that issues a real tool call for inspection intent
- Agent Controller tool-lifecycle observer wired to the SSE `RunEventBus`

## Honest caveats

- No automated UI acceptance test exists and no browser session has driven the built frontend through sign-in, run, tool activity and diff flows.
- The UI still labels the composer "Provider-neutral development mode" regardless of whether a live provider is active.
- There is no terminal panel in the UI. Execution runs on the user's machine through the companion; the browser only watches output over SSE.