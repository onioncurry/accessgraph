// AccessGraph — register a finished document into the G-Brain catalog (Person 3)
//
//   node scripts/register_doc.ts --title "Phoenix Launch Checklist" \
//     --system "Google Docs" --owner shota_gushima --project phoenix \
//     --summary "Go/no-go checklist for the Phoenix launch" \
//     --keywords launch,checklist,release
//     [--category spec] [--shared-with rei_kawaji:viewer,jiayi_li:editor]
//     [--commit]        # actually append to data/resources.json + gbrain_pages/
//
// Default is DRY-RUN: prints the resource JSON + the catalog page.
// Metadata + summary only — document content never enters the brain.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "../lib/mockAccess.ts";
import { registerDocument, type DocRegistration } from "../lib/registerDoc.ts";
import type { AccessEntry, Category } from "../lib/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const title = flag("title");
if (!title) {
  console.error("--title is required");
  process.exit(1);
}

const sharedWith: AccessEntry[] = (flag("shared-with") || "")
  .split(",")
  .filter(Boolean)
  .map((pair) => {
    const [person, level] = pair.split(":");
    return { person: person.trim(), level: (level || "viewer").trim() };
  });

const input: DocRegistration = {
  title,
  system: flag("system") || "Google Docs",
  owner: flag("owner") || "",
  project: flag("project") || "",
  summary: flag("summary"),
  keywords: (flag("keywords") || "").split(",").map((k) => k.trim()).filter(Boolean),
  category: flag("category") as Category | undefined,
  shared_with: sharedWith,
};

const graph = loadGraph();
const { resource, page, category } = registerDocument(input, graph);

console.log(`\n  registered: "${resource.title}"`);
console.log(`  category:   ${category} × ${resource.project}  (auto-classified${input.category ? " — overridden by flag" : ""})`);
console.log(`  sharing:    ${resource.current_access.length > 1 ? resource.current_access.map((a) => `${a.person}(${a.level})`).join(", ") : "NOT shared — owner only"}`);
console.log(`  slug:       resource/${resource.id}\n`);
console.log("--- catalog page (metadata only) ---\n");
console.log(page);
console.log("--- resource JSON ---\n");
console.log(JSON.stringify(resource, null, 2));

if (args.includes("--commit")) {
  const dataPath = join(root, "data", "resources.json");
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  if (data.resources.some((r: { id: string }) => r.id === resource.id)) {
    console.error(`\nNOT committed: resource id '${resource.id}' already exists.`);
    process.exit(1);
  }
  data.resources.push(resource);
  writeFileSync(dataPath, JSON.stringify(data, null, 2));
  writeFileSync(join(root, "gbrain_pages", `${resource.id}.md`), page);
  console.log(`\ncommitted: data/resources.json + gbrain_pages/${resource.id}.md`);
  console.log("re-run scripts/seed_gbrain.ts to refresh category indexes, then load into the brain.");
} else {
  console.log("\n(dry-run — add --commit to write data/resources.json + gbrain_pages/)");
}
