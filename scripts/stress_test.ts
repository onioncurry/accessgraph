// AccessBot — adversarial stress test (Person 3)
// Goal: break resolveAccess(). Every case encodes a rule the service MUST hold.
//   node scripts/stress_test.ts

import { loadGraph, resolveAccess, findPerson } from "../lib/mockAccess.ts";
import { parseTask } from "../lib/parseTask.ts";
import { registerDocument, classifyCategory } from "../lib/registerDoc.ts";
import type { Graph, TaskInput, AccessPackage } from "../lib/types.ts";

const base = loadGraph();
const clone = (): Graph => structuredClone(base);

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e: any) { fail++; failures.push(name); console.log(`  FAIL  ${name}\n        -> ${e.message}`); }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }
const hero: TaskInput = { assignee: "Rei_Kawaji", project: "phoenix", intent: "continue_progress", keywords: ["product", "progress"] };
const line = (p: AccessPackage, id: string) => p.required_access.find((l) => l.resource_id === id);

console.log("\n== A. identity resolution ==");
check("A1 handle Rei_Kawaji resolves", () => assert(resolveAccess({ assignee: "Rei_Kawaji" }, clone()).task.assignee === "Rei Kawaji", "no"));
check("A2 email resolves", () => assert(resolveAccess({ assignee: "rei.kawaji@northwind.ai" }, clone()).task.assignee === "Rei Kawaji", "no"));
check("A3 '@Rei_Kawaji' with @ resolves", () => assert(resolveAccess({ assignee: "@Rei_Kawaji" }, clone()).task.assignee === "Rei Kawaji", "no"));
check("A4 case+whitespace ' REI_kawaji ' resolves", () => assert(resolveAccess({ assignee: "  REI_kawaji " }, clone()).task.assignee === "Rei Kawaji", "no"));
check("A5 unknown assignee -> clarify, no resources", () => {
  const p = resolveAccess({ assignee: "Elon" }, clone());
  assert(p.next_action === "clarify_assignee" && p.required_access.length === 0, `got ${p.next_action}`);
});
check("A6 empty assignee -> clarify, not crash", () => assert(resolveAccess({ assignee: "" }, clone()).next_action === "clarify_assignee", "no"));
check("A7 2-char fragment 'li' must NOT fuzzy-match a random person", () => {
  const p = resolveAccess({ assignee: "li" }, clone());
  assert(p.next_action === "clarify_assignee", `matched '${p.task.assignee}' — substring match too loose`);
});
check("A8 error echo is sanitized/truncated (no 500-char markdown bomb)", () => {
  const bomb = "*`[!](x)`*".repeat(100);
  const p = resolveAccess({ assignee: bomb }, clone());
  assert((p.error || "").length < 120, `error echoes ${String(p.error).length} chars of attacker input`);
});

console.log("\n== B. intent matrix ==");
check("B1 garbage intent 'DELETE_EVERYTHING' degrades to read-only", () => {
  const p = resolveAccess({ ...hero, intent: "DELETE_EVERYTHING" }, clone());
  for (const l of p.required_access) assert(!["editor", "contributor", "write"].includes(l.recommended_permission), `${l.resource_id} got ${l.recommended_permission}`);
});
check("B2 empty intent defaults to read-only", () => {
  const p = resolveAccess({ ...hero, intent: undefined }, clone());
  for (const l of p.required_access) assert(!["editor", "contributor", "write"].includes(l.recommended_permission), `${l.resource_id} got write`);
});
check("B3 UPPERCASE 'CONTINUE_PROGRESS' still counts as write", () => {
  const p = resolveAccess({ ...hero, intent: "CONTINUE_PROGRESS" }, clone());
  assert(line(p, "q2-roadmap-milestones")?.recommended_permission === "editor", "case-sensitive intent");
});

console.log("\n== C. least privilege (hero task) ==");
check("C1 hero: exact permission map", () => {
  const p = resolveAccess(hero, clone());
  const want: Record<string, string> = { "product-brief": "viewer", "q2-roadmap-milestones": "editor", "prod-1327": "contributor", "onboarding-flow-v2": "viewer", "channel-product-dev": "member" };
  for (const [id, perm] of Object.entries(want)) assert(line(p, id)?.recommended_permission === perm, `${id}: want ${perm}, got ${line(p, id)?.recommended_permission}`);
});
check("C2 write intent NEVER grants write on reference resources", () => {
  const p = resolveAccess(hero, clone());
  assert(line(p, "product-brief")?.recommended_permission === "viewer" && line(p, "onboarding-flow-v2")?.recommended_permission === "viewer", "reference got write");
});
check("C3 every missing line has approver + request_message + duration", () => {
  const p = resolveAccess(hero, clone());
  for (const l of p.required_access.filter((x) => x.status === "missing"))
    assert(l.approver && l.request_message && l.duration, `${l.resource_id} incomplete`);
});
check("C4 channel is self-serve (approval_required=false)", () => {
  assert(line(resolveAccess(hero, clone()), "channel-product-dev")?.approval_required === false, "channel requires approval");
});

