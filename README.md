# AccessBot

**▶ [Open the interactive demo](https://onioncurry.github.io/accessgraph/demo/slack-demo.html)** — no install, runs in the browser.
(Full live engine — card driven by the real parser/resolver — needs a clone + `npm run serve:demo`, Node ≥ 23.6.)

> Work is assigned in Slack/Teams, but access lives across ten tools.
> **AccessBot** uses **G-Brain** to understand the company's people, resources,
> and permissions, then generates the **minimum access package** required to
> complete the task — for humans *and* AI agents.

RFS fit: **Company Brain** (structured company knowledge) × **Software for
Agents** (machine-readable access requirements before an agent acts) ×
**Dynamic Software Interfaces** (per-task access UI generated in the flow of work).

## Demo scenario (matches the UI mock)

Shota DMs Rei: *"Can you take this task over? Product progress is stuck."*
(Japanese input works too — the parser handles both: 「プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？」)

AccessBot detects the task, queries the G-Brain access graph, and pops the
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

## Repo layout

| Where | What |
|---|---|
| `demo/` + `scripts/serve_demo.mjs` | split-screen Slack demo (`npm run serve:demo` → the card is driven by the REAL engine via `/resolve`) |
| `lib/` | the engine: bilingual task parser (`parseTask`, mention-triggered) + least-privilege resolver (`resolveAccess`) |
| `data/` | the company graph: people, projects, resources, policies, past tasks — plus live Crustdata pulls |
| `company_drive/` | 15 real .docx/.pptx/.xlsx/.json files, each referenced by a graph resource |
| `skills/` | the agent-executable skill (`task_access_assistant/SKILL.md`) |
| `gbrain_pages/` | the same knowledge as G-Brain pages + typed links (41 pages, loadable into a real brain) |
| `scripts/` | demos, seeders, and three adversarial test suites (`npm test`, `test:max`, `test:integration`) |
| `contract/` + `docs/` | the TaskInput→AccessPackage contract, golden I/O, pitch deck, evidence runs |

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

## The knowledge layer

- **`data/`** — people.json, resources.json, policies.json, task_examples.json
  (golden inputs + expected outputs for the parser test suite)
- **`lib/types.ts`** — shared contract types (`TaskInput` → `AccessPackage`)
- **`lib/mockAccess.ts`** — the engine: `resolveAccess(input)` returns the
  least-privilege access package. Deterministic; demo-safe.
- **`scripts/query.ts`** — CLI harness; `contract/sample_response.json` is the
  golden output the card UI is built against.
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

## Interfaces (parser → engine → UI)

See [`docs/access_query_contract.md`](docs/access_query_contract.md).
TL;DR — the parser produces:

```json
{ "assignee": "Rei_Kawaji", "project": "phoenix", "intent": "continue_progress",
  "keywords": ["product", "progress"], "raw_text": "..." }
```

…and calls `resolveAccess(input)` from `lib/mockAccess.ts`. The returned
`AccessPackage` (`contract/sample_response.json`) is what the UI renders:
`required_access[]` → panel rows, `request_message` → behind **Review / Grant**.
