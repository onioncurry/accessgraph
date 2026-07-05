# AccessGraph

> Work is assigned in Slack/Teams, but access lives across ten tools.
> **AccessGraph** uses **G-Brain** to understand the company's people, resources,
> and permissions, then generates the **minimum access package** required to
> complete the task — for humans *and* AI agents.

RFS fit: **Company Brain** (structured company knowledge) × **Software for
Agents** (machine-readable access requirements before an agent acts) ×
**Dynamic Software Interfaces** (per-task access UI generated in the flow of work).

## Demo scenario (matches the UI mock)

Shota DMs Rei: *「プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？」*

AccessGraph detects the task, queries the G-Brain access graph, and pops the
**"Auto-share for this task"** panel: Rei is missing all 5 resources the task
needs — Product Brief (viewer), Q2 Roadmap & Milestones (editor), PROD-1327
(contributor), Onboarding Flow v2 (viewer), #product-dev (member) →
**Share all (5)**.

```bash
npm run demo            # hero task -> card + AccessPackage JSON
npm run demo:review     # read-only task -> everything viewer (least privilege)
npm run demo:blocked    # confidential Salesforce data -> status: blocked
npm run demo:crustdata  # REAL company data (Crustdata API) -> same skill, real org
```

**Real-data proof** ([docs/crustdata_demo.md](docs/crustdata_demo.md)): the people
layer is generated live from the Crustdata API — real Stripe (679 product-role
employees matched), 5 mapped into the graph, and the *same unchanged skill*
resolves their access. Not a hand-written mock. (Requires `CRUSTDATA_API_KEY`
in `.env`; a cached run is committed as the deliverable.)

Requires Node ≥ 23.6 (native TS). No install, no build.

## Team split

| Person | Owns | Where |
|---|---|---|
| **1 — Slack Front Door** | mention → thread reply → Block Kit card, buttons | `app/api/slack/`, `components/` |
| **2 — GStack Skill** | parse task → call `resolveAccess()` → strict JSON | `skills/task_access_assistant/` |
| **3 — G-Brain Access Graph** | company knowledge, access state, policies, resolver | `data/`, `lib/`, `scripts/`, `gbrain_pages/` |

## It's a G-Brain skill, end to end

The whole product ships as **one skill** with two execution paths:

- **`skills/task_access_assistant/SKILL.md`** — the agent-executable skill
  (gbrain's skill resolver discovers it via `skills/RESOLVER.md`)
- **`skill/task_access_assistant`** — the same skill **as a page inside the
  brain**, so any agent that can search the brain finds the procedure itself
- **Mode A** (deterministic): `node scripts/query.ts` — for the demo & CI
- **Mode B** (pure brain): an agent with only gbrain MCP follows the skill using
  `person/* · resource/* · policy/*` pages — **proven identical output**:
  [`docs/mode_b_run.md`](docs/mode_b_run.md)

That is the Company Brain RFS verbatim: *"turns it into an executable skills
file for AI."* The brain holds the knowledge, the rules, **and the skill**.

## Person 3 layer (this is done ✅)

- **`data/`** — people.json, resources.json, policies.json, task_examples.json
  (golden inputs + expected outputs for Person 2's parser tests)
- **`lib/types.ts`** — shared contract types (`TaskInput` → `AccessPackage`)
- **`lib/mockAccess.ts`** — the engine: `resolveAccess(input)` returns the
  least-privilege access package. Deterministic; demo-safe.
- **`scripts/query.ts`** — CLI harness; `contract/sample_response.json` is the
  golden output Person 1 can build the card against **right now**.
- **`scripts/seed_gbrain.ts`** + **`gbrain_pages/`** — the same entities seeded
  into a real G-Brain (pages + typed links: owns / has_access / reports_to /
  governed_by), so resource discovery is a real semantic query, not a hard-coded list.
- **Access rules live in G-Brain too** — one `policy/<resource_type>` page per
  rule plus `policy/access-decision-rules` (the full decision logic). Ask G-Brain
  *"who approves access to customer data?"* and it answers from the policy page.
  Every resource is linked `governed_by` → its policy.
- **Past-task memory (`task/*`)** — the brain records which resources past tasks
  *actually used* (`used_resource` links; rough linkage is fine). Similar new
  tasks get those resources boosted in discovery — even without keyword or
  project match. Boost ≠ grant: a confidential resource surfaced this way still
  comes back `blocked`. This is the learning loop: the more tasks flow through,
  the better the recommendations get.
- **Document catalog (category × project)** — when a document is finished it is
  registered via `scripts/register_doc.ts` **regardless of sharing status**:
  auto-classified (spec / design / task / report / meeting-notes / channel /
  customer-data, explicit flag overrides), listed on a `category/*` index page,
  linked `categorized_as`. **Metadata + one-line summary only — content never
  enters the brain**, so everyone can *discover* a doc exists, but reading it
  still goes through the least-privilege request. Unshared docs are the demo:
  registered → found by search → `status: missing` → one-click request.

### The judge-facing differentiators

1. **Per-resource least privilege.** The hero task is a *write* task, but only
   `work_surface` resources get write (Q2 Roadmap → editor, Jira → contributor);
   `reference` resources stay read-only (Brief → viewer, Figma → viewer).
2. **Confidential never auto-bundled.** `customer_data` returns
   `status: "blocked"` with the assignee's **manager** as approver — it is never
   silently included in a grant.
3. **Machine-readable for agents.** The `AccessPackage` JSON tells an AI agent
   exactly what access it needs, at what level, for how long, and who approves —
   *before* it acts.

## Interface (Person 2 / Person 1)

See [`docs/access_query_contract.md`](docs/access_query_contract.md).
TL;DR — Person 2's parser produces:

```json
{ "assignee": "Rei_Kawaji", "project": "phoenix", "intent": "continue_progress",
  "keywords": ["product", "progress"], "raw_text": "..." }
```

…and calls `resolveAccess(input)` from `lib/mockAccess.ts`. The returned
`AccessPackage` (`contract/sample_response.json`) is what Person 1 renders:
`required_access[]` → panel rows, `request_message` → behind **Review / Share all**.
