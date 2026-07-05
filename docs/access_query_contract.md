# AccessGraph — Query Contract (Person 3 ↔ Person 2 ↔ Person 1)

The interface between the G-Brain Access Graph (Person 3), the
`task_access_assistant` skill (Person 2), and the UI (Person 1). This is locked —
build against it in parallel. Types: [`lib/types.ts`](../lib/types.ts).

---

## The one function Person 2 calls

```ts
import { resolveAccess, loadGraph } from "../../lib/mockAccess.ts";
const pkg = resolveAccess(input);          // AccessPackage
```

- CLI check: `npm run demo` / `node scripts/query.ts --input '<json>'`
- Golden input/output: [`contract/sample_query.json`](../contract/sample_query.json) → [`contract/sample_response.json`](../contract/sample_response.json)
- Golden test cases incl. expected permissions: [`data/task_examples.json`](../data/task_examples.json)

Person 2 owns the **task parser** (Slack/Teams message → `TaskInput`).
Person 3 owns everything from `TaskInput` onward.

---

## INPUT — `TaskInput` (Person 2's parser produces this)

```json
{
  "assignee": "Rei_Kawaji",
  "project": "phoenix",
  "intent": "continue_progress",
  "keywords": ["product", "progress"],
  "raw_text": "プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？"
}
```

- `assignee` (required): name, id, handle (`Rei_Kawaji`), or email — fuzzy-matched.
  In a DM, the assignee is the *other* participant; in a channel mention, parse
  from the message.
- `project`, `intent`, `keywords`, `raw_text` optional — resolver degrades
  gracefully to keyword + project matching.

### `intent` → read vs write

| intent | treated as | effect |
|---|---|---|
| `read` / `review` / `investigate` (or empty) | read | everything read-only |
| `update` / `continue_progress` | write | **work_surface** resources get write; **reference** resources stay read-only |

That per-resource split (`intent_role` in resources.json) is the least-privilege
core: a write task does NOT mean editor everywhere.

---

## OUTPUT — `AccessPackage`

See the full golden output: [`contract/sample_response.json`](../contract/sample_response.json).
Shape (abridged):

```json
{
  "skill": "task_access_assistant",
  "task": { "assignee": "Rei Kawaji", "project": "Project Phoenix", "intent": "continue_progress" },
  "summary": { "resources_found": 5, "missing": 5, "already_has": 0, "blocked": 0 },
  "required_access": [
    {
      "resource": "Project Phoenix - Product Brief",
      "resource_id": "product-brief",
      "system": "Google Docs",
      "icon": "gdocs",
      "owner": "Shota Gushima",
      "status": "missing",
      "recommended_permission": "viewer",
      "duration": "7 days",
      "approval_required": true,
      "approver": "Shota Gushima",
      "approver_email": "shota.gushima@northwind.ai",
      "reason": "Needed to read (reference) for Project Phoenix work: ...",
      "request_message": "Hi Shota, Rei Kawaji needs Viewer access to ... Approve?"
    }
  ],
  "next_action": "prepare_access_request"
}
```

### How Person 1 maps this to the "Auto-share for this task" panel

| AccessPackage | UI |
|---|---|
| `required_access[]` (status `missing`) | checked rows with `icon` + `resource` + `system` |
| `summary.missing` | **Share all (N)** button count |
| `request_message` | sent on **Share all** / shown under **Review** |
| `status: "blocked"` rows | excluded from Share all; show lock + `reason` |
| `status: "has_access"` rows | hidden or shown greyed with ✓ |

### `status` semantics

- `missing` — needs a grant; has `recommended_permission`, `approver`, `request_message`.
  **Includes upgrades**: if the assignee has `viewer` but the task needs `editor`,
  status is `missing` with `current_permission` set and the reason noting the upgrade.
- `has_access` — current level is **sufficient for the task's needed level** (ranked:
  viewer/read/member < editor/contributor/write < owner); no approver, no request
- `blocked` — confidential (`never_auto_grant`); surfaced but **never** auto-bundled;
  approver = assignee's **manager**. Unblocking requires BOTH a project match AND
  explicit keyword evidence in the task — a bare `project` claim is not enough.

### `next_action` semantics

- `prepare_access_request` — at least one grant needed
- `no_action_needed` — resources found, all sufficient
- `clarify_assignee` — assignee unknown or ambiguous (2-char fragments are rejected)
- `clarify_task` — **0 resources matched**; the task was too vague to map. Agents
  must ask, not treat this as done.

## Guarantees (Person 3) — enforced by `npm test` (34 adversarial cases)

1. **Deterministic** — same input, same output. Demo-safe.
2. **Least privilege** — per-resource, via `intent_role` × policy; garbage/unknown
   intents degrade to read-only; under-privilege surfaces as an upgrade.
3. **Confidential-safe** — customer data never silently granted; never writable;
   project-claim alone cannot unlock it.
4. **Fail-closed** — a resource type with no policy still requires approval.
5. **Every grant has an approver** — no dangling requests (manager-less assignees
   fall back to the resource owner).
6. **Injection-inert** — attacker-controlled text is sanitized before being echoed;
   10KB/unicode/emoji inputs don't degrade discovery.
