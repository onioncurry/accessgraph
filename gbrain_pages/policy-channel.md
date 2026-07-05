---
type: policy
id: policy-channel
resource_type: channel
read_intent_permission: member
write_intent_permission: member
max_duration: none
approval_required: false
approver_rule: resource_owner
never_auto_grant: false
---

# Access policy: channel

Team chat channels (Slack, Teams). Low risk, self-serve. Read-intent tasks get "member"; write-intent tasks get "member". Grants do not expire. Self-serve, no approval needed. 
