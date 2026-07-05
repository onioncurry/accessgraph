# AccessGraph — Pitch (c0mpiled hackathon, July 5 2026)

> **AccessGraph is a G-Brain skill that turns a Slack/Teams task into a
> minimum access package for humans and AI agents.**

## Problem

Work is assigned in Slack. Access lives in ten tools — Google Drive, Jira,
Figma, Teams, Salesforce, GitHub. People and AI agents get blocked not because
they can't do the work, but because they don't have the right permissions.
Every handoff starts with "I can't open the roadmap… who owns the Jira board?"

For AI agents it's worse: an agent can't even *ask*. Without machine-readable
permission requirements, safe agent automation inside a company is impossible.

## Solution

When a task is assigned, AccessGraph reads it, queries the G-Brain access
graph (people, resources, ownership, current access, policies, past tasks),
and returns the **least-privilege access package**: what's needed, at what
level, for how long, who approves — as a one-click Slack card for humans and
strict JSON for agents.

Key properties (all enforced by 54 adversarial tests):
- **Per-resource least privilege** — a "write" task gets editor only on the
  work surface; reference docs stay read-only.
- **Confidential is never auto-bundled** — customer data comes back `blocked`
  unless explicitly justified; approver is the manager; never writable.
- **Fail-closed, deterministic, injection-inert.**
- **Learning loop** — the brain records which resources past tasks actually
  used; similar future tasks get better recommendations (boost ≠ grant).

## Why RFS (all three themes)

- **Company Brain** (Tom Blomfield): *"…turns it into an executable skills file
  for AI."* — literally what we built: knowledge, policies, AND the skill
  itself live in the brain (`person/* resource/* policy/* task/* skill/*`).
  Proven: an agent with only brain access reproduces the deterministic
  implementation's output exactly (`docs/mode_b_run.md`).
- **Software for Agents** (Aaron Epstein): agents need machine-readable
  permission requirements *before* they act. AccessPackage is that interface.
- **Dynamic Software Interfaces** (Ankit Gupta): the access-sharing UI is
  generated per task, inside the flow of work.

## Business model

- **Land**: per-seat SaaS for the Slack/Teams skill (bottom-up, IT-lite).
- **Expand**: policy engine + audit trail = compliance budget (SOC2/ISO —
  least-privilege evidence is an audit requirement today, mostly manual).
- **Agent tier**: per-agent metering — every autonomous agent needs an access
  broker; we are the toll booth between agents and company data.

## Market / global

- IAM + IGA market ≈ $20B+, growing with agent adoption; incumbents (Okta,
  SailPoint) manage *identities*, not *task-scoped access* — different layer.
- Real-data onboarding proven: people layer generated live from the Crustdata
  API (real Stripe, 679 product-role employees matched) — `docs/crustdata_demo.md`.
  Onboarding = "enter your company domain".
- English/Japanese task parsing already works — built global-first at a
  Japan-based hackathon.

## Demo (90s)

See `docs/demo_script.md`. Live commands: `npm run demo`, `npm run demo:blocked`,
`npm run demo:crustdata`, `npm test` (54/54).
