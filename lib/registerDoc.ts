// AccessBot — document registration (Person 3)
//
// When a document is FINISHED, it gets registered into the G-Brain catalog —
// regardless of whether it has been shared. Two axes: category (type) ×
// project. Only METADATA + a one-line summary enter the brain, never the
// content: everyone can discover that a document exists; reading it still
// requires access, which AccessBot then resolves as a least-privilege request.
//
//   registerDocument(input, graph)  -> { resource, page, category }
//   classifyCategory(input)         -> auto category (explicit input wins)

import type { AccessEntry, Category, Graph, Resource } from "./types.ts";

export interface DocRegistration {
  title: string;
  system: string; // "Google Docs" | "Figma" | "Jira" | ...
  owner: string; // person id/handle/name
  project: string; // project id/name/alias
  summary?: string;
  keywords?: string[];
  /** explicit category overrides auto-classification */
  category?: Category;
  sensitivity?: "internal" | "confidential";
  /** who it is ALREADY shared with (besides the owner). Empty = unshared. */
  shared_with?: AccessEntry[];
  /** override the reference/work_surface default for the category */
  intent_role?: "reference" | "work_surface";
}

// --- auto-classification (explicit input always wins) ------------------------

const SYSTEM_RULES: Array<[RegExp, Category]> = [
  [/figma|sketch|canva/i, "design"],
  [/jira|linear|asana/i, "task"],
  [/slack|teams|discord/i, "channel"],
  [/salesforce|hubspot|crm/i, "customer-data"],
];

const TITLE_RULES: Array<[RegExp, Category]> = [
  [/meeting|minutes|議事録|notes?$/i, "meeting-notes"],
  [/report|analytics|kpi|分析|レポート/i, "report"],
  [/design|mockup|wireframe|デザイン/i, "design"],
  [/spec|brief|roadmap|milestone|requirement|checklist|plan|仕様|要件/i, "spec"],
  [/customer|revenue|顧客|売上/i, "customer-data"],
];

export function classifyCategory(input: DocRegistration): Category {
  if (input.category) return input.category;
  for (const [re, cat] of SYSTEM_RULES) if (re.test(input.system)) return cat;
  const haystack = `${input.title} ${(input.keywords || []).join(" ")}`;
  for (const [re, cat] of TITLE_RULES) if (re.test(haystack)) return cat;
  return "spec"; // safe default for finished documents
}

// per-category access defaults (policies stay the source of truth for levels)
const CATEGORY_DEFAULTS: Record<Category, { resource_type: string; intent_role: "reference" | "work_surface"; default_permission: string; icon: string }> = {
  "spec": { resource_type: "product_doc", intent_role: "reference", default_permission: "viewer", icon: "gdocs" },
  "design": { resource_type: "product_doc", intent_role: "reference", default_permission: "viewer", icon: "figma" },
  "task": { resource_type: "issue_tracker", intent_role: "work_surface", default_permission: "contributor", icon: "jira" },
  "report": { resource_type: "product_doc", intent_role: "reference", default_permission: "viewer", icon: "gdocs" },
  "meeting-notes": { resource_type: "product_doc", intent_role: "reference", default_permission: "viewer", icon: "gdocs" },
  "channel": { resource_type: "channel", intent_role: "reference", default_permission: "member", icon: "teams" },
  "customer-data": { resource_type: "customer_data", intent_role: "reference", default_permission: "viewer", icon: "salesforce" },
};

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48) || `doc-${Date.now()}`;
}

// --- registration -------------------------------------------------------------

export function registerDocument(
  input: DocRegistration,
  graph: Graph
): { resource: Resource; page: string; category: Category } {
  const category = classifyCategory(input);
  const d = CATEGORY_DEFAULTS[category];

  const owner = graph.people.find(
    (p) =>
      p.id === input.owner ||
      p.handle.toLowerCase() === String(input.owner).toLowerCase() ||
      p.name.toLowerCase() === String(input.owner).toLowerCase()
  );
  if (!owner) throw new Error(`register: unknown owner '${input.owner}'`);

  const project = graph.projects.find(
    (p) => p.id === input.project || p.name.toLowerCase() === String(input.project).toLowerCase() ||
      (p.aliases || []).some((a) => a.toLowerCase() === String(input.project).toLowerCase())
  );
  if (!project) throw new Error(`register: unknown project '${input.project}'`);

  const sensitivity = input.sensitivity || (category === "customer-data" ? "confidential" : "internal");

  const resource: Resource = {
    id: slugify(input.title),
    title: input.title,
    system: input.system,
    icon: d.icon,
    owner: owner.id,
    project: project.id,
    category,
    summary: input.summary || "",
    sensitivity,
    resource_type: d.resource_type,
    intent_role: input.intent_role || d.intent_role,
    keywords: input.keywords || [],
    default_permission: d.default_permission,
    // sharing status is recorded as-is; unshared = owner only. Registration
    // NEVER widens access — it only makes existence discoverable.
    current_access: [{ person: owner.id, level: "owner" }, ...(input.shared_with || [])],
  };

  return { resource, page: buildCatalogPage(resource, graph), category };
}

// --- catalog page (METADATA ONLY — the guarantee lives here) -------------------

export function buildCatalogPage(r: Resource, graph: Graph): string {
  const personName = (id: string) => graph.people.find((p) => p.id === id)?.name || id;
  const projectName = graph.projects.find((p) => p.id === r.project)?.name || r.project;
  const access = r.current_access.map((a) => `${personName(a.person)} (${a.level})`).join(", ");
  const shared = r.current_access.length > 1;

  const fm = [
    "---",
    `type: resource`,
    `id: ${r.id}`,
    `title: ${JSON.stringify(r.title)}`,
    `system: ${r.system}`,
    `owner: ${r.owner}`,
    `project: ${r.project}`,
    `category: ${r.category}`,
    `sensitivity: ${r.sensitivity}`,
    `resource_type: ${r.resource_type}`,
    `intent_role: ${r.intent_role}`,
    `default_permission: ${r.default_permission}`,
    `keywords: ${JSON.stringify(r.keywords)}`,
    `content_registered: metadata_only`,
    "---",
  ].join("\n");

  return (
    fm +
    `\n\n# ${r.title}\n\n` +
    `[catalog: ${r.category} × ${projectName} — metadata only, content NOT stored] ` +
    `${r.title} is a ${r.sensitivity} ${r.system} ${r.category} document in ${projectName}, owned by ${personName(r.owner)}. ` +
    (r.summary ? `Summary: ${r.summary} ` : "") +
    (r.keywords.length ? `Topics: ${r.keywords.join(", ")}. ` : "") +
    (shared ? `Current access: ${access}.` : `NOT SHARED yet — access: owner only (${personName(r.owner)}). Request access via task_access_assistant.`) +
    "\n"
  );
}
