// AccessGraph — access graph engine over the mock company data (Person 3)
//
// This is the company knowledge layer: people, resources, ownership, current
// access state, and policies — plus resolveAccess(), which turns a parsed task
// into a least-privilege AccessPackage.
//
// Person 2's skill (skills/task_access_assistant) parses the Slack/Teams
// message into a TaskInput and calls resolveAccess(). Person 1 renders the
// returned AccessPackage. Nobody else needs to know how the graph works.
//
// Deterministic by design: same input -> same output. Demo-safe.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AccessLine,
  AccessPackage,
  Graph,
  Person,
  Project,
  Policy,
  Resource,
  TaskInput,
} from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

// --- graph loading -----------------------------------------------------------

export function loadGraph(dataDir: string = DATA_DIR): Graph {
  const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
  const peopleFile = read("people.json");
  let tasks = [];
  try { tasks = read("tasks.json").tasks; } catch { /* tasks are optional */ }
  return {
    people: peopleFile.people,
    projects: peopleFile.projects,
    resources: read("resources.json").resources,
    policies: read("policies.json").policies,
    tasks,
  };
}

// --- lookups -----------------------------------------------------------------

export function findPerson(graph: Graph, ref: string | undefined | null): Person | null {
  if (!ref) return null;
  const q = String(ref).toLowerCase().trim().replace(/^@/, "");
  const exact =
    graph.people.find((p) => p.id.toLowerCase() === q) ||
    graph.people.find((p) => p.handle.toLowerCase() === q) ||
    graph.people.find((p) => p.email.toLowerCase() === q) ||
    graph.people.find((p) => p.name.toLowerCase() === q) ||
    graph.people.find((p) => p.name.toLowerCase().split(" ")[0] === q);
  if (exact) return exact;
  // Substring fallback is a footgun on short fragments ("li" -> Jiayi Li) —
  // require 3+ chars AND a unique match, otherwise force clarification.
  if (q.length < 3) return null;
  const fuzzy = graph.people.filter(
    (p) => p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
  );
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

export function findProject(graph: Graph, ref: string | undefined | null): Project | null {
  if (!ref) return null;
  const q = String(ref).toLowerCase().trim();
  return (
    graph.projects.find((p) => p.id.toLowerCase() === q) ||
    graph.projects.find((p) => p.name.toLowerCase() === q) ||
    graph.projects.find((p) => (p.aliases || []).some((a) => a.toLowerCase() === q)) ||
    graph.projects.find((p) => p.name.toLowerCase().includes(q)) ||
    null
  );
}

function policyFor(graph: Graph, resourceType: string): Policy | null {
  return graph.policies.find((p) => p.resource_type === resourceType) || null;
}

function currentLevel(resource: Resource, personId: string): string | null {
  const entry = resource.current_access.find((a) => a.person === personId);
  return entry ? entry.level : null;
}

// --- resource discovery (the "G-Brain query" step) ----------------------------
// Candidate = same project as the task OR keyword overlap with the task text.
// In production this is a semantic G-Brain query (see scripts/seed_gbrain.mjs —
// the same entities live in a real G-Brain and rank correctly for the hero task).

export function discoverResources(
  graph: Graph,
  opts: { project: Project | null; keywords?: string[]; rawText?: string; intent?: string }
): Resource[] {
  const projectId = opts.project ? opts.project.id : null;
  const hints = new Set(
    [...(opts.keywords || []), ...tokenize(opts.rawText || "")].map((k) => k.toLowerCase())
  );

  // Past-task signal: resources that SIMILAR past tasks actually used get a
  // boost. Rough linkage is enough — this only aids discovery, never grants.
  // Similarity = intent match + title-token overlap + project match; >= 2 counts.
  const boosted = new Set<string>();
  for (const t of graph.tasks || []) {
    let sim = 0;
    if (opts.intent && t.intent === String(opts.intent).toLowerCase()) sim += 1;
    if (projectId && t.project === projectId) sim += 1;
    if (tokenize(t.title).some((tok) => hints.has(tok))) sim += 1;
    if (sim >= 2) t.resources_used.forEach((id) => boosted.add(id));
  }

  return graph.resources
    .map((resource) => {
      let score = 0;
      if (projectId && resource.project === projectId) score += 3;
      score += resource.keywords.filter((k) => hints.has(k.toLowerCase())).length;
      if (boosted.has(resource.id)) score += 2; // "a similar past task used this"
      return { resource, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.resource.id.localeCompare(b.resource.id))
    .map((s) => s.resource);
}

function tokenize(text: string): string[] {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// --- intent handling -----------------------------------------------------------

// Exact write intents + design-doc aliases (the original blueprint uses
// "continue_product_progress"; Person 2's parser may emit either form).
const WRITE_INTENTS = new Set([
  "update", "continue_progress", "continue_product_progress", "edit", "write",
]);

function isWriteIntent(intent: string | undefined): boolean {
  const s = String(intent || "").toLowerCase();
  if (WRITE_INTENTS.has(s)) return true;
  // tolerate parser variants like "continue_the_progress" / "update_roadmap",
  // but never let read-ish words flip to write
  if (/(read|review|investigate|look|check)/.test(s)) return false;
  return /(continue|progress|update|edit|write)/.test(s);
}

// Permission ranking — lets us detect UNDER-privilege (viewer on a resource the
// task needs editor on) instead of treating any access as sufficient.
const PERMISSION_RANK: Record<string, number> = {
  viewer: 1, read: 1, member: 1,
  contributor: 2, editor: 2, write: 2,
  owner: 3,
};
const rank = (level: string | null): number =>
  level ? PERMISSION_RANK[level.toLowerCase()] ?? 0 : 0;

// --- core: resolve one resource into an access line ----------------------------

function resolveResource(
  graph: Graph,
  resource: Resource,
  assignee: Person,
  project: Project | null,
  intent: string,
  taskHints: Set<string>
): AccessLine {
  const owner = findPerson(graph, resource.owner);
  const policy = policyFor(graph, resource.resource_type);
  const level = currentLevel(resource, assignee.id);

  // FAIL CLOSED: a resource whose type has no policy gets the strictest
  // defaults (approval required, short duration), never a silent free grant.
  const noPolicy = !policy;

  // Least privilege, per resource: a write-intent task only earns write access
  // on a "work_surface" (the thing you produce on). "reference" resources you
  // merely consult stay read-only even when the overall task is a write task.
  const write = isWriteIntent(intent) && resource.intent_role === "work_surface";
  const recommended = write
    ? policy?.write_intent_permission || resource.default_permission
    : policy?.read_intent_permission || resource.default_permission;

  // approver resolution
  let approver = owner;
  if (policy?.approver_rule === "assignee_manager") {
    approver = findPerson(graph, assignee.manager) || owner;
  }

  // Confidential / never-auto-grant: justified ONLY with BOTH a project match
  // AND explicit keyword evidence from the task. A bare project claim
  // ("project": "sales") must not unlock customer data.
  const keywordEvidence = resource.keywords.some((k) => taskHints.has(k.toLowerCase()));
  const justified =
    resource.sensitivity !== "confidential" ||
    (project !== null && resource.project === project.id && keywordEvidence);

  // Status — including UNDER-privilege: having viewer on a resource the task
  // needs editor on is still "missing" (an upgrade request), not "has_access".
  const sufficient = rank(level) >= rank(recommended);
  let status: AccessLine["status"];
  if (level && sufficient) status = "has_access";
  else if ((policy?.never_auto_grant || noPolicy) && !justified && !level) status = "blocked";
  else status = "missing";

  const line: AccessLine = {
    resource: resource.title,
    resource_id: resource.id,
    system: resource.system,
    icon: resource.icon,
    owner: owner ? owner.name : resource.owner,
    owner_email: owner ? owner.email : null,
    status,
    current_permission: level,
    recommended_permission: status === "has_access" && level ? level : recommended,
    duration: policy?.max_duration || "7 days",
    // no policy -> fail closed: approval is ALWAYS required
    approval_required: status === "has_access" ? false : noPolicy ? true : !!policy!.approval_required,
    approver: status === "has_access" ? null : approver ? approver.name : null,
    approver_email: status === "has_access" ? null : approver ? approver.email : null,
    reason: buildReason(resource, project, write, status, level),
  };

  if (status === "missing") {
    line.request_message = buildRequestMessage(line, assignee, intent);
  }
  return line;
}

function buildReason(
  resource: Resource,
  project: Project | null,
  write: boolean,
  status: AccessLine["status"],
  currentLevel: string | null
): string {
  if (status === "blocked") {
    return `Confidential ${resource.system} data — not explicitly required for this task, so it is not bundled into the grant.`;
  }
  const verb = write ? "update" : "read";
  const scope = project ? `${project.name} work` : "this task";
  const role = resource.intent_role === "reference" ? " (reference)" : "";
  const upgrade = status === "missing" && currentLevel ? ` Upgrade from current '${currentLevel}'.` : "";
  return `Needed to ${verb}${role} for ${scope}: "${resource.title}" (${resource.system}).${upgrade}`;
}

function buildRequestMessage(line: AccessLine, assignee: Person, intent: string): string {
  const perm = capitalize(line.recommended_permission);
  const dur = line.duration && line.duration !== "none" ? ` for ${line.duration}` : "";
  const approverFirst = (line.approver || "there").split(" ")[0];
  return `Hi ${approverFirst}, ${assignee.name} needs ${perm} access to "${line.resource}" (${line.system})${dur} to help with ${humanIntent(intent)}. Approve?`;
}

function humanIntent(intent: string): string {
  const map: Record<string, string> = {
    continue_progress: "continuing the product progress",
    update: "updating progress",
    read: "getting context",
    review: "reviewing the work",
    investigate: "investigating the issue",
  };
  return map[String(intent || "").toLowerCase()] || "this task";
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// --- public API -----------------------------------------------------------------

/** Sanitize attacker-controllable text before echoing it anywhere (Slack, logs). */
function sanitizeEcho(s: unknown, max = 40): string {
  return String(s ?? "")
    .replace(/[`*_~\[\]<>|\n\r]/g, "")
    .slice(0, max);
}

export function resolveAccess(input: TaskInput, graph: Graph = loadGraph()): AccessPackage {
  const assignee = findPerson(graph, input.assignee);
  if (!assignee) {
    return {
      skill: "task_access_assistant",
      error: `Unknown or ambiguous assignee: "${sanitizeEcho(input.assignee)}"`,
      task: { assignee: sanitizeEcho(input.assignee) },
      required_access: [],
      next_action: "clarify_assignee",
    };
  }

  const project = findProject(graph, input.project);
  const intent = input.intent || "read";

  // Task hints (explicit keywords + tokenized text) feed both discovery and
  // the confidential-justification check in resolveResource.
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];
  const taskHints = new Set(
    [...keywords, ...tokenize(input.raw_text || "")].map((k) => String(k).toLowerCase())
  );

  const resources = discoverResources(graph, {
    project,
    keywords,
    rawText: input.raw_text,
    intent: String(intent),
  });

  const required_access = resources.map((r) =>
    resolveResource(graph, r, assignee, project, String(intent), taskHints)
  );

  const missing = required_access.filter((l) => l.status === "missing").length;
  const already = required_access.filter((l) => l.status === "has_access").length;
  const blocked = required_access.filter((l) => l.status === "blocked").length;

  // 0 resources found means the task was too vague to map — ask, don't
  // pretend everything is fine (an agent would treat that as "done").
  const next_action: AccessPackage["next_action"] =
    required_access.length === 0
      ? "clarify_task"
      : missing > 0
        ? "prepare_access_request"
        : "no_action_needed";

  return {
    skill: "task_access_assistant",
    task: {
      assignee: assignee.name,
      assignee_email: assignee.email,
      project: project ? project.name : null,
      intent: String(intent),
    },
    summary: {
      resources_found: required_access.length,
      missing,
      already_has: already,
      blocked,
    },
    required_access,
    next_action,
  };
}
