# Brilina Forge — Product & Engineering Specification

## 1. Product definition

Brilina Forge is an AI-assisted software development workspace. It is not simply a chatbot with a terminal attached.

The system is designed around a controlled loop:

```
Human intent
  ↓
Agent Controller
  ↓
AI reasoning
  ↓
Typed tool request
  ↓
Permission / policy validation
  ↓
GitHub or E2 execution
  ↓
Structured result
  ↓
AI continuation
  ↓
Human-visible outcome
```

The platform should make the AI's relationship with the real software project explicit and auditable.

## 2. Product goals

### Primary goals

- Make an AI agent understand a real GitHub repository without dumping the whole repository into model context.
- Give the agent controlled access to repository operations.
- Give the agent a temporary environment for builds, tests, scripts and interactive terminal work.
- Keep GitHub as the durable source of truth.
- Support multiple AI providers without coupling the Agent Controller to one vendor.
- Preserve an auditable record of conversations, runs, tool calls and usage.
- Keep humans in control of high-impact operations.

### Secondary goals

- Make the platform suitable for a small private development team.
- Make backend contracts stable enough that the UI can evolve independently.
- Allow future expansion into additional Git providers and execution backends without rewriting the core agent.

## 3. Non-goals

The first version will not:

- install OpenCode or Kilo Code on E2
- treat E2 as a permanent development server
- expose unrestricted shell execution to the model
- send complete repositories to models by default
- depend on a giant agent framework
- support every Git provider from day one
- build a public multi-tenant SaaS billing system
- replace GitHub as source control

## 4. Users and workspaces

The initial product is a private workspace for the owner and a small trusted group.

A user belongs to one or more workspaces. A workspace contains repository connections, conversations, runs, provider configuration and permissions.

This gives us a clean path from personal use to a small team without designing a massive enterprise platform prematurely.

## 5. Repository model

A workspace can connect repositories available through an authorized GitHub account.

The active development context is:

- GitHub account/connection
- repository
- branch
- conversation
- optional task-specific context

The agent must know which repository and branch it is operating against before performing a mutating operation.

## 6. Repository context strategy

Repository context is progressive.

Initial context can contain:

- repository identity
- visibility
- default branch
- selected branch
- directory tree
- recent commits
- relevant open issues
- relevant pull requests
- project configuration
- task-relevant files

The agent then asks for additional files only when needed.

The system should prefer semantic context retrieval over indiscriminate repository ingestion.

## 7. GitHub integration

Forge uses a GitHub service boundary:

```
GitHubService
├── REST client
└── GraphQL client
```

The Agent Controller does not decide whether an operation uses REST or GraphQL.

### GraphQL is useful for

- repository context aggregation
- selected metadata
- branches
- recent commit summaries
- issue/PR summaries
- permission/context reads

### REST is useful for

- straightforward file operations
- branch operations
- commits
- pull requests
- endpoints where REST is simpler

The service exposes semantic methods such as:

- getRepository
- getRepositoryContext
- listBranches
- getTree
- readFile
- searchCode
- getDiff
- createBranch
- applyChanges
- createCommit
- createPullRequest

## 8. GitHub authorization

The browser should not ask users to paste raw personal access tokens.

The intended architecture is an OAuth-style GitHub authorization flow. The exact authorization mechanism must be validated against current GitHub capabilities before implementation.

Credentials remain server-side and are represented in the application by a connection record.

## 9. Agent Controller

The Agent Controller is the central orchestration component.

Responsibilities:

- construct model context
- expose available tools
- receive model tool calls
- validate tool calls
- execute approved tools
- return structured tool results
- enforce run limits
- handle retries
- persist run state
- stop execution when policy requires human approval

The controller must not contain provider-specific API code.

## 10. Tool interface

Initial GitHub tools:

- github.get_repository
- github.get_repository_context
- github.list_branches
- github.get_tree
- github.read_file
- github.search_code
- github.get_diff
- github.create_branch
- github.apply_changes
- github.create_commit
- github.create_pull_request

Initial terminal tools:

- terminal.create_session
- terminal.exec
- terminal.read
- terminal.kill

Every tool has:

- name
- version
- input schema
- output schema
- permission requirement
- side-effect classification
- timeout
- retry behavior
- audit metadata

## 11. Tool safety

Tool operations are classified.

### Read-only

No source mutation.

Examples:
- read file
- list tree
- search code
- repository context

### Mutating

Changes project state but remains recoverable.

Examples:
- create branch
- apply changes
- create commit

### High-impact

Requires stronger policy.

Examples:
- destructive terminal commands
- deletion of important repository resources
- force operations
- merging a pull request

The model cannot bypass the policy engine.

## 12. E2 execution architecture