console.log("\n== D. confidential data (the crown jewels) ==");
check("D1 phoenix task w/ crm keywords -> Customer Accounts BLOCKED", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "read", keywords: ["customer", "revenue", "crm"] }, clone());
  assert(line(p, "customer-accounts-sfdc")?.status === "blocked", `got ${line(p, "customer-accounts-sfdc")?.status}`);
});
check("D2 BYPASS: claiming project='sales' alone must NOT unlock customer data", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "sales", intent: "read" }, clone());
  const l = line(p, "customer-accounts-sfdc");
  assert(!l || l.status === "blocked", `project-claim bypass: status=${l?.status} — anyone who says 'sales' gets CRM bundled`);
});
check("D3 legit: sales project + explicit crm keywords -> grantable, approver = MANAGER not owner", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "sales", intent: "read", keywords: ["customer", "crm"] }, clone());
  const l = line(p, "customer-accounts-sfdc");
  assert(l?.status === "missing", `got ${l?.status}`);
  assert(l?.approver === "Shota Gushima", `approver=${l?.approver}, want Rei's manager`);
});
check("D4 confidential NEVER gets write even with write intent", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "sales", intent: "update", keywords: ["customer", "crm"] }, clone());
  const l = line(p, "customer-accounts-sfdc");
  assert(!l || l.recommended_permission === "viewer", `confidential got ${l?.recommended_permission}`);
});
check("D5 assignee with null manager -> approver falls back, never null", () => {
  const p = resolveAccess({ assignee: "jiayi_li", project: "sales", intent: "read", keywords: ["customer", "crm"] }, clone());
  const l = line(p, "customer-accounts-sfdc");
  assert(!l || l.status === "has_access" || l.approver, "dangling approval: approver is null");
});

console.log("\n== E. privilege escalation / downgrade ==");
check("E1 UNDER-PRIVILEGE: viewer on a work_surface + write task must surface an UPGRADE, not 'has_access'", () => {
  const g = clone();
  g.resources.find((r) => r.id === "q2-roadmap-milestones")!.current_access.push({ person: "rei_kawaji", level: "viewer" });
  const l = line(resolveAccess(hero, g), "q2-roadmap-milestones");
  assert(l?.status === "missing" && l?.recommended_permission === "editor", `status=${l?.status} perm=${l?.recommended_permission} — Rei stays blocked at viewer forever`);
});
check("E2 sufficient access is not re-requested (editor on work_surface)", () => {
  const g = clone();
  g.resources.find((r) => r.id === "q2-roadmap-milestones")!.current_access.push({ person: "rei_kawaji", level: "editor" });
  assert(line(resolveAccess(hero, g), "q2-roadmap-milestones")?.status === "has_access", "re-requesting existing access");
});
check("E3 owner-level access always satisfies", () => {
  const g = clone();
  g.resources.find((r) => r.id === "prod-1327")!.current_access.push({ person: "rei_kawaji", level: "owner" });
  assert(line(resolveAccess(hero, g), "prod-1327")?.status === "has_access", "owner not recognized");
});

console.log("\n== F. fail-closed on broken data ==");
check("F1 resource with UNKNOWN resource_type must fail CLOSED (approval required)", () => {
  const g = clone();
  g.resources.find((r) => r.id === "product-brief")!.resource_type = "weird_new_type";
  const l = line(resolveAccess(hero, g), "product-brief");
  assert(l?.status !== "missing" || l?.approval_required === true, "no policy -> silently approval-free grant (fail-open!)");
});
check("F2 owner id typo -> no crash, line still has a reason", () => {
  const g = clone();
  g.resources.find((r) => r.id === "product-brief")!.owner = "ghost_user";
  const p = resolveAccess(hero, g);
  assert(line(p, "product-brief")?.reason, "crashed or empty");
});
check("F3 graph lint: every owner/manager/access person/policy resolves", () => {
  const g = clone();
  const ids = new Set(g.people.map((p) => p.id));
  const types = new Set(g.policies.map((p) => p.resource_type));
  for (const r of g.resources) {
    assert(ids.has(r.owner), `resource ${r.id}: owner '${r.owner}' unknown`);
    assert(types.has(r.resource_type), `resource ${r.id}: no policy for '${r.resource_type}'`);
    assert(["reference", "work_surface"].includes(r.intent_role), `resource ${r.id}: bad intent_role`);
    for (const a of r.current_access) assert(ids.has(a.person), `resource ${r.id}: access person '${a.person}' unknown`);
  }
  for (const p of g.people) if (p.manager) assert(ids.has(p.manager), `person ${p.id}: manager '${p.manager}' unknown`);
});

