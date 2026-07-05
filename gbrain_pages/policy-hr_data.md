---
type: policy
id: policy-hr_data
resource_type: hr_data
read_intent_permission: viewer
write_intent_permission: viewer
max_duration: 3 days
approval_required: true
approver_rule: assignee_manager
never_auto_grant: true
---

# Access policy: hr_data

Confidential HR data (interviews, payroll, comp). Manager approval, never auto-bundled. Read-intent tasks get "viewer"; write-intent tasks get "viewer". Grants expire after 3 days. Approval required — approver is the assignee's manager. NEVER auto-granted: blocked unless the task has both a project match and explicit keyword evidence.
