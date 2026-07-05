---
type: policy
id: policy-code_repo
resource_type: code_repo
read_intent_permission: read
write_intent_permission: write
max_duration: 30 days
approval_required: true
approver_rule: resource_owner
never_auto_grant: false
---

# Access policy: code_repo

Source code repositories (GitHub, GitLab). Read-intent tasks get "read"; write-intent tasks get "write". Grants expire after 30 days. Approval required — approver is the resource owner. 