console.log("\n== G. degenerate inputs ==");
check("G1 no project, no keywords, JP-only raw_text -> 0 found must say clarify_task (not 'no_action_needed')", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", raw_text: "よろしく頼むね！" }, clone());
  assert(p.summary!.resources_found > 0 || p.next_action === "clarify_task", `0 found but next_action=${p.next_action} — agent thinks it's done`);
});
check("G2 10KB raw_text does not crash / hang", () => {
  const p = resolveAccess({ ...hero, raw_text: "progress roadmap ".repeat(700) }, clone());
  assert(p.summary!.resources_found >= 5, "degraded under load");
});
check("G3 emoji/unicode/injection in raw_text is inert", () => {
  const p = resolveAccess({ ...hero, raw_text: "🔥💀 ]; DROP TABLE resources;-- ${process.exit(1)} <script>alert(1)</script>" }, clone());
  assert(p.summary!.resources_found >= 5, "unicode broke discovery");
});
check("G4 keywords accidentally a string (parser bug) does not crash", () => {
  const p = resolveAccess({ ...hero, keywords: "progress" as unknown as string[] }, clone());
  assert(p.required_access.length >= 0, "crashed");
});
check("G5 fully-granted assignee -> no_action_needed", () => {
  const g = clone();
  for (const r of g.resources.filter((x) => x.project === "phoenix")) r.current_access.push({ person: "rei_kawaji", level: "editor" });
  const p = resolveAccess(hero, g);
  assert(p.next_action === "no_action_needed", `got ${p.next_action}`);
});

console.log("\n== H. determinism & contract ==");
check("H1 same input twice -> byte-identical output", () => {
  assert(JSON.stringify(resolveAccess(hero, clone())) === JSON.stringify(resolveAccess(hero, clone())), "non-deterministic");
});
check("H2 summary counts always add up", () => {
  for (const input of [hero, { assignee: "Rei_Kawaji", project: "sales", intent: "read", keywords: ["crm", "customer"] } as TaskInput]) {
    const p = resolveAccess(input, clone());
    const s = p.summary!;
    assert(s.missing + s.already_has + s.blocked === s.resources_found, "counts drift");
  }
});
check("H3 blocked lines are excluded from any request_message", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "read", keywords: ["customer", "crm"] }, clone());
  for (const l of p.required_access.filter((x) => x.status === "blocked")) assert(!l.request_message, `${l.resource_id} has a ready-to-send request for BLOCKED data`);
});

