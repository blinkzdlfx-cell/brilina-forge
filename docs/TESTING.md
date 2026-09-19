# Brilina Forge Testing Strategy

## Testing levels

### Unit

Test:

- schemas
- authorization policies
- context assembly
- state transitions
- provider normalization
- rate-limit parsing

### Integration

Test:

- GitHub REST
- GitHub GraphQL
- Neon queries
- E2 PTY
- provider adapters

### End-to-end

Test a complete development workflow.

## Phase 1 acceptance test

1. Authenticate.
2. Retrieve the authenticated GitHub profile.
3. List repositories.
4. Select `brilina-forge`.
5. Retrieve repository metadata.
6. Retrieve `main`.
7. Retrieve tree/context.
8. Read README/documentation.
9. Verify REST and GraphQL results represent the same repository correctly.

## Agent acceptance test

1. Create a run.
2. Send a user request.
3. Model requests a read-only tool.
4. Validate tool schema.
5. Validate authorization.
6. Execute tool.
7. Persist tool result.
8. Continue model run.
9. Complete run.

## Execution acceptance test

1. Create PTY.
2. Run a safe command.
3. Stream output.
4. Run a test/build.
5. Terminate process.
6. Close session.
7. Persist session outcome.

## Failure tests

- expired GitHub authorization
- repository unavailable
- branch deleted
- malformed tool request
- provider rate limit
- provider timeout
- E2 crash
- PTY disconnect
- database failure
- agent cancellation

## Completion rule

A feature is not complete because the happy path works. The associated failure modes must be tested and documented.
