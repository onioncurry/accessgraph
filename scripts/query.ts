// AccessBot — CLI demo harness (Person 3)
//
//   node scripts/query.ts                          # hero task from task_examples.json
//   node scripts/query.ts "Help Rei continue the product progress"   # RAW TEXT (design-doc pipeline)
//   node scripts/query.ts --dm Rei_Kawaji "Can you take this task over?"   # DM context (JA input also supported)
//   node scripts/query.ts --example review-only    # run a named golden example
//   node scripts/query.ts --input '{"assignee":"Rei_Kawaji","project":"phoenix","intent":"continue_progress"}'
//   node scripts/query.ts --json ...               # raw AccessPackage JSON only
//
// Requires Node >= 23.6 (native TypeScript type stripping). Node 24 OK.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph, resolveAccess } from "../lib/mockAccess.ts";
import { parseTask } from "../lib/parseTask.ts";
import type { AccessPackage, TaskInput } from "../lib/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examples = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "task_examples.json"), "utf8")
).examples;

function printCard(pkg: AccessPackage): void {
  if (pkg.error) {
    console.log(`\n  !  ${pkg.error}\n`);
    return;
  }
  const t = pkg.task;
  const s = pkg.summary!;
  console.log(`\n  AccessBot — ${t.assignee} · ${t.project || "no project"} · intent: ${t.intent}`);
  console.log(`  Found ${s.resources_found} resources · ${s.missing} missing · ${s.already_has} already · ${s.blocked} blocked\n`);

  const icon: Record<string, string> = { missing: "[x]", has_access: "[v]", blocked: "[!]" };
  for (const l of pkg.required_access) {
    console.log(`  ${icon[l.status] || " • "} ${l.resource}  [${l.system}]`);
    console.log(`       owner: ${l.owner}   status: ${l.status}`);
    if (l.status === "missing") {
      const dur = l.duration && l.duration !== "none" ? `, ${l.duration}` : "";
      console.log(`       -> grant ${l.recommended_permission}${dur} · approver: ${l.approver}`);
    } else if (l.status === "has_access") {
      console.log(`       -> already has ${l.current_permission}`);
    } else {
      console.log(`       -> ${l.reason}`);
    }
    console.log("");
  }
  console.log(`  next_action: ${pkg.next_action}\n`);
}

// --- main ---------------------------------------------------------------------

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const inputIdx = args.indexOf("--input");
const exampleIdx = args.indexOf("--example");
const dmIdx = args.indexOf("--dm");

const graph = loadGraph();

// positional (non-flag) args are treated as a raw task sentence
const flagValueIdxs = new Set([inputIdx + 1, exampleIdx + 1, dmIdx + 1].filter((i) => i > 0));
const rawText = args
  .filter((a, i) => !a.startsWith("--") && !flagValueIdxs.has(i))
  .join(" ")
  .trim();

let input: TaskInput;
if (inputIdx !== -1) {
  try {
    input = JSON.parse(args[inputIdx + 1]);
  } catch {
    console.error("--input is not valid JSON");
    process.exit(1);
  }
} else if (rawText) {
  // design-doc pipeline: raw Slack/Teams sentence -> parser -> resolver
  input = parseTask(rawText, graph, dmIdx !== -1 ? { dm_other: args[dmIdx + 1] } : {});
  if (!jsonOnly) console.log(`\n  parsed: ${JSON.stringify({ ...input, raw_text: undefined })}`);
} else {
  const id = exampleIdx !== -1 ? args[exampleIdx + 1] : "hero";
  const ex = examples.find((e: { id: string }) => e.id === id);
  if (!ex) {
    console.error(`Unknown example '${id}'. Available: ${examples.map((e: { id: string }) => e.id).join(", ")}`);
    process.exit(1);
  }
  input = ex.expected_parse;
}

const pkg = resolveAccess(input, graph);

if (jsonOnly) {
  console.log(JSON.stringify(pkg, null, 2));
} else {
  printCard(pkg);
  console.log("  --- AccessPackage JSON (for agents / the Slack card) ---");
  console.log(JSON.stringify(pkg, null, 2));
}
