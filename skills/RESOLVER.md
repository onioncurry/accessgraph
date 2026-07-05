# AccessGraph skills

Skill registry for gbrain's skill resolver (`gbrain config set mcp.skills_dir <this dir>`
or auto-discovered by the cwd walk-up).

| skill | when to use |
|---|---|
| [task_access_assistant](task_access_assistant/SKILL.md) | A task is assigned in Slack/Teams and someone (human or agent) needs to know the minimum access package required to complete it. Also: "what access does X need", "@AccessGraph". |

All skills execute on top of the G-Brain access graph: `person/*`, `resource/*`,
`policy/*` pages and `owns / has_access / reports_to / governed_by` links.
Decision logic: `policy/access-decision-rules` (in the brain itself).
