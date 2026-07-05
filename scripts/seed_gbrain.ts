// AccessBot — G-Brain seeder (Person 3)
//
// Turns data/*.json into one markdown page per entity (people + resources)
// with structured frontmatter, written to gbrain_pages/. Page bodies are
// written so G-Brain full-text + vector search surfaces the right resources
// for a task ("continue product progress" -> Q2 Roadmap, Product Brief, ...).
//
//   node scripts/seed_gbrain.ts        # generate gbrain_pages/*.md + manifests
//
// Load into a real brain:
//   gbrain capture --file gbrain_pages/<id>.md --slug <slug>   (per _manifest.json)
// Typed links (ownership/access/reporting graph): gbrain_pages/_links.json

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "../lib/mockAccess.ts";
import { buildCatalogPage, classifyCategory } from "../lib/registerDoc.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const graph = loadGraph();
const outDir = join(root, "gbrain_pages");
mkdirSync(outDir, { recursive: true });

const personName = (id: string) => graph.people.find((p) => p.id === id)?.name || id;
const fm = (obj: Record<string, unknown>) =>
  "---\n" +
  Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n") +
  "\n---\n";

const links: Array<{ from: string; to: string; link_type: string; context?: string }> = [];
const manifest: Array<{ slug: string; file: string }> = [];

// --- people pages -------------------------------------------------------------
for (const p of graph.people) {
  const slug = `person/${p.id}`;
  const body =
    fm({ type: "person", id: p.id, name: p.name, handle: p.handle, role: p.role, email: p.email, department: p.department }) +
    `\n# ${p.name}\n\n${p.name} (@${p.handle}) is ${p.role} in ${p.department}.` +
    (p.manager ? ` Reports to ${personName(p.manager)}.` : "") +
    `\nEmail: ${p.email}.\n`;
  writeFileSync(join(outDir, `${p.id}.md`), body);
  manifest.push({ slug, file: `gbrain_pages/${p.id}.md` });
  if (p.manager) links.push({ from: slug, to: `person/${p.manager}`, link_type: "reports_to" });
}

// --- resource pages (catalog format: metadata + summary only) ------------------
for (const r of graph.resources) {
  const slug = `resource/${r.id}`;
  if (!r.category) {
    r.category = classifyCategory({ title: r.title, system: r.system, owner: r.owner, project: r.project, keywords: r.keywords });
  }
  writeFileSync(join(outDir, `${r.id}.md`), buildCatalogPage(r, graph));
  manifest.push({ slug, file: `gbrain_pages/${r.id}.md` });

  links.push({ from: `person/${r.owner}`, to: slug, link_type: "owns" });
  links.push({ from: slug, to: `project/${r.project}`, link_type: "belongs_to" });
  links.push({ from: slug, to: `category/${r.category}`, link_type: "categorized_as" });
  for (const a of r.current_access) {
    links.push({ from: `person/${a.person}`, to: slug, link_type: "has_access", context: a.level });
  }
}

// --- category index pages (the "browse by category" layer) ---------------------
const byCategory = new Map<string, typeof graph.resources>();
for (const r of graph.resources) {
  const list = byCategory.get(r.category!) || [];
  list.push(r);
  byCategory.set(r.category!, list);
}
for (const [cat, items] of byCategory) {
  const slug = `category/${cat}`;
  const rows = items
    .map((r) => {
      const projectName = graph.projects.find((p) => p.id === r.project)?.name || r.project;
      const shared = r.current_access.length > 1 ? "shared" : "NOT shared (owner only)";
      return `- [[resource/${r.id}]] — ${r.title} (${r.system}, ${projectName}, owner ${personName(r.owner)}, ${shared})${r.summary ? ` — ${r.summary}` : ""}`;
    })
    .join("\n");
  const body =
    fm({ type: "category", id: `category-${cat}`, title: `Category: ${cat}`, count: items.length }) +
    `\n# Category: ${cat}\n\nAll registered ${cat} documents, regardless of sharing status. ` +
    `Content is never stored here — request access via task_access_assistant.\n\n${rows}\n`;
  writeFileSync(join(outDir, `category-${cat}.md`), body);
  manifest.push({ slug, file: `gbrain_pages/category-${cat}.md` });
}

