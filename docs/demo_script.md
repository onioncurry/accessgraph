# AccessGraph — 90-second demo script

## The problem (10s)
> "Work gets assigned in Slack. But access lives in ten tools — Docs, Jira,
> Figma, Teams, Salesforce. People and AI agents get blocked not because they
> can't do the work, but because they don't have the right permissions."

## Before (10s)
Shota DMs Rei: 「プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？」
Normally: *"I can't open the roadmap… I don't have the Figma… who owns PROD-1327?"* → the task stalls on day one.

## After — the live demo (40s)
Show the **"Auto-share for this task"** panel appearing next to the DM:
- AccessGraph parsed the task and queried **G-Brain** — found the **5 resources** it touches.
- Rei is missing **all 5** → one click: **Share all (5)**.
- Point at the permissions — **least privilege, per resource**:
  - Product Brief → **viewer** (she reads it)
  - Q2 Roadmap & Milestones → **editor** (she updates it)
  - PROD-1327 → **contributor**
  - Onboarding Flow v2 → **viewer**
  - #product-dev → **member**
- Each grant has an **owner-approver** and expiry (7–14 days).
- Confidential Salesforce data? **Blocked** — surfaced but never auto-bundled;
  needs Rei's manager.

Then flip to the **AccessPackage JSON** (`npm run demo:json`):
> "This is the agent-facing part. Before an AI agent touches anything, it gets a
> machine-readable list of exactly what access it needs, at what level, for how
> long, and who approves. That's the missing layer between company data and safe
> AI automation."

## Prove it's real G-Brain (15s)
```bash
gbrain search "product progress stuck onboarding roadmap"
# → PROD-1327, Onboarding Flow v2, Q2 Roadmap & Milestones, #product-dev
#   (confidential Customer Accounts correctly NOT surfaced)
```

## The one-liner (5s)
> "AccessGraph is a GStack skill that uses G-Brain to turn a Slack task into a
> minimum access package for humans and AI agents."

---

## Backup commands
```bash
npm run demo            # hero task, card + JSON
npm run demo:review     # read-only task → everything viewer
npm run demo:blocked    # confidential data → status: blocked
```
