// AccessGraph — shared types (Person 3)
// Contract between the G-Brain access graph (Person 3), the
// task_access_assistant skill (Person 2), and the UI (Person 1).

export type Intent = "read" | "review" | "investigate" | "update" | "continue_progress";

export type AccessStatus = "missing" | "has_access" | "blocked";

export interface Person {
  id: string;
  name: string;
  handle: string;
  role: string;
  email: string;
  department: string;
  manager: string | null;
}

export interface Project {
  id: string;
  name: string;
  /** parser hints: other names this project goes by (EN/JA) */
  aliases?: string[];
  lead: string;
  members: string[];
}

export interface AccessEntry {
  person: string; // person id
  level: string;
}

/** Document category (type axis; project is the second axis) */
export type Category =
  | "spec" | "design" | "task" | "report" | "meeting-notes" | "channel" | "customer-data";

export interface Resource {
  id: string;
  title: string;
  system: string;
  icon: string;
  owner: string; // person id
  project: string; // project id
  /** type-axis classification; auto-derived at registration when absent */
  category?: Category;
  /** one-line summary — the ONLY content stored in the brain (metadata-only catalog) */
  summary?: string;
  sensitivity: "internal" | "confidential";
  resource_type: string;
  /** reference = read-only even on write tasks; work_surface = earns write on write tasks */
  intent_role: "reference" | "work_surface";
  keywords: string[];
  default_permission: string;
  current_access: AccessEntry[];
}

export interface Policy {
  resource_type: string;
  description?: string;
  read_intent_permission: string;
  write_intent_permission: string;
  max_duration: string; // "7 days" | "none"
  approval_required: boolean;
  approver_rule: "resource_owner" | "assignee_manager";
  never_auto_grant?: boolean;
}

/** A past task and the resources it actually used (rough linkage — discovery signal only) */
export interface PastTask {
  id: string;
  title: string;
  raw_text?: string;
  requester: string; // person id
  assignee: string; // person id
  project: string; // project id
  intent: string;
  status: "done" | "in_progress";
  resources_used: string[]; // resource ids, roughly linked
}

export interface Graph {
  people: Person[];
  projects: Project[];
  resources: Resource[];
  policies: Policy[];
  tasks?: PastTask[];
}

// --- skill input (Person 2's parser produces this) --------------------------

export interface TaskInput {
  /** name, id, handle, or email — resolver fuzzy-matches */
  assignee: string;
  project?: string;
  intent?: Intent | string;
  keywords?: string[];
  raw_text?: string;
}

// --- skill output (AccessPackage — rendered by Person 1, consumed by agents) -

export interface AccessLine {
  resource: string;
  resource_id: string;
  system: string;
  icon: string;
  owner: string;
  owner_email: string | null;
  status: AccessStatus;
  current_permission: string | null;
  recommended_permission: string;
  duration: string;
  approval_required: boolean;
  approver: string | null;
  approver_email: string | null;
  reason: string;
  request_message?: string;
}

export interface AccessPackage {
  skill: "task_access_assistant";
  error?: string;
  task: {
    assignee: string;
    assignee_email?: string;
    project?: string | null;
    intent?: string;
  };
  summary?: {
    resources_found: number;
    missing: number;
    already_has: number;
    blocked: number;
  };
  required_access: AccessLine[];
  next_action: "prepare_access_request" | "no_action_needed" | "clarify_assignee" | "clarify_task";
}
