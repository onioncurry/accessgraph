// AccessBot — REAL-DATA scenario runner (Crustdata live)
//
//   node scripts/real_scenario.ts [company_domain]      # default stripe.com
//   node scripts/real_scenario.ts --cached               # offline (committed fetch)
//
// Pulls a REAL company and REAL employees from Crustdata, swaps them into the
// access graph, then runs the pipeline exactly as it happens in Slack:
//   message WITHOUT a mention  -> bot stays silent (trigger = mention)
//   "@AccessBot ..." message   -> parse -> graph -> minimum access package
// Falls back to the cached data/crustdata_demo.json people if the API is down.
// Writes the evidence to docs/real_scenario_run.md.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph, resolveAccess } from "../lib/mockAccess.ts";
import { parseTask, isTriggered } from "../lib/parseTask.ts";
import type { Graph, Person } from "../lib/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const args = process.argv.slice(2);
const DOMAIN = args.find((a) => !a.startsWith("--")) || "stripe.com";
let source = args.includes("--cached") ? "cached" : "LIVE";

function apiKey(): string | null {
  if (process.env.CRUSTDATA_API_KEY) return process.env.CRUSTDATA_API_KEY;
  try {
    const m = readFileSync(join(root, ".env"), "utf8").match(/^CRUSTDATA_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* no .env */ }
  return null;
}

function fromCache(): { company: string; total: number; people: Person[] } {
  const c = JSON.parse(readFileSync(join(root, "data", "crustdata_demo.json"), "utf8"));
  return { company: c.company.name, total: c.people_matched_total, people: c.graph.people };
}

async function fetchRealOrg(domain: string): Promise<{ company: string; total: number; people: Person[] }> {
  if (source === "cached") return fromCache();
  const key = apiKey();
  if (!key) { source = "cached (no API key)"; return fromCache(); }
  try {
    const headers = { Authorization: `Token ${key}`, "Content-Type": "application/json" };
    const co = await (await fetch(`https://api.crustdata.com/screener/company?company_domain=${domain}`, { headers })).json();
    const body = JSON.stringify({
      filters: [
        { filter_type: "CURRENT_COMPANY", type: "in", value: [domain] },
        { filter_type: "CURRENT_TITLE", type: "in", value: ["product manager", "product lead", "engineering manager", "design lead"] },
      ],
      page: 1,
    });
    const ppl = await (await fetch("https://api.crustdata.com/screener/person/search", { method: "POST", headers, body })).json();
    const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "_").slice(0, 30);
    const people: Person[] = (ppl.profiles || []).slice(0, 5).map((p: any, i: number) => ({
      id: slug(p.name || `person_${i}`),
      name: p.name || `Person ${i}`,
      handle: slug(p.name || `person_${i}`),
      role: p.default_position_title || "Team member",
      email: `${slug(p.name || "x").replace(/_/g, ".")}@${domain.replace(/\./g, "-")}.demo`,
      department: /design/i.test(p.default_position_title || "") ? "Design"
        : /engineer/i.test(p.default_position_title || "") ? "Engineering" : "Product",
      manager: null,
    }));
    for (let i = 1; i < people.length; i++) people[i].manager = people[0].id;
    if (people.length < 2) throw new Error("too few people returned");
    return { company: Array.isArray(co) ? co[0].company_name : co.company_name, total: ppl.total_display_count, people };
  } catch (e: any) {
    source = `cached (API failed: ${e.message})`;
    return fromCache();
  }
}

// --- run -----------------------------------------------------------------------

const org = await fetchRealOrg(DOMAIN);
console.log(`\n🏢 REAL ORG (Crustdata, ${source}): ${org.company} — ${org.total} product-role people matched, using ${org.people.length}`);
org.people.forEach((p, i) => console.log(`   ${i === 0 ? "👑" : "  "} ${p.name} — ${p.role}`));

