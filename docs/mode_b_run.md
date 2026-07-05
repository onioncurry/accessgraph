# Mode B execution proof — skill run purely from G-Brain

**Claim:** any agent with only gbrain MCP access (no repo, no TypeScript) can
execute `task_access_assistant`, because the skill AND all knowledge live in
the brain.

**Run date:** 2026-07-05 (live, this session).

## 1. Skill discovery

```
gbrain search "skill for figuring out what access someone needs for an assigned task"
→ top hit: skill/task_access_assistant (score 0.88) — full procedure returned
```

## 2. Task

DM, shota_gushima → Rei_Kawaji:
「プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？」

Parse (step 1): assignee = Rei Kawaji (DM other participant), intent =
continue_progress ("進捗を進める"), project = phoenix, keywords = product, progress.

## 3. Discovery (step 2)

```
gbrain search "product progress stuck onboarding roadmap"
→ resource/prod-1327, resource/onboarding-flow-v2, resource/q2-roadmap-milestones,
  resource/channel-product-dev, resource/product-brief
  (confidential resource/customer-accounts-sfdc NOT surfaced)
```

## 4. Rules (step 3)

`policy/access-decision-rules` + per-resource `governed_by` links
(e.g. `resource/customer-accounts-sfdc → policy/customer_data`).

## 5. Resolution (step 4) — Rei appears in NO current_access list → 5 missing

| resource | intent_role | policy | → recommendation |
|---|---|---|---|
| Product Brief | reference | product_doc | **viewer**, 7d, approver Shota Gushima |
| Q2 Roadmap & Milestones | work_surface | product_doc | **editor**, 7d, approver Jiayi Li |
| PROD-1327 | work_surface | issue_tracker | **contributor**, 14d, approver Mitsuhiro Suzuki |
| Onboarding Flow v2 | reference | product_doc | **viewer**, 7d, approver Koichi Ikeno |
| #product-dev | reference | channel | **member**, no expiry, self-serve |

## 6. AccessPackage (step 5)

```json
{
  "skill": "task_access_assistant",
  "task": { "assignee": "Rei Kawaji", "project": "Project Phoenix", "intent": "continue_progress" },
  "summary": { "resources_found": 5, "missing": 5, "already_has": 0, "blocked": 0 },
  "required_access": [
    { "resource": "Project Phoenix - Product Brief", "system": "Google Docs", "status": "missing", "recommended_permission": "viewer", "duration": "7 days", "approval_required": true, "approver": "Shota Gushima" },
    { "resource": "Q2 Roadmap & Milestones", "system": "Google Docs", "status": "missing", "recommended_permission": "editor", "duration": "7 days", "approval_required": true, "approver": "Jiayi Li (Allison)" },
    { "resource": "PROD-1327: Fix onboarding flow issue", "system": "Jira", "status": "missing", "recommended_permission": "contributor", "duration": "14 days", "approval_required": true, "approver": "Mitsuhiro Suzuki" },
    { "resource": "Onboarding Flow - v2 Design", "system": "Figma", "status": "missing", "recommended_permission": "viewer", "duration": "7 days", "approval_required": true, "approver": "Koichi Ikeno" },
    { "resource": "#product-dev", "system": "Microsoft Teams", "status": "missing", "recommended_permission": "member", "duration": "none", "approval_required": false, "approver": "Shota Gushima" }
  ],
  "next_action": "prepare_access_request"
}
```

## 7. Verdict

**Identical to the deterministic implementation's golden output**
(`contract/sample_response.json`: same 5 resources, same permission map, same
approvers, same summary). Two independent execution paths — one brain.

> RFS quote this closes the loop on (Company Brain, Tom Blomfield):
> *"A system that pulls knowledge out of fragmented sources, structures it,
> keeps it current, and **turns it into an executable skills file for AI**."*
