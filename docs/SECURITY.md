# Brilina Forge Security Model

## Trust boundaries

There are four major trust zones:

1. Browser
2. Forge backend
3. GitHub
4. E2 execution worker

Neon is the durable application-state boundary.

## Browser

The browser may receive:

- safe user/session information
- repository metadata
- conversation data
- tool status
- terminal output

The browser must not receive:

- raw GitHub credentials
- provider secrets
- server credentials
- unrestricted execution credentials

## GitHub credentials

Use an authorization flow rather than asking users to paste long-lived tokens into the application.

Store only what is required for the connection, encrypted/protected using the chosen secret-management approach.

## Tool authorization

A tool request is not permission by itself.

The backend verifies:

```
identity
→ workspace membership
→ repository relationship
→ branch rules
→ tool permission
→ operation policy
```

## Terminal security

Commands are policy-checked before execution.

At minimum classify:

- safe
- blocked
- approval-required

The model cannot alter its own policy.

The execution worker must not expose unrelated host secrets or unrestricted host access.

## Secret redaction

Secrets must be removed from:

- tool logs
- model error messages
- terminal output where possible
- persisted debug payloads
- client-visible errors

## Audit

Record:

- user
- workspace
- repository
- branch
- run
- tool
- operation class
- timestamp
- status
- approval state

Do not record secrets.

## Security testing

Before production use, test:

- unauthorized repository access
- cross-workspace access
- invalid tool arguments
- tool escalation
- blocked commands
- approval bypass attempts
- expired GitHub authorization
- provider credential leakage
- terminal session hijacking