console.log("\n== I. FULL PIPELINE E2E (design-doc sentences, raw text -> parse -> resolve) ==");
const pipe = (text: string, ctx?: { dm_other?: string }) => resolveAccess(parseTask(text, clone(), ctx), clone());
check("I1 design-doc EN: 'Help Rei continue the product progress and share the docs she needs.'", () => {
  const p = pipe("Help Rei continue the product progress and share the docs she needs.");
  assert(p.task.assignee === "Rei Kawaji", `assignee=${p.task.assignee}`);
  assert(p.task.intent === "continue_progress", `intent=${p.task.intent}`);
  assert(p.summary!.resources_found === 5 && p.summary!.missing === 5, `summary=${JSON.stringify(p.summary)}`);
  assert(line(p, "q2-roadmap-milestones")?.recommended_permission === "editor", "q2 not editor");
  assert(line(p, "product-brief")?.recommended_permission === "viewer", "brief not viewer");
});
check("I2 design-doc JA: 「Reiにプロダクトの進捗を進めてもらいたい。必要そうな資料も共有しておいて。」", () => {
  const p = pipe("Reiにプロダクトの進捗を進めてもらいたい。必要そうな資料も共有しておいて。");
  assert(p.task.assignee === "Rei Kawaji", `assignee=${p.task.assignee}`);
  assert(p.task.intent === "continue_progress", `intent=${p.task.intent}`);
  assert(p.summary!.resources_found >= 5 && p.summary!.missing >= 5, `summary=${JSON.stringify(p.summary)}`);
});
check("I3 hero JA DM (no name in text, dm_other context): 「プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？」", () => {
  const p = pipe("プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？", { dm_other: "Rei_Kawaji" });
  assert(p.task.assignee === "Rei Kawaji", `assignee=${p.task.assignee}`);
  assert(p.task.intent === "continue_progress", `intent=${p.task.intent}`);
  assert(p.summary!.resources_found === 5 && p.summary!.missing === 5, `summary=${JSON.stringify(p.summary)}`);
});
check("I4 design-doc demo line: 'Can you help Rei move the product launch forward?'", () => {
  const p = pipe("Can you help Rei move the product launch forward?");
  assert(p.task.assignee === "Rei Kawaji" && p.task.intent === "continue_progress", `${p.task.assignee}/${p.task.intent}`);
  assert(p.summary!.resources_found === 5, `found=${p.summary!.resources_found}`);
});
check("I5 design-doc intent alias 'continue_product_progress' counts as WRITE", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "Product", intent: "continue_product_progress" }, clone());
  assert(p.task.project === "Project Phoenix", `project alias failed: ${p.task.project}`);
  assert(line(p, "q2-roadmap-milestones")?.recommended_permission === "editor", "alias degraded to read");
});
check("I6 EN review sentence stays read-only end-to-end", () => {
  const p = pipe("Rei, can you review the roadmap and check the onboarding design?");
  for (const l of p.required_access) assert(!["editor", "contributor", "write"].includes(l.recommended_permission), `${l.resource_id} got write from a review`);
});
check("I7 gibberish with no assignee & no DM context -> clarify, never guesses", () => {
  const p = pipe("よろしく！！");
  assert(p.next_action === "clarify_assignee", `got ${p.next_action}`);
});
check("I8 design-doc project value 'Product' (not 'phoenix') resolves via alias", () => {
  const p = resolveAccess({ assignee: "Rei", project: "Product", intent: "continue_progress" }, clone());
  assert(p.task.project === "Project Phoenix", `got ${p.task.project}`);
});

console.log("\n== J. DOCUMENT REGISTRATION / CATALOG (category × project, metadata-only) ==");
check("J1 auto-classification: figma->design, jira->task, checklist->spec, 議事録->meeting-notes", () => {
  const base = { owner: "shota_gushima", project: "phoenix" };
  assert(classifyCategory({ ...base, title: "New Flow", system: "Figma" }) === "design", "figma");
  assert(classifyCategory({ ...base, title: "PROD-2000: fix bug", system: "Jira" }) === "task", "jira");
  assert(classifyCategory({ ...base, title: "Phoenix Launch Checklist", system: "Google Docs" }) === "spec", "checklist");
  assert(classifyCategory({ ...base, title: "7/5 全体会議 議事録", system: "Google Docs" }) === "meeting-notes", "JA meeting");
});
check("J2 explicit category overrides auto-classification", () => {
  assert(classifyCategory({ owner: "x", project: "p", title: "Some Figma thing", system: "Figma", category: "report" }) === "report", "override lost");
});
check("J3 UNSHARED doc: discoverable in the graph, but Rei's access = missing (the whole point)", () => {
  const g = clone();
  const { resource } = registerDocument({
    title: "Phoenix Launch Checklist", system: "Google Docs", owner: "shota_gushima",
    project: "phoenix", summary: "Go/no-go checklist for the Phoenix launch.",
    keywords: ["launch", "checklist", "release"],
  }, g);
  assert(resource.current_access.length === 1 && resource.current_access[0].person === "shota_gushima", "registration widened access!");
  g.resources.push(resource);
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "read", keywords: ["launch", "checklist"] }, g);
  const l = line(p, resource.id);
  assert(l?.status === "missing" && l?.recommended_permission === "viewer" && l?.approver === "Shota Gushima", `unshared doc not requestable: ${JSON.stringify(l && { s: l.status, p: l.recommended_permission })}`);
});
check("J4 catalog page is METADATA ONLY (guarantee marker present, unshared state stated)", () => {
  const g = clone();
  const { page } = registerDocument({ title: "Secret Draft", system: "Google Docs", owner: "shota_gushima", project: "phoenix" }, g);
  assert(page.includes("content_registered: metadata_only"), "no metadata-only marker");
  assert(page.includes("NOT SHARED"), "sharing state not stated");
});
check("J5 registering customer-ish doc auto-inherits confidential + never-auto-grant policy", () => {
  const g = clone();
  const { resource } = registerDocument({ title: "Customer Revenue Breakdown", system: "Google Docs", owner: "ayumu_kobayashi", project: "sales", keywords: ["customer", "revenue"] }, g);
  assert(resource.sensitivity === "confidential" && resource.resource_type === "customer_data", `got ${resource.category}/${resource.sensitivity}`);
  g.resources.push(resource);
  const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "read", keywords: ["customer", "revenue"] }, g);
  assert(line(p, resource.id)?.status === "blocked", "confidential registration not protected");
});
check("J6 unknown owner/project rejected at registration (garbage can't enter the graph)", () => {
  const g = clone();
  let threw = 0;
  try { registerDocument({ title: "X", system: "Google Docs", owner: "ghost", project: "phoenix" }, g); } catch { threw++; }
  try { registerDocument({ title: "X", system: "Google Docs", owner: "shota_gushima", project: "atlantis" }, g); } catch { threw++; }
  assert(threw === 2, "invalid registration accepted");
});
check("J7 registration does NOT disturb the hero demo (golden stays 5/5)", () => {
  const g = clone();
  const { resource } = registerDocument({ title: "Phoenix Launch Checklist", system: "Google Docs", owner: "shota_gushima", project: "phoenix", keywords: ["launch", "checklist", "release"] }, g);
  g.resources.push(resource);
  const p = resolveAccess(hero, g);
  // project-match discovery will include the new doc — verify the ORIGINAL 5 keep their exact permissions
  const want: Record<string, string> = { "product-brief": "viewer", "q2-roadmap-milestones": "editor", "prod-1327": "contributor", "onboarding-flow-v2": "viewer", "channel-product-dev": "member" };
  for (const [id, perm] of Object.entries(want)) assert(line(p, id)?.recommended_permission === perm, `${id} drifted`);
});

