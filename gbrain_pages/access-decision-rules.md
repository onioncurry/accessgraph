---
type: policy
id: access-decision-rules
title: AccessGraph decision rules
---

# AccessGraph decision rules

How a task becomes a minimum access package:

1. **Least privilege per resource.** A write-intent task (update / continue_progress)
   only earns write on "work_surface" resources (the thing you produce on).
   "reference" resources you merely consult stay read-only. Unknown or garbage
   intents degrade to read.
2. **Sufficiency ranking.** viewer/read/member < editor/contributor/write < owner.
   Existing access below the needed level is an UPGRADE request, not "has access".
3. **Confidential data is never auto-bundled.** Resources marked never_auto_grant
   (e.g. customer data) stay blocked unless the task has BOTH a project match AND
   explicit keyword evidence. A bare project claim does not unlock them.
   They are never writable, and the approver is the assignee's manager.
4. **Fail closed.** A resource type with no policy still requires approval.
5. **Every grant has an approver and an expiry.** Manager-less assignees fall
   back to the resource owner. Channels are self-serve (no approval, no expiry).
6. **Ambiguity stops, it does not guess.** Unknown/ambiguous assignee -> clarify_assignee.
   Zero matched resources -> clarify_task. Agents must ask, not act.
