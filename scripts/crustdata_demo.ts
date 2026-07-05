// AccessGraph — Crustdata real-data demo (Person 3, deliverable)
//
// Proves the G-Brain people layer is not hand-written JSON: it can be built
// from a real enrichment source. Pulls a REAL company + REAL employees from
// the Crustdata API, maps them into the access graph, and runs the exact same
// task_access_assistant resolution on them.
//
//   node scripts/crustdata_demo.ts [company_domain]     # default: stripe.com
//
// Requires CRUSTDATA_API_KEY in .env (never committed).
// Outputs:
//   data/crustdata_demo.json   — fetched + mapped graph (cached deliverable)
//   docs/crustdata_demo.md     — human-readable deliverable
//   gbrain_pages/crustdata-company.md — company page for the brain
//
// PII note: only public profile fields (name / title / region) are used;
// emails are SYNTHESIZED placeholders, real contact data is never stored.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph, resolveAccess } from "../lib/mockAccess.ts";
import type { Graph, Person } from "../lib/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// --- config -------------------------------------------------------------------

const DOMAIN = process.argv[2] || "stripe.com";
const API = "https://api.crustdata.com";

function apiKey(): string {
  if (process.env.CRUSTDATA_API_KEY) return process.env.CRUSTDATA_API_KEY;
  try {
    const env = readFileSync(join(root, ".env"), "utf8");
    const m = env.match(/^CRUSTDATA_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  console.error("CRUSTDATA_API_KEY not found (.env or env var). Aborting.");
  process.exit(1);
}

const KEY = apiKey();
const headers = { Authorization: `Token ${KEY}`, "Content-Type": "application/json", Accept: "application/json" };

// --- fetch --------------------------------------------------------------------

async function fetchCompany(domain: string) {
  const res = await fetch(`${API}/screener/company?company_domain=${encodeURIComponent(domain)}`, { headers });
  if (!res.ok) throw new Error(`company enrich failed: HTTP ${res.status}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

async function fetchPeople(domain: string) {
  const body = JSON.stringify({
    filters: [
      { filter_type: "CURRENT_COMPANY", type: "in", value: [domain] },
      { filter_type: "CURRENT_TITLE", type: "in", value: ["product manager", "product lead", "engineering manager", "design lead"] },
    ],
    page: 1,
  });
  const res = await fetch(`${API}/screener/person/search`, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`person search failed: HTTP ${res.status}`);
  const data = await res.json();
  return { total: data.total_display_count, profiles: (data.profiles || []).slice(0, 5) };
}

// --- mapping: Crustdata -> access graph ----------------------------------------

function slugName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "_").slice(0, 30) || "person";
}

function guessDept(title: string): string {
  const t = title.toLowerCase();
  if (/design/.test(t)) return "Design";
  if (/engineer/.test(t)) return "Engineering";
  if (/market/.test(t)) return "Marketing";
  return "Product";
}

function mapPeople(profiles: any[], domain: string): Person[] {
  const people: Person[] = profiles.map((p: any, i: number) => {
    const name = p.name || `Person ${i + 1}`;
    const id = slugName(name);
    return {
      id,
      name,
      handle: id,
      role: p.default_position_title || "Team member",
      // synthesized — real contact data never enters the graph
      email: `${id.replace(/_/g, ".")}@${domain.replace(/\./g, "-")}.demo`,
      department: guessDept(p.default_position_title || ""),
      manager: null,
    };
  });
  // simple org: first person manages the rest (enough for approver resolution)
  for (let i = 1; i < people.length; i++) people[i].manager = people[0].id;
  return people;
}

// --- main ----------------------------------------------------------------------

console.log(`\nFetching REAL data for ${DOMAIN} from Crustdata...`);
const company = await fetchCompany(DOMAIN);
const { total, profiles } = await fetchPeople(DOMAIN);
console.log(`  company: ${company.company_name} (${company.headquarters}, ${company.employee_count_range} employees)`);
console.log(`  people:  ${total} product-role matches, using first ${profiles.length}\n`);

const realPeople = mapPeople(profiles, DOMAIN);

// swap the fictional Northwind people for REAL employees; keep resources+policies
const base = loadGraph();
const owners = realPeople.map((p) => p.id);
const graph: Graph = {
  people: realPeople,
  projects: base.projects.map((pr) => ({ ...pr, lead: owners[0], members: owners })),
  resources: base.resources.map((r, i) => ({
    ...r,
    owner: owners[i % owners.length],
    current_access: [{ person: owners[i % owners.length], level: "owner" }],
  })),
  policies: base.policies,
};

// the SAME skill, now on real org data — last fetched person is the assignee
const assignee = realPeople[realPeople.length - 1];
const pkg = resolveAccess(
  { assignee: assignee.id, project: "phoenix", intent: "continue_progress", keywords: ["product", "progress"] },
  graph
);

console.log(`  assignee: ${assignee.name} (${assignee.role})`);
console.log(`  result:   ${pkg.summary!.resources_found} resources, ${pkg.summary!.missing} missing -> ${pkg.next_action}\n`);

// --- deliverables ---------------------------------------------------------------

writeFileSync(
  join(root, "data", "crustdata_demo.json"),
  JSON.stringify({ source: "crustdata", domain: DOMAIN, company: {
    name: company.company_name, headquarters: company.headquarters,
    employee_count_range: company.employee_count_range, year_founded: company.year_founded,
    linkedin: company.linkedin_profile_url,
  }, people_matched_total: total, graph, access_package: pkg }, null, 2)
);

const md = `# Crustdata real-data demo — deliverable

**Claim:** AccessGraph's G-Brain layer is not a hand-written mock. The people
graph can be built from a live enrichment API and the same skill resolves
access on it unchanged.

## Real company (Crustdata API, live)

| field | value |
|---|---|
| Company | ${company.company_name} |
| HQ | ${company.headquarters} |
| Employees | ${company.employee_count_range} |
| Founded | ${String(company.year_founded).slice(0, 4)} |
| Product-role matches | **${total} real people** (via person search) |

## Real employees mapped into the access graph (top ${realPeople.length})

| person | title | dept (derived) |
|---|---|---|
${realPeople.map((p) => `| ${p.name} | ${p.role} | ${p.department} |`).join("\n")}

Emails are synthesized placeholders — public profile fields only, no real
contact data enters the brain (same metadata-only principle as the doc catalog).

## Same skill, real org

Task: *"Help ${assignee.name} continue the product progress"* →
**${pkg.summary!.resources_found} resources found, ${pkg.summary!.missing} missing, next_action: ${pkg.next_action}**

\`\`\`json
${JSON.stringify({ task: pkg.task, summary: pkg.summary, first_line: pkg.required_access[0] }, null, 2)}
\`\`\`

Full output: \`data/crustdata_demo.json\`. Reproduce: \`node scripts/crustdata_demo.ts ${DOMAIN}\`
(requires CRUSTDATA_API_KEY in .env).
`;
writeFileSync(join(root, "docs", "crustdata_demo.md"), md);

const companyPage = `---
type: company
id: crustdata-${slugName(company.company_name)}
title: ${JSON.stringify(company.company_name + " (Crustdata live)")}
source: crustdata
domain: ${DOMAIN}
---

# ${company.company_name} — live enrichment

${company.company_name}, HQ ${company.headquarters}, ${company.employee_count_range} employees, founded ${String(company.year_founded).slice(0, 4)}. ${total} product-role employees matched via Crustdata person search. The AccessGraph people layer for this company can be generated automatically — see scripts/crustdata_demo.ts.
`;
writeFileSync(join(root, "gbrain_pages", "crustdata-company.md"), companyPage);

console.log("  wrote data/crustdata_demo.json, docs/crustdata_demo.md, gbrain_pages/crustdata-company.md");
