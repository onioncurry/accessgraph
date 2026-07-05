---
type: policy
id: policy-product_doc
resource_type: product_doc
read_intent_permission: viewer
write_intent_permission: editor
max_duration: 7 days
approval_required: true
approver_rule: resource_owner
never_auto_grant: false
---

# Access policy: product_doc

Internal product documents (Docs, Sheets, Figma). Read-intent tasks get "viewer"; write-intent tasks get "editor". Grants expire after 7 days. Approval required — approver is the resource owner. 
