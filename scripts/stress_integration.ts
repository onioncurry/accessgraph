// AccessBot — INTEGRATION stress suite: Person 1 (UI) + Person 2 (parser/skill)
// + cross-layer contract drift. Complements stress_test.ts (P3 core) and
// stress_max.ts (P3 adversarial).
//   node scripts/stress_integration.ts

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph, resolveAccess } from "../lib/mockAccess.ts";
import { parseTask, isTriggered, stripMention } from "../lib/parseTask.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const graph = loadGraph();

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

// ---------------------------------------------------------------------------
section("P2-A PARSER ACCURACY — labeled JA/EN task messages", 25);
{
  const cases: Array<{ text: string; dm?: string; assignee?: string; intent: string; project?: string }> = [
    { text: "Help Rei continue the product progress and share the docs she needs.", assignee: "rei_kawaji", intent: "continue_progress", project: "phoenix" },
    { text: "Reiにプロダクトの進捗を進めてもらいたい。必要そうな資料も共有しておいて。", assignee: "rei_kawaji", intent: "continue_progress", project: "phoenix" },
    { text: "プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？", dm: "Rei_Kawaji", assignee: "rei_kawaji", intent: "continue_progress", project: "phoenix" },
    { text: "この件をお願いしたいんだけど頼めるかな？ @AccessBot", dm: "Rei_Kawaji", assignee: "rei_kawaji", intent: "continue_progress" }, // ← the P1 demo message
    { text: "Can you help Rei move the product launch forward?", assignee: "rei_kawaji", intent: "continue_progress" },
    { text: "Can Rei take this task over? Product progress is stuck.", assignee: "rei_kawaji", intent: "continue_progress" }, // 3rd-person handoff (found by real-data run)
    { text: "Rei, can you review where Project Phoenix stands before Thursday?", assignee: "rei_kawaji", intent: "review", project: "phoenix" },
    { text: "レビューお願いします。オンボーディングのデザイン見ておいて。", dm: "koichi_ikeno", assignee: "koichi_ikeno", intent: "review" },
    { text: "PROD-1327のバグ、原因を調査してもらえる？", dm: "mitsuhiro_suzuki", assignee: "mitsuhiro_suzuki", intent: "investigate" },
    { text: "Please update the Q2 roadmap numbers before the board meeting", dm: "Rei_Kawaji", assignee: "rei_kawaji", intent: "update" },
    { text: "@AccessBot help Rei_Kawaji with the onboarding design", assignee: "rei_kawaji", intent: "read" },
    { text: "Mitsuhiro should investigate the onboarding drop-off bug", assignee: "mitsuhiro_suzuki", intent: "investigate" },
    { text: "hey!! 🔥🔥 Rei プロダクト進捗まわり\nよろしく進めてもらいたい🙏", assignee: "rei_kawaji", intent: "continue_progress", project: "phoenix" },
    { text: "totally unrelated gibberish zzz", intent: "read" },
    { text: "営業のパイプライン、数字を更新しておいて", dm: "ayumu_kobayashi", assignee: "ayumu_kobayashi", intent: "update", project: "sales" },
  ];
  for (const c of cases) {
    check(`parse: "${c.text.slice(0, 44)}${c.text.length > 44 ? "…" : ""}"`, () => {
      const p = parseTask(c.text, graph, c.dm ? { dm_other: c.dm } : {});
      if (c.assignee) {
        const resolved = p.assignee ? p.assignee.toLowerCase() : "";
        assert(resolved === c.assignee || resolved === c.assignee.replace("_kawaji", "_kawaji"), `assignee='${p.assignee}' want '${c.assignee}'`);
        assert(String(p.assignee).toLowerCase().includes(c.assignee.split("_")[0]), `assignee mismatch: ${p.assignee}`);
      } else {
        assert(!p.assignee, `phantom assignee '${p.assignee}'`);
      }
      assert(p.intent === c.intent, `intent='${p.intent}' want '${c.intent}'`);
      if (c.project) assert(p.project === c.project, `project='${p.project}' want '${c.project}'`);
    });
  }
}

// ---------------------------------------------------------------------------
section("P2-M MENTION TRIGGER — bot activates ONLY when mentioned", 10);
{
  check("M1 @AccessBot / @AccessBot / <@U123> all trigger; plain text does NOT", () => {
    assert(isTriggered("@AccessBot help Rei"), "@AccessBot missed");
    assert(isTriggered("please @accessgraph this task"), "@accessgraph missed");
    assert(isTriggered("hey <@U0AGENT123> take a look"), "Slack-style <@id> missed");
    assert(!isTriggered("Can you take this task over?"), "triggered without mention");
    assert(!isTriggered("we discussed accessbot yesterday"), "bare word triggered");
  });
  check("M2 mention is stripped before parsing (never pollutes assignee/keywords)", () => {
    const p = parseTask("@AccessBot Can you take this task over?", loadGraph(), { dm_other: "Rei_Kawaji" });
    assert(p.assignee === "Rei_Kawaji", `assignee=${p.assignee}`);
    assert(p.intent === "continue_progress", `intent=${p.intent}`);
    assert(!/accessbot/i.test(p.raw_text || ""), "mention leaked into raw_text");
    assert(stripMention("<@U123ABC> fix the bug") === "fix the bug", "strip failed");
  });
  check("M3 mention-mid-sentence and JA message with mention both parse correctly", () => {
    const p = parseTask("Reiに @AccessBot プロダクトの進捗を進めてもらいたい", loadGraph());
    assert(String(p.assignee).toLowerCase().includes("rei"), `assignee=${p.assignee}`);
    assert(p.intent === "continue_progress" && p.project === "phoenix", `${p.intent}/${p.project}`);
  });
}

