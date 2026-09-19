# Brilina Forge Requirements

## Functional requirements

### FR-001 Authentication
A user can authenticate with GitHub through a secure authorization flow.

### FR-002 Repository discovery
The system can list repositories accessible to the authenticated account.

### FR-003 Repository selection
A user can select a repository and branch as the active context.

### FR-004 Context retrieval
The system can retrieve repository metadata, branches, tree information, commits and selected files.

### FR-005 Context minimization
The system does not load the complete repository into the model context by default.

### FR-006 Tool execution
The Agent Controller can invoke typed GitHub and terminal tools.

### FR-007 Authorization
Every tool invocation is checked against workspace and repository permissions.

### FR-008 Terminal
The execution service supports persistent PTY sessions.

### FR-009 AI abstraction
At least two AI providers can be represented through the same internal provider contract.

### FR-010 Streaming
Provider streaming events can be normalized for future UI streaming.

### FR-011 Usage
Provider/model usage and retry information are persisted.

### FR-012 Audit
Agent runs and tool calls are persisted.

### FR-013 Recovery
An E2 failure cannot destroy the canonical repository source.

### FR-014 Human approval
The architecture supports approval gates for high-impact operations.

## Non-functional requirements

### NFR-001 Security
Credentials are kept server-side and never exposed unnecessarily to the browser.

### NFR-002 Isolation
Terminal execution is isolated from the application control plane.

### NFR-003 Observability
Every significant agent operation has traceable metadata.

### NFR-004 Provider independence
Provider-specific code is isolated behind adapters.

### NFR-005 GitHub independence
REST/GraphQL choice is hidden behind semantic GitHub operations.

### NFR-006 Recoverability
Runs have explicit lifecycle states and can be marked failed/interrupted without corrupting durable state.

### NFR-007 Cost control
Context size, execution duration, model usage and retries are bounded.

### NFR-008 Maintainability
Business logic is organized by domain rather than by UI page.

## Initial tool contract

### Read tools

- github.get_repository
- github.get_repository_context
- github.list_branches
- github.get_tree
- github.read_file
- github.search_code
- github.get_diff

### Write tools

- github.create_branch
- github.apply_changes
- github.create_commit
- github.create_pull_request

### Execution tools

- terminal.create_session
- terminal.exec
- terminal.read
- terminal.kill
