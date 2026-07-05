---
type: policy
id: policy-finance_data
resource_type: finance_data
read_intent_permission: viewer
write_intent_permission: viewer
max_duration: 3 days
approval_required: true
approver_rule: assignee_manager
never_auto_grant: true
---

# Access policy: finance_data

Confidential finance/board material. Manager approval, never auto-bundled. Read-intent tasks get "viewer"; write-intent tasks get "viewer". Grants expire after 3 days. Approval required — approver is the assignee's manager. NEVER auto-granted: blocked unless the task has both a project match and explicit keyword evidence.
