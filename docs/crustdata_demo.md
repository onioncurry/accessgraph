# Crustdata real-data demo — deliverable

**Claim:** AccessBot's G-Brain layer is not a hand-written mock. The people
graph can be built from a live enrichment API and the same skill resolves
access on it unchanged.

## Real company (Crustdata API, live)

| field | value |
|---|---|
| Company | Stripe |
| HQ | South San Francisco, California, United States |
| Employees | 5001-10000 |
| Founded | 2010 |
| Product-role matches | **679 real people** (via person search) |

## Real employees mapped into the access graph (top 5)

| person | title | dept (derived) |
|---|---|---|
| Scott E. | Product Marketing Lead | Marketing |
| Alex Sadowski | Product Lead | Product |
| Katie Ochieano | Lead, Product Marketing | Marketing |
| Eduard Lataretu | Engineering Manager | Engineering |
| Guy Alster | Engineering Manager | Engineering |

Emails are synthesized placeholders — public profile fields only, no real
contact data enters the brain (same metadata-only principle as the doc catalog).

## Same skill, real org

Task: *"Help Guy Alster continue the product progress"* →
**5 resources found, 4 missing, next_action: prepare_access_request**

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
  "first_line": {
    "resource": "Project Phoenix - Product Brief",
    "resource_id": "product-brief",
    "system": "Google Docs",
    "icon": "gdocs",
    "owner": "Scott E.",
    "owner_email": "scott.e@stripe-com.demo",
    "status": "missing",
    "current_permission": null,
    "recommended_permission": "viewer",
    "duration": "7 days",
    "approval_required": true,
    "approver": "Scott E.",
    "approver_email": "scott.e@stripe-com.demo",
    "reason": "Needed to read (reference) for Project Phoenix work: \"Project Phoenix - Product Brief\" (Google Docs).",
    "request_message": "Hi Scott, Guy Alster needs Viewer access to \"Project Phoenix - Product Brief\" (Google Docs) for 7 days to help with continuing the product progress. Approve?"
  }
}
```

Full output: `data/crustdata_demo.json`. Reproduce: `node scripts/crustdata_demo.ts stripe.com`
(requires CRUSTDATA_API_KEY in .env).