// ---------------------------------------------------------------------------
section("P2-B SKILL E2E — CLI subprocess as agents would call it", 15);
{
  const run = (args: string[]) => execFileSync("node", ["scripts/query.ts", ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
  check("CLI raw JA text -> valid AccessPackage (5/5, editor on Q2)", () => {
    const out = JSON.parse(run(["--json", "--dm", "Rei_Kawaji", "プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？"]));
    assert(out.summary.resources_found === 5 && out.summary.missing === 5, JSON.stringify(out.summary));
    const q2 = out.required_access.find((l: any) => l.resource_id === "q2-roadmap-milestones");
    assert(q2.recommended_permission === "editor", `q2=${q2.recommended_permission}`);
  });
  check("CLI P1-demo message -> write-intent card (not all-viewer)", () => {
    const out = JSON.parse(run(["--json", "--dm", "Rei_Kawaji", "この件をお願いしたいんだけど頼めるかな？ @AccessBot"]));
    assert(out.task.intent === "continue_progress", `intent=${out.task.intent}`);
  });
  check("CLI --example + --input paths still work", () => {
    const a = JSON.parse(run(["--json", "--example", "confidential-blocked"]));
    assert(a.summary.blocked === 1, "blocked example broken");
    const b = JSON.parse(run(["--json", "--input", '{"assignee":"Rei_Kawaji","project":"Product","intent":"continue_product_progress"}']));
    assert(b.task.project === "Project Phoenix", "alias input broken");
  });
  check("CLI malformed --input fails gracefully (exit!=0, no stack dump)", () => {
    let failed = false, out = "";
    try { run(["--json", "--input", "{not json"]); } catch (e: any) { failed = true; out = String(e.stderr || ""); }
    assert(failed, "accepted garbage JSON");
    assert(!/at .*\.ts:\d+/.test(out), "raw stack trace leaked to user");
  });
}

// ---------------------------------------------------------------------------
section("P1 UI CONTRACT — demo/slack-demo.html static verification", 20);
{
  const htmlPath = join(root, "demo", "slack-demo.html");
  const html = readFileSync(htmlPath, "utf8");
  const golden = JSON.parse(readFileSync(join(root, "contract", "sample_response.json"), "utf8"));

  check("U1 DEFAULT_CONFIG levels EXACTLY match the golden AccessPackage", () => {
    const m = html.match(/const DEFAULT_CONFIG = \{[\s\S]*?\n  \};/);
    assert(m, "DEFAULT_CONFIG not found");
    const files: Array<{ name: string; level: string }> = [];
    const re = /name:'([^']+)',\s*src:'[^']+',\s*level:'([^']+)'/g;
    let mm; while ((mm = re.exec(m[0]))) files.push({ name: mm[1], level: mm[2] });
    assert(files.length === 5, `expected 5 demo files, found ${files.length}`);
    for (const l of golden.required_access) {
      const f = files.find((x) => x.name === l.resource);
      assert(f, `UI missing resource '${l.resource}'`);
      assert(f!.level.toLowerCase() === l.recommended_permission.toLowerCase(), `'${l.resource}': UI=${f!.level} vs engine=${l.recommended_permission}`);
    }
  });
  check("U2 level dropdown includes Contributor (Jira) and all engine levels", () => {
    assert(/LEVELS = \['Editor','Contributor','Viewer','Member'\]/.test(html), "LEVELS list drifted");
  });
  check("U3 all user-controlled sinks go through esc()/attr() (XSS hygiene)", () => {
    assert(/esc\(text\)/.test(html) && /esc\(f\.name\)/.test(html) && /esc\(config\.receiver\)/.test(html), "unescaped sink");
    assert(/attr\(f\.name\)/.test(html) || /attr\(f\.name\)|value="'\+attr/.test(html), "setup inputs unescaped");
  });
  check("U4 self-contained: no external scripts/styles/images", () => {
    assert(!/src=["']https?:\/\//.test(html) && !/href=["']https?:\/\//.test(html) && !/@import/.test(html), "external resource reference");
  });
  check("U5 every onclick handler is defined in the script", () => {
    const handlers = [...html.matchAll(/onclick="(\w+)\(/g)].map((m) => m[1]);
    const defined = new Set([...html.matchAll(/function (\w+)\(/g)].map((m) => m[1]));
    for (const h of new Set(handlers)) assert(defined.has(h), `onclick '${h}' undefined`);
  });
  check("U6 demo names match the graph (sender/receiver exist in people.json)", () => {
    assert(html.includes("'shota_gushima'") && html.includes("'Rei_Kawaji'"), "names drifted from graph");
  });
  check("U7 manual-add catalog = REAL non-confidential files only, in sync with resources.json", () => {
    const m = html.match(/const FILE_CATALOG = (\[.*?\]);/s);
    assert(m, "FILE_CATALOG not found");
    const catalog: Array<{ title: string }> = JSON.parse(m![1]);
    const resources = JSON.parse(readFileSync(join(root, "data", "resources.json"), "utf8")).resources;
    const real = resources.filter((r: any) => r.sensitivity !== "confidential").map((r: any) => r.title);
    const confidential = resources.filter((r: any) => r.sensitivity === "confidential").map((r: any) => r.title);
    for (const c of catalog) assert(real.includes(c.title), `catalog offers non-real/unknown file '${c.title}'`);
    for (const t of real) assert(catalog.some((c) => c.title === t), `catalog missing real file '${t}' — regen FILE_CATALOG`);
    for (const t of confidential) assert(!catalog.some((c) => c.title === t), `CONFIDENTIAL '${t}' leaked into manual-add`);
    assert(!/id="addName"/.test(html), "free-text file input still present — non-real files can be invented");
  });
}

// ---------------------------------------------------------------------------
section("X CROSS-LAYER DRIFT — docs/contract/data must agree", 15);
{
  check("D1 golden sample_response.json regenerates byte-equal from sample_query.json", () => {
    const q = JSON.parse(readFileSync(join(root, "contract", "sample_query.json"), "utf8"));
    const fresh = resolveAccess(q, loadGraph());
    const golden = JSON.parse(readFileSync(join(root, "contract", "sample_response.json"), "utf8"));
    assert(JSON.stringify(fresh) === JSON.stringify(golden), "golden is stale — regenerate contract/sample_response.json");
  });
  check("D2 task_examples hero expectations hold against live engine", () => {
    const ex = JSON.parse(readFileSync(join(root, "data", "task_examples.json"), "utf8")).examples;
    const hero = ex.find((e: any) => e.id === "hero");
    const p = resolveAccess(hero.expected_parse, loadGraph());
    assert(JSON.stringify(p.summary) === JSON.stringify(hero.expected_summary), `summary drift: ${JSON.stringify(p.summary)}`);
    for (const [id, perm] of Object.entries(hero.expected_permissions))
      assert(p.required_access.find((l) => l.resource_id === id)?.recommended_permission === perm, `${id} drifted`);
  });
  check("D3 SKILL.md documents every next_action + status value", () => {
    const skill = readFileSync(join(root, "skills", "task_access_assistant", "SKILL.md"), "utf8");
    for (const v of ["prepare_access_request", "no_action_needed", "clarify_assignee", "clarify_task"]) assert(skill.includes(v), `SKILL.md missing next_action '${v}'`);
    for (const v of ["missing", "has_access", "blocked"]) assert(skill.includes(v), `SKILL.md missing status '${v}'`);
  });
  check("D4 gbrain_pages/_manifest.json entries all exist on disk", () => {
    const manifest = JSON.parse(readFileSync(join(root, "gbrain_pages", "_manifest.json"), "utf8"));
    assert(manifest.length >= 20, "manifest suspiciously small");
    for (const { file } of manifest) assert(existsSync(join(root, file)), `missing ${file}`);
  });
  check("D5 SETUP.md references only files that exist", () => {
    const setup = readFileSync(join(root, "docs", "SETUP.md"), "utf8");
    for (const f of ["lib/mockAccess.ts", "lib/parseTask.ts", "contract/sample_response.json", "docs/access_query_contract.md", "data/crustdata_demo.json", "scripts/seed_gbrain.ts"])
      assert(setup.includes(f) ? existsSync(join(root, f)) : true, `SETUP references missing ${f}`);
  });
}

// ---------------------------------------------------------------------------
console.log("\n==================== INTEGRATION SCORE ====================");
let totalWeight = 0, weighted = 0;
for (const s of sections) {
  const rate = s.total ? s.pass / s.total : 0;
  totalWeight += s.weight; weighted += s.weight * rate;
  console.log(`  ${rate === 1 ? "✅" : "❌"} ${s.name.split(" — ")[0].padEnd(22)} ${s.pass}/${s.total}  -> ${(s.weight * rate).toFixed(1)}/${s.weight}`);
}
const score = (weighted / totalWeight) * 100;
console.log(`\n  INTEGRATION TOTAL: ${score.toFixed(1)} / 100`);
const failed = sections.filter((s) => s.pass < s.total);
if (failed.length) {
  console.log("\n  FINDINGS:");
  for (const s of failed) for (const n of s.notes) console.log(`   - [${s.name.split(" ")[0]}] ${n}`);
  process.exit(1);
}
