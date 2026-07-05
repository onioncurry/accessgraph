// AccessGraph — MAXIMUM-intensity stress suite with scoring (Person 3)
//   node scripts/stress_max.ts
//
// Goes beyond scripts/stress_test.ts: seeded fuzzing, permutation determinism,
// unicode torture, injection sinks, exhaustive privilege/confidential grids,
// 20k-resource scale, prototype pollution. Prints a scored report card.

import { loadGraph, resolveAccess } from "../lib/mockAccess.ts";
import { parseTask } from "../lib/parseTask.ts";
import type { Graph, TaskInput, AccessPackage } from "../lib/types.ts";

const base = loadGraph();
const clone = (): Graph => structuredClone(base);
const line = (p: AccessPackage, id: string) => p.required_access.find((l) => l.resource_id === id);

// seeded PRNG (mulberry32) — reproducible "randomness"
function rng(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260705);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// scoring
interface Section { name: string; weight: number; pass: number; total: number; notes: string[] }
const sections: Section[] = [];
let cur: Section;
function section(name: string, weight: number) { cur = { name, weight, pass: 0, total: 0, notes: [] }; sections.push(cur); console.log(`\n== ${name} (weight ${weight}) ==`); }
function check(name: string, fn: () => void) {
  cur.total++;
  try { fn(); cur.pass++; console.log(`  PASS  ${name}`); }
  catch (e: any) { cur.notes.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}\n        -> ${e.message}`); }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

const VALID_PERMS = new Set(["viewer", "editor", "contributor", "member", "read", "write", "owner"]);
const rankOf: Record<string, number> = { viewer: 1, read: 1, member: 1, contributor: 2, editor: 2, write: 2, owner: 3 };

function contractInvariants(p: AccessPackage, label: string) {
  if (p.error) { assert(p.required_access.length === 0, `${label}: error but has lines`); return; }
  const s = p.summary!;
  assert(s.missing + s.already_has + s.blocked === s.resources_found, `${label}: counts drift`);
  assert(["prepare_access_request", "no_action_needed", "clarify_assignee", "clarify_task"].includes(p.next_action), `${label}: bad next_action`);
  for (const l of p.required_access) {
    assert(VALID_PERMS.has(l.recommended_permission), `${label}/${l.resource_id}: perm '${l.recommended_permission}'`);
    assert(l.reason && l.reason.length > 0, `${label}/${l.resource_id}: no reason`);
    if (l.status === "missing") assert(l.approver && l.request_message && l.duration, `${label}/${l.resource_id}: incomplete missing line`);
    if (l.status === "blocked") assert(!l.request_message, `${label}/${l.resource_id}: blocked has request_message`);
    if (l.status === "has_access") assert(!l.approver && !l.approval_required, `${label}/${l.resource_id}: has_access with approval fields`);
  }
  const rt = JSON.parse(JSON.stringify(p));
  assert(rt.required_access.length === p.required_access.length, `${label}: JSON round-trip loss`);
}

// ---------------------------------------------------------------------------
section("S1 FUZZ STORM — 500 seeded random inputs, invariants must hold", 15);
{
  const vocabAssignee = ["Rei_Kawaji", "rei", "shota_gushima", "jiayi_li", "REI", "ghost", "李", "🔥", "", "  ", "a", "Rei Kawaji", "rei.kawaji@northwind.ai", "'; DROP TABLE--", "％＄", "Ｒｅｉ"];
  const vocabProject = [undefined, "phoenix", "Product", "sales", "atlantis", "プロダクト", "PHOENIX", "🚀"];
  const vocabIntent = [undefined, "read", "review", "update", "continue_progress", "continue_product_progress", "DELETE", "42", "レビュー", "progress_review"];
  const vocabKw = ["progress", "roadmap", "customer", "crm", "launch", "onboarding", "ゴミ", "<script>", "revenue", "design", "zzz"];
  const vocabText = ["Help Rei continue the product progress", "プロダクトの進捗を進めてもらいたい", "asdf jkl;", "🔥".repeat(50), "SELECT * FROM users;", "", "レビューお願い", "move launch forward ".repeat(30)];
  let crashes = 0, bad = 0;
  for (let i = 0; i < 500; i++) {
    const input: TaskInput = {
      assignee: pick(vocabAssignee),
      project: pick(vocabProject),
      intent: pick(vocabIntent) as any,
      keywords: Array.from({ length: Math.floor(rand() * 4) }, () => pick(vocabKw)),
      raw_text: pick(vocabText),
    };
    try { contractInvariants(resolveAccess(input, clone()), `fuzz#${i}`); }
    catch (e: any) { if (/drift|bad next_action|perm|incomplete|blocked has|round-trip|has_access with/.test(e.message)) bad++; else crashes++; }
  }
  check("F1 zero crashes across 500 random inputs", () => assert(crashes === 0, `${crashes} crashes`));
  check("F2 zero contract violations across 500 random inputs", () => assert(bad === 0, `${bad} violations`));
  let parserCrash = 0;
  for (let i = 0; i < 100; i++) {
    try { parseTask(pick(vocabText) + pick(vocabKw) + pick(vocabAssignee), clone(), rand() > 0.5 ? { dm_other: pick(vocabAssignee) } : {}); }
    catch { parserCrash++; }
  }
  check("F3 parser survives 100 garbage messages", () => assert(parserCrash === 0, `${parserCrash} parser crashes`));
}

