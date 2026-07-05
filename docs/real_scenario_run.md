# Real-scenario run — Stripe (Crustdata, LIVE)

**Trigger = mention. Same unchanged skill, real org data (679 product-role matches).**

## Scenario A — no mention → bot silent
> Scott E.: "Morning all — Guy will pick up the product work this sprint."

`isTriggered = false` — the bot never acts uninvited.

## Scenario B — @AccessBot mention → minimum access package
> Scott E.: "@AccessBot Can Guy take this task over? Product progress is stuck on the onboarding launch."

Parsed: assignee **guy_alster**, intent `continue_progress`, project `phoenix`.

```json
{
  "task": {
    "assignee": "Guy Alster",
    "assignee_email": "guy.alster@stripe-com.demo",
    "project": "Project Phoenix",
    "intent": "continue_progress"
  },
  "summary": {
    "resources_found": 5,
    "missing": 4,
    "already_has": 1,
    "blocked": 0
  },
  "next_action": "prepare_access_request",
  "required_access": [
    {
      "resource": "PROD-1327: Fix onboarding flow issue",
      "system": "Jira",
      "status": "missing",
      "grant": "contributor",
      "duration": "14 days",
      "approver": "Katie Ochieano"
    },
    {
      "resource": "Project Phoenix - Product Brief",
      "system": "Google Docs",
      "status": "missing",
      "grant": "viewer",
      "duration": "7 days",
      "approver": "Scott E."
    },
    {
      "resource": "#product-dev",
      "system": "Microsoft Teams",
      "status": "has_access",
      "grant": "owner",
      "duration": "none",
      "approver": null
    },
    {
      "resource": "Onboarding Flow - v2 Design",
      "system": "Figma",
      "status": "missing",
      "grant": "viewer",
      "duration": "7 days",
      "approver": "Eduard Lataretu"
    },
    {
      "resource": "Q2 Roadmap & Milestones",
      "system": "Google Docs",
      "status": "missing",
      "grant": "editor",
      "duration": "7 days",
      "approver": "Alex Sadowski"
    }
  ]
}
```

## Scenario C — confidential probe → still blocked on real data
> "@AccessBot Guy needs the customer revenue numbers from the CRM"

Customer Accounts (Salesforce): **blocked** — policy guards are org-independent.

Reproduce: `node scripts/real_scenario.ts stripe.com` (or `--cached` offline).