console.log("\n== K. PAST-TASK LINKAGE (rough linkage as discovery signal) ==");
check("K1 similar past task boosts discovery WITHOUT project/keyword match", () => {
  // no project, keyword only "progress": past task 'Q1 product progress push'
  // (intent+title match) used q2-roadmap-milestones -> it must be discovered
  const p = resolveAccess({ assignee: "Rei_Kawaji", intent: "continue_progress", keywords: ["progress"] }, clone());
  assert(line(p, "q2-roadmap-milestones"), "past-task resources not surfaced");
  assert(line(p, "product-brief"), "past-task resources not surfaced (brief)");
});
check("K2 past task pulls in confidential resource but it stays BLOCKED (boost ≠ grant)", () => {
  const p = resolveAccess({ assignee: "Rei_Kawaji", intent: "update", keywords: ["quarterly", "revenue", "report"] }, clone());
  const l = line(p, "customer-accounts-sfdc");
  assert(l, "revenue-report past task did not surface customer accounts");
  assert(l!.status === "blocked", `boost leaked into a grant: status=${l!.status}`);
});
check("K3 hero golden is UNCHANGED by task linkage (still 5 found, same permissions)", () => {
  const p = resolveAccess(hero, clone());
  assert(p.summary!.resources_found === 5 && p.summary!.missing === 5, `summary drifted: ${JSON.stringify(p.summary)}`);
  const want: Record<string, string> = { "product-brief": "viewer", "q2-roadmap-milestones": "editor", "prod-1327": "contributor", "onboarding-flow-v2": "viewer", "channel-product-dev": "member" };
  for (const [id, perm] of Object.entries(want)) assert(line(p, id)?.recommended_permission === perm, `${id} drifted`);
});
check("K4 graph lint: every task references valid people/resources/projects", () => {
  const g = clone();
  const pids = new Set(g.people.map((p) => p.id));
  const rids = new Set(g.resources.map((r) => r.id));
  const prj = new Set(g.projects.map((p) => p.id));
  for (const t of g.tasks || []) {
    assert(pids.has(t.requester) && pids.has(t.assignee), `task ${t.id}: bad person ref`);
    assert(prj.has(t.project), `task ${t.id}: bad project ref`);
    for (const rid of t.resources_used) assert(rids.has(rid), `task ${t.id}: unknown resource '${rid}'`);
  }
});
check("K5 broken task linkage (typo'd resource id) does not crash resolution", () => {
  const g = clone();
  g.tasks!.push({ id: "bad", title: "product progress thing", requester: "shota_gushima", assignee: "rei_kawaji", project: "phoenix", intent: "continue_progress", status: "done", resources_used: ["no-such-resource"] });
  const p = resolveAccess(hero, g);
  assert(p.summary!.resources_found === 5, "phantom resource appeared or crash");
});

console.log(`\n========================================`);
console.log(`  ${pass} passed / ${fail} failed`);
if (failures.length) { console.log(`  BROKEN:\n   - ${failures.join("\n   - ")}`); process.exit(1); }
console.log(`  Service held. 🔒`);