// ---------------------------------------------------------------------------
section("S2 DETERMINISM — permutation invariance & repeatability", 10);
{
  const hero: TaskInput = { assignee: "Rei_Kawaji", project: "phoenix", intent: "continue_progress", keywords: ["product", "progress"] };
  const baseline = JSON.stringify(resolveAccess(hero, clone()));
  check("D1 shuffled resources/people/tasks arrays -> byte-identical output", () => {
    for (let i = 0; i < 10; i++) {
      const g = clone();
      g.resources = shuffle(g.resources);
      g.people = shuffle(g.people);
      g.tasks = shuffle(g.tasks || []);
      g.policies = shuffle(g.policies);
      assert(JSON.stringify(resolveAccess(hero, g)) === baseline, `permutation ${i} changed output`);
    }
  });
  check("D2 100 repeated runs -> byte-identical", () => {
    for (let i = 0; i < 100; i++) assert(JSON.stringify(resolveAccess(hero, clone())) === baseline, `run ${i} differs`);
  });
}

// ---------------------------------------------------------------------------
section("S3 UNICODE TORTURE — homoglyphs, ZWJ, RTL, fullwidth, 100KB names", 10);
{
  const evil = [
    "Rеi_Kawaji",                       // cyrillic е homoglyph
    "Re​i",                         // zero-width space
    "‮Rei‬",                   // RTL override
    "Ｒｅｉ＿Ｋａｗａｊｉ",               // fullwidth
    "Reí",                          // combining accent
    "👨‍👩‍👧‍👦".repeat(10),
    "R".repeat(100_000),
  ];
  check("U1 identity spoofing never matches a real person (fail-closed, no crash)", () => {
    for (const name of evil) {
      const p = resolveAccess({ assignee: name, project: "phoenix", intent: "continue_progress" }, clone());
      assert(p.next_action === "clarify_assignee", `'${name.slice(0, 20)}...' matched ${p.task.assignee}`);
    }
  });
  check("U2 error echo stays sanitized+bounded for all evil names", () => {
    for (const name of evil) {
      const p = resolveAccess({ assignee: name }, clone());
      assert((p.error || "").length < 120, "unbounded echo");
    }
  });
  check("U3 evil unicode in raw_text/keywords does not derail discovery", () => {
    const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "continue_progress", keywords: ["progress"], raw_text: evil.join(" ") }, clone());
    assert(p.summary!.resources_found >= 5, "discovery degraded");
  });
}

// ---------------------------------------------------------------------------
section("S4 INJECTION SINKS — outbound request_message must be inert", 15);
{
  check("N1 malicious person name in graph cannot inject into request_message", () => {
    const g = clone();
    const rei = g.people.find((p) => p.id === "rei_kawaji")!;
    rei.name = "Rei`<@everyone>`\n[click](http://evil)*_~";
    const p = resolveAccess({ assignee: "rei_kawaji", project: "phoenix", intent: "continue_progress", keywords: ["progress"] }, g);
    for (const l of p.required_access.filter((x) => x.request_message)) {
      assert(!/[`\[\]<>\n\r]/.test(l.request_message!), `injection chars leaked: ${JSON.stringify(l.request_message!.slice(0, 80))}`);
    }
  });
  check("N2 malicious approver name cannot inject either", () => {
    const g = clone();
    g.people.find((p) => p.id === "shota_gushima")!.name = "Shota\n```rm -rf```";
    const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "read", keywords: ["brief", "product"] }, g);
    for (const l of p.required_access.filter((x) => x.request_message)) {
      assert(!/[`\n\r]/.test(l.request_message!), "approver injection leaked");
    }
  });
}

