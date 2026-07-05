---
type: policy
id: policy-issue_tracker
resource_type: issue_tracker
read_intent_permission: viewer
write_intent_permission: contributor
max_duration: 14 days
approval_required: true
approver_rule: resource_owner
never_auto_grant: false
---

# Access policy: issue_tracker

Issue / sprint trackers such as Jira and Linear. Read-intent tasks get "viewer"; write-intent tasks get "contributor". Grants expire after 14 days. Approval required — approver is the resource owner. 