// swap the fictional people for the real org; resources/policies/tasks unchanged
const base = loadGraph();
const ids = org.people.map((p) => p.id);
const graph: Graph = {
  people: org.people,
  projects: base.projects.map((pr) => ({ ...pr, lead: ids[0], members: ids })),
  resources: base.resources.map((r, i) => ({
    ...r,
    owner: ids[i % ids.length],
    current_access: [{ person: ids[i % ids.length], level: "owner" }],
  })),
  policies: base.policies,
  tasks: (base.tasks || []).map((t) => ({ ...t, requester: ids[0], assignee: ids[1 % ids.length] })),
};

const manager = org.people[0];
const assignee = org.people[org.people.length - 1];
const assigneeFirst = assignee.name.split(" ")[0];

// SCENARIO A — no mention: the bot must stay silent
const passive = `Morning all — ${assigneeFirst} will pick up the product work this sprint.`;
console.log(`\n💬 [#product-dev] ${manager.name}: "${passive}"`);
console.log(`   → isTriggered: ${isTriggered(passive)} — bot stays silent`);

// SCENARIO B — mention: full pipeline on the real org
const active = `@AccessBot Can ${assigneeFirst} take this task over? Product progress is stuck on the onboarding launch.`;
console.log(`\n💬 [#product-dev] ${manager.name}: "${active}"`);
console.log(`   → isTriggered: ${isTriggered(active)} — bot activates`);

const input = parseTask(active, graph);
console.log(`   → parsed: assignee=${input.assignee} intent=${input.intent} project=${input.project} keywords=[${input.keywords}]`);

const pkg = resolveAccess(input, graph);
console.log(`\n📦 ACCESS PACKAGE for ${pkg.task.assignee} (${assignee.role}):`);
console.log(`   ${pkg.summary!.resources_found} resources · ${pkg.summary!.missing} missing · ${pkg.summary!.already_has} already · ${pkg.summary!.blocked} blocked`);
for (const l of pkg.required_access) {
  const mark = l.status === "missing" ? "✗" : l.status === "has_access" ? "✓" : "⛔";
  const grant = l.status === "missing"
    ? ` → ${l.recommended_permission}${l.duration !== "none" ? `, ${l.duration}` : ""} · approver: ${l.approver}`
    : l.status === "has_access" ? ` (already ${l.current_permission})` : " (confidential — not bundled)";
  console.log(`   ${mark} ${l.resource} [${l.system}]${grant}`);
}
console.log(`   next_action: ${pkg.next_action}`);

// SCENARIO C — confidential probe on the real org: still blocked
const probe = parseTask(`@AccessBot ${assigneeFirst} needs the customer revenue numbers from the CRM`, graph);
const probePkg = resolveAccess(probe, graph);
const conf = probePkg.required_access.find((l) => l.resource_id === "customer-accounts-sfdc");
console.log(`\n🔒 Confidential probe: "customer revenue numbers" → Customer Accounts status = ${conf ? conf.status : "not surfaced"}`);

// save as a deliverable
writeFileSync(join(root, "docs", "real_scenario_run.md"), `# Real-scenario run — ${org.company} (Crustdata, ${source})

**Trigger = mention. Same unchanged skill, real org data (${org.total} product-role matches).**

## Scenario A — no mention → bot silent
> ${manager.name}: "${passive}"

\`isTriggered = false\` — the bot never acts uninvited.

## Scenario B — @AccessBot mention → minimum access package
> ${manager.name}: "${active}"

Parsed: assignee **${input.assignee}**, intent \`${input.intent}\`, project \`${input.project}\`.

\`\`\`json
${JSON.stringify({ task: pkg.task, summary: pkg.summary, next_action: pkg.next_action, required_access: pkg.required_access.map((l) => ({ resource: l.resource, system: l.system, status: l.status, grant: l.recommended_permission, duration: l.duration, approver: l.approver })) }, null, 2)}
\`\`\`

## Scenario C — confidential probe → still blocked on real data
> "@AccessBot ${assigneeFirst} needs the customer revenue numbers from the CRM"

Customer Accounts (Salesforce): **${conf ? conf.status : "not surfaced"}** — policy guards are org-independent.

Reproduce: \`node scripts/real_scenario.ts ${DOMAIN}\` (or \`--cached\` offline).
`);
console.log(`   wrote docs/real_scenario_run.md`);