// ---------------------------------------------------------------------------
section("S5 EXHAUSTIVE PRIVILEGE MATRIX — every intent × every resource", 15);
{
  const readIntents = ["read", "review", "investigate", "", "garbage", "42", "look_around"];
  const writeIntents = ["update", "continue_progress", "continue_product_progress", "edit"];
  check("P1 read-ish/unknown intents NEVER yield write on ANY resource", () => {
    for (const intent of readIntents) {
      const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: intent as any, keywords: ["progress", "customer", "crm"] }, clone());
      for (const l of p.required_access) {
        if (l.status === "has_access") continue;
        assert((rankOf[l.recommended_permission] ?? 9) <= 1, `intent='${intent}' ${l.resource_id} -> ${l.recommended_permission}`);
      }
    }
  });
  check("P2 write intents: write ONLY on work_surface, read on reference, NEVER above policy", () => {
    const g = clone();
    for (const intent of writeIntents) {
      const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: intent as any, keywords: ["progress"] }, g);
      for (const l of p.required_access) {
        if (l.status !== "missing") continue;
        const r = g.resources.find((x) => x.id === l.resource_id)!;
        const pol = g.policies.find((x) => x.resource_type === r.resource_type)!;
        const cap = rankOf[pol.write_intent_permission] ?? 2;
        assert((rankOf[l.recommended_permission] ?? 9) <= cap, `${l.resource_id} exceeds policy cap`);
        if (r.intent_role === "reference") assert((rankOf[l.recommended_permission] ?? 9) <= 1, `reference ${l.resource_id} got write on '${intent}'`);
        if (r.intent_role === "work_surface") assert(l.recommended_permission === pol.write_intent_permission, `work_surface ${l.resource_id} wrong level`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
section("S6 CONFIDENTIAL GRID — every (project × keywords × intent) combo", 15);
{
  const projects = [undefined, "phoenix", "sales", "Product"];
  const kwSets: string[][] = [[], ["customer"], ["crm", "revenue"], ["progress"], ["customer", "crm", "revenue"], ["quarterly", "revenue", "report"]];
  const intents = ["read", "update", "continue_progress", "review"];
  check("C1 customer data: never missing without sales-project+keyword evidence; NEVER writable", () => {
    for (const project of projects) for (const kws of kwSets) for (const intent of intents) {
      const p = resolveAccess({ assignee: "Rei_Kawaji", project, intent: intent as any, keywords: kws }, clone());
      const l = line(p, "customer-accounts-sfdc");
      if (!l) continue;
      const salesMatch = project === "sales";
      const kwEvidence = kws.some((k) => ["customer", "account", "revenue", "crm", "pipeline", "deal"].includes(k));
      if (l.status === "missing") {
        assert(salesMatch && kwEvidence, `UNLOCKED without evidence: project=${project} kws=[${kws}] intent=${intent}`);
        assert(l.approver === "Shota Gushima", "approver must be assignee's manager");
      }
      assert(l.recommended_permission === "viewer" || l.status === "has_access", `confidential got ${l.recommended_permission}`);
    }
  });
  check("C2 96-combo sweep: blocked lines NEVER carry a request_message", () => {
    for (const project of projects) for (const kws of kwSets) for (const intent of intents) {
      const p = resolveAccess({ assignee: "Rei_Kawaji", project, intent: intent as any, keywords: kws }, clone());
      for (const l of p.required_access.filter((x) => x.status === "blocked")) assert(!l.request_message, "blocked with request");
    }
  });
}

// ---------------------------------------------------------------------------
section("S7 SCALE & PERFORMANCE — 20k resources / 2k people / 1MB text", 10);
{
  function bigGraph(): Graph {
    const g = clone();
    for (let i = 0; i < 2000; i++) g.people.push({ id: `p${i}`, name: `Person ${i}`, handle: `p${i}`, role: "Staff", email: `p${i}@x.demo`, department: "Ops", manager: "jiayi_li" });
    for (let i = 0; i < 20000; i++) g.resources.push({
      id: `r${i}`, title: `Doc ${i}`, system: "Google Docs", icon: "gdocs", owner: `p${i % 2000}`,
      project: i % 2 ? "phoenix" : "sales", sensitivity: "internal", resource_type: "product_doc",
      intent_role: i % 3 ? "reference" : "work_surface", keywords: [`k${i % 50}`, "progress"],
      default_permission: "viewer", current_access: [{ person: `p${i % 2000}`, level: "owner" }],
      category: "spec", summary: "",
    });
    for (let i = 0; i < 1000; i++) g.tasks!.push({ id: `t${i}`, title: `progress task ${i}`, requester: "jiayi_li", assignee: `p${i % 2000}`, project: "phoenix", intent: "continue_progress", status: "done", resources_used: [`r${i % 20000}`] });
    return g;
  }
  const g = bigGraph();
  check("X1 resolve over 20k resources + 1k tasks in < 1500ms", () => {
    const t0 = process.hrtime.bigint();
    const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "continue_progress", keywords: ["progress"] }, g);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert(p.summary!.resources_found > 5000, "discovery broke at scale");
    assert(ms < 1500, `took ${ms.toFixed(0)}ms`);
    cur.notes.push(`X1: ${ms.toFixed(0)}ms for ${p.summary!.resources_found} resources`);
  });
  check("X2 1MB raw_text tokenized in < 1500ms, output intact", () => {
    const big = ("progress roadmap milestone onboarding launch ").repeat(23000); // ~1MB
    const t0 = process.hrtime.bigint();
    const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "read", raw_text: big }, clone());
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert(p.summary!.resources_found >= 5 && ms < 1500, `took ${ms.toFixed(0)}ms`);
    cur.notes.push(`X2: ${ms.toFixed(0)}ms for 1MB text`);
  });
}