E2 is a worker.

It provides:

- Node.js/npm
- Python
- shell
- PTY
- project dependencies
- builds
- tests
- linters
- scripts

It does not host the AI agent.

The preferred terminal architecture is:

```
Forge backend
    │
    │ WebSocket
    ▼
persistent PTY
    │
    ▼
Google Cloud E2
```

The backend owns session lifecycle.

If E2 disappears, GitHub remains the source of truth and the Forge run is marked failed/interrupted rather than losing the project.

## 13. AI provider abstraction

The controller calls an internal provider interface.

Conceptually:

```
AIProvider
├── OpenRouter
├── Google
└── future providers
```

The adapter normalizes:

- request format
- streaming
- tool calls
- usage
- errors
- rate limits
- retry-after information

The Agent Controller should see one common interface.

## 14. Rate limits and retry

Provider failures are normalized into:

- provider
- model
- retryable
- retry-after
- error class

If a provider says the request can retry after a cooldown, Forge should respect that value.

The retry system should not rely on an arbitrary fixed number of attempts as its primary strategy.

Usage records should include, when available:

- provider
- model
- input tokens
- output tokens
- estimated cost
- duration
- status
- retry count

## 15. Neon persistence

Neon/Lakebase Postgres stores application state.

Initial logical entities:

- users
- workspaces
- workspace_members
- github_connections
- github_repositories
- workspace_repositories
- conversations
- messages
- agent_runs
- tool_calls
- terminal_sessions
- ai_provider_accounts
- ai_models
- ai_usage

The database must enforce ownership and membership relationships with constraints rather than relying only on application code.

Secrets must not be stored as ordinary plaintext columns.

## 16. Run lifecycle

An agent run should have an explicit state machine:

```
queued
  ↓
running
  ├── waiting_for_tool
  ├── waiting_for_approval
  ├── retrying
  ├── failed
  ├── cancelled
  └── completed
```

Each tool call has its own lifecycle and belongs to one run.

This makes recovery and observability possible.

## 17. Conversation model

A conversation is a human-facing container.

Messages are user/model/system-visible events.

Agent runs are execution units associated with messages or tasks.

This separation prevents a conversation from becoming an unstructured log and allows one conversation to contain multiple agent runs.

## 18. Security boundaries

Every real-world action should pass:

```
authenticated user
→ workspace membership
→ repository authorization
→ branch policy
→ tool permission
→ operation policy
```

Sensitive data must be redacted from logs and model-visible errors.

Terminal commands must be classified before execution.

## 19. Error handling

Errors must be typed.

Examples:

- GitHubAuthenticationError
- GitHubAuthorizationError
- GitHubNotFoundError
- RepositoryContextError
- ToolValidationError
- ToolPermissionError
- TerminalConnectionError
- TerminalExecutionError
- AIProviderError
- AIProviderRateLimitError
- AgentRunLimitError

The UI should eventually receive safe, human-readable error information while the backend retains diagnostic metadata.

## 20. Observability

Every agent action should be traceable to:

- user
- workspace
- conversation
- run
- tool call
- repository
- branch
- provider/model where relevant
- timestamp
- outcome

Logs must avoid storing secrets or full credential-bearing payloads.

## 21. Testing philosophy

Testing starts before the chat UI.

The backend must first prove:

1. GitHub authentication works.
2. REST works.
3. GraphQL works.
4. Repository context works.
5. Neon persistence works.
6. Tools validate correctly.
7. E2 terminal sessions work.
8. AI providers normalize correctly.
9. Rate-limit retry works.
10. A complete end-to-end coding run is recoverable and auditable.

## 22. Acceptance scenario

A first end-to-end acceptance scenario is:

```
Authenticate GitHub
→ select brilina-forge
→ select main
→ create a development branch
→ ask Forge to inspect the project
→ retrieve repository context
→ read relevant files
→ run a safe terminal command
→ make a controlled documentation change
→ verify it
→ commit it
→ record the agent run
```

The UI is not required for this acceptance test. Backend contracts should be testable independently.

## 23. Implementation gates

### Gate A — GitHub

No database-heavy implementation should begin until GitHub authentication and repository inspection are proven.

### Gate B — Persistence

No complex agent workflow should begin until run/tool state can be persisted and recovered.

### Gate C — Execution

No terminal UI should begin until a persistent PTY can be created and safely controlled.

### Gate D — AI

No provider-specific model code should leak into the Agent Controller.

### Gate E — UI

Only after the preceding contracts work should the ChatGPT-style interface be implemented.

## 24. Current architectural decision

The immediate engineering target is Phase 1:

**GitHub authentication/authorization + GitHub REST/GraphQL service + repository context retrieval.**

Everything else should build on those contracts.
