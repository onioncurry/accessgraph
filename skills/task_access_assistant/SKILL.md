---
name: task_access_assistant
description: >
  Turn a Slack/Teams task assignment into a minimum access package for humans
  and AI agents. Reads the task, identifies assignee/project/intent, queries
  the G-Brain access graph (people, resources, ownership, current access,
  policies), and returns least-privilege access recommendations with approvers
  as strict JSON. Trigger on: a task being assigned to someone ("can you take
  this", "help X move Y forward", "@AccessBot"), or any request like "what
  access does X need for this task".
version: 1.0.0
authors: AccessBot team (c0mpiled hackathon, RFS: Company Brain / Software for Agents)
requires:
  - gbrain MCP (search, get_page, get_links) OR the accessgraph repo checkout
---

# task_access_assistant

You are resolving **what access an assignee needs to complete a task** — the
minimum package, never more. Output is both a human card and machine-readable
JSON (`AccessPackage`) that downstream agents consume **before** acting.

## Execution modes

**Mode A — deterministic (repo available, prefer this for demos):**

```bash
node scripts/query.ts --input '{"assignee":"<who>","project":"<proj>","intent":"<intent>","keywords":[...],"raw_text":"<original message>"}'
```

Returns the full `AccessPackage`. Done.

**Mode B — pure G-Brain (no repo, any agent with gbrain MCP):** follow the
steps below. All knowledge you need lives in the brain:

- `person/*` pages — people, roles, managers
- `resource/*` pages — resources, owners, keywords, **current access state**
- `policy/*` pages — access rules per resource_type
- `policy/access-decision-rules` — the decision logic (read this first)

## Steps (Mode B)

1. **Parse the task.** From the message, extract:
   - `assignee` — who will do the work (in a DM: the other participant)
   - `intent` — one of `read | review | investigate | update | continue_progress`
     (anything unclear → `read`; "進捗を進める/move forward/take over" → `continue_progress`)
   - `project` + `keywords` — nouns from the message ("product", "progress", ...)
   - If the assignee is ambiguous (e.g. a 2-char fragment matching several
     people) → STOP, return `next_action: "clarify_assignee"`. Never guess.

2. **Discover resources.** `gbrain search` with the project + keywords
   (e.g. "product progress roadmap onboarding"). Collect `resource/*` hits.
   If zero resources match → return `next_action: "clarify_task"`. Never
   pretend an empty result means "no access needed".

3. **Load the rules.** `gbrain get_page policy/access-decision-rules`, and for
   each discovered resource follow its `governed_by` link (`gbrain get_links`)
   to its `policy/*` page.

4. **Resolve each resource** against the assignee's `current_access` (on the
   resource page) and the policy:
   - write intent + `intent_role: work_surface` → policy's write permission
   - everything else → policy's read permission
   - already has a level ≥ needed (viewer/read/member < editor/contributor/write
     < owner) → `has_access`; a lower level → `missing` (upgrade)
   - `never_auto_grant` (confidential) → `blocked` unless the task has BOTH a
     project match AND explicit keyword evidence; never writable; approver is
     the assignee's **manager** (from their `person/*` page)
   - no policy for the type → fail closed: approval required
   - approver: policy `approver_rule` (`resource_owner` | `assignee_manager`,
     manager-less → fall back to owner). Every `missing` line gets a
     `request_message`: "Hi <approver>, <assignee> needs <Level> access to
     \"<resource>\" (<system>) for <duration> to help with <task>. Approve?"

5. **Emit the AccessPackage** (strict JSON, schema in
   `docs/access_query_contract.md`; golden example in
   `contract/sample_response.json`):

```json
{
  "skill": "task_access_assistant",
  "task": { "assignee": "...", "project": "...", "intent": "..." },
  "summary": { "resources_found": 0, "missing": 0, "already_has": 0, "blocked": 0 },
  "required_access": [ { "resource": "...", "status": "missing", "recommended_permission": "...", "duration": "...", "approver": "...", "request_message": "..." } ],
  "next_action": "prepare_access_request | no_action_needed | clarify_assignee | clarify_task"
}
```

## Hard rules (violating any of these is a bug)

1. Least privilege — never recommend above what the intent needs.
2. Confidential data is never auto-bundled, never writable.
3. Every grant has an approver and a duration.
4. Ambiguity stops you; you ask, you don't guess.
5. Same input → same output.

## Verify

`npm test` runs 54 adversarial cases (plus `npm run test:max` and `npm run test:integration` — 100+ total) (privilege escalation, project-claim
bypass, fail-open, injection, fuzzy-match footguns). All must pass.