// --- policy pages (the access rules themselves live in G-Brain) ---------------
for (const pol of graph.policies) {
  const slug = `policy/${pol.resource_type}`;
  const body =
    fm({
      type: "policy",
      id: `policy-${pol.resource_type}`,
      resource_type: pol.resource_type,
      read_intent_permission: pol.read_intent_permission,
      write_intent_permission: pol.write_intent_permission,
      max_duration: pol.max_duration,
      approval_required: pol.approval_required,
      approver_rule: pol.approver_rule,
      never_auto_grant: !!pol.never_auto_grant,
    }) +
    `\n# Access policy: ${pol.resource_type}\n\n` +
    `${pol.description || ""} ` +
    `Read-intent tasks get "${pol.read_intent_permission}"; write-intent tasks get "${pol.write_intent_permission}". ` +
    `Grants ${pol.max_duration === "none" ? "do not expire" : `expire after ${pol.max_duration}`}. ` +
    (pol.approval_required
      ? `Approval required — approver is the ${pol.approver_rule === "assignee_manager" ? "assignee's manager" : "resource owner"}. `
      : "Self-serve, no approval needed. ") +
    (pol.never_auto_grant
      ? "NEVER auto-granted: blocked unless the task has both a project match and explicit keyword evidence."
      : "") +
    "\n";
  writeFileSync(join(outDir, `policy-${pol.resource_type}.md`), body);
  manifest.push({ slug, file: `gbrain_pages/policy-${pol.resource_type}.md` });
  // link every resource of this type to its governing policy
  for (const r of graph.resources.filter((x) => x.resource_type === pol.resource_type)) {
    links.push({ from: `resource/${r.id}`, to: slug, link_type: "governed_by" });
  }
}

// --- past-task pages (what similar work actually used — the learning loop) -----
for (const t of graph.tasks || []) {
  const slug = `task/${t.id}`;
  const used = t.resources_used
    .map((id) => graph.resources.find((r) => r.id === id)?.title || id)
    .join(", ");
  const body =
    fm({
      type: "task",
      id: t.id,
      title: t.title,
      requester: t.requester,
      assignee: t.assignee,
      project: t.project,
      intent: t.intent,
      status: t.status,
      resources_used: t.resources_used,
    }) +
    `\n# Task: ${t.title}\n\n` +
    `${t.raw_text || t.title} — requested by ${personName(t.requester)}, assigned to ${personName(t.assignee)} (${t.status}). ` +
    `Intent: ${t.intent}. Resources actually used: ${used}. ` +
    `Similar future tasks likely need the same resources.\n`;
  writeFileSync(join(outDir, `task-${t.id}.md`), body);
  manifest.push({ slug, file: `gbrain_pages/task-${t.id}.md` });

  links.push({ from: slug, to: `person/${t.assignee}`, link_type: "assigned_to" });
  links.push({ from: slug, to: `person/${t.requester}`, link_type: "requested_by" });
  links.push({ from: slug, to: `project/${t.project}`, link_type: "belongs_to" });
  for (const rid of t.resources_used) {
    links.push({ from: slug, to: `resource/${rid}`, link_type: "used_resource" });
  }
}

// --- the decision rules page (how the resolver combines everything) ------------
const rulesBody =
  fm({ type: "policy", id: "access-decision-rules", title: "AccessBot decision rules" }) +
  `\n# AccessBot decision rules

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
` ;
writeFileSync(join(outDir, "access-decision-rules.md"), rulesBody);
manifest.push({ slug: "policy/access-decision-rules", file: "gbrain_pages/access-decision-rules.md" });

writeFileSync(join(outDir, "_links.json"), JSON.stringify(links, null, 2));
writeFileSync(join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Generated ${manifest.length} pages + ${links.length} links in gbrain_pages/`);