// ---------------------------------------------------------------------------
section("S8 HOSTILE DATA & PROTOTYPE POLLUTION", 10);
{
  check("H1 __proto__ smuggled via JSON input does not pollute", () => {
    const input = JSON.parse('{"assignee":"Rei_Kawaji","project":"phoenix","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
    resolveAccess(input, clone());
    assert(({} as any).polluted === undefined, "prototype polluted!");
  });
  check("H2 malformed field types (keywords=object, intent=number, raw_text=number) don't crash", () => {
    const p = resolveAccess({ assignee: "Rei_Kawaji", keywords: { a: 1 } as any, intent: 42 as any, raw_text: 12345 as any, project: null as any }, clone());
    contractInvariants(p, "H2");
  });
  check("H3 graph with duplicate person ids -> first wins deterministically, no crash", () => {
    const g = clone();
    g.people.push({ ...g.people.find((p) => p.id === "rei_kawaji")!, role: "Impostor" });
    const p = resolveAccess({ assignee: "rei_kawaji" }, g);
    assert(!p.error, "dup id crashed");
  });
  check("H4 resource with empty keywords + empty current_access resolves safely", () => {
    const g = clone();
    g.resources.push({ id: "bare", title: "Bare", system: "Google Docs", icon: "gdocs", owner: "shota_gushima", project: "phoenix", sensitivity: "internal", resource_type: "product_doc", intent_role: "reference", keywords: [], default_permission: "viewer", current_access: [], category: "spec", summary: "" });
    const p = resolveAccess({ assignee: "Rei_Kawaji", project: "phoenix", intent: "read" }, g);
    const l = line(p, "bare");
    assert(l && l.status === "missing" && l.approver, "bare resource mishandled");
  });
  check("H5 shipped data deep-lint: unique ids, unique emails, valid categories", () => {
    const g = clone();
    const ids = g.people.map((p) => p.id);
    assert(new Set(ids).size === ids.length, "duplicate person ids in shipped data");
    const emails = g.people.map((p) => p.email);
    assert(new Set(emails).size === emails.length, "duplicate emails");
    const rids = g.resources.map((r) => r.id);
    assert(new Set(rids).size === rids.length, "duplicate resource ids");
    for (const r of g.resources) assert(["spec", "design", "task", "report", "meeting-notes", "channel", "customer-data"].includes(r.category!), `bad category on ${r.id}`);
  });
}

// ---------------------------------------------------------------------------
// SCORE CARD
console.log("\n==================== SCORE CARD ====================");
let totalWeight = 0, weighted = 0;
for (const s of sections) {
  const rate = s.total ? s.pass / s.total : 0;
  totalWeight += s.weight;
  weighted += s.weight * rate;
  const pts = (s.weight * rate).toFixed(1);
  console.log(`  ${rate === 1 ? "✅" : "❌"} ${s.name.split(" — ")[0].padEnd(28)} ${s.pass}/${s.total}  -> ${pts}/${s.weight}`);
  for (const n of s.notes.filter((x) => x.startsWith("X"))) console.log(`       ${n}`);
}
const score = (weighted / totalWeight) * 100;
const grade = score >= 97 ? "S" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : "F";
console.log(`\n  TOTAL: ${score.toFixed(1)} / 100   GRADE: ${grade}`);
const failed = sections.filter((s) => s.pass < s.total);
if (failed.length) {
  console.log("\n  FINDINGS:");
  for (const s of failed) for (const n of s.notes.filter((x) => !x.startsWith("X"))) console.log(`   - [${s.name.split(" ")[0]}] ${n}`);
  process.exit(1);
}
