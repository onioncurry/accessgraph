// AccessGraph — reference task parser (Person 3 stub; Person 2 owns the real one)
//
// Turns a raw Slack/Teams message (EN or JA) into a TaskInput for
// resolveAccess(). Heuristic on purpose — Person 2's skill replaces this with
// LLM parsing, but the demo pipeline must accept raw text per the design doc:
//   "Reiにプロダクトの進捗を進めてもらいたい。必要そうな資料も共有しておいて。"
//
// Context matters: in a DM the assignee is usually the OTHER participant, so
// callers can pass { dm_other: "Rei_Kawaji" } as a fallback.

import type { Graph, TaskInput } from "./types.ts";

// --- mention trigger ---------------------------------------------------------
// The bot activates ONLY when mentioned. Person 1's front door checks
// isTriggered() first; parseTask() strips the mention so it never pollutes
// assignee/keyword matching. Accepts @AccessBot / @AccessGraph / <@U123> style.
export const BOT_MENTION = /(@access(bot|graph)\b|<@[A-Z0-9]+>)/gi;

export function isTriggered(text: string): boolean {
  return /@access(bot|graph)\b/i.test(text) || /<@[A-Z0-9]+>/.test(text);
}

export function stripMention(text: string): string {
  return text.replace(BOT_MENTION, " ").replace(/\s+/g, " ").trim();
}

// Japanese → graph-keyword mapping (extend freely; keys are substring-matched)
const JA_KEYWORDS: Record<string, string[]> = {
  "プロダクト": ["product"],
  "進捗": ["progress"],
  "ロードマップ": ["roadmap"],
  "マイルストーン": ["milestone"],
  "資料": ["docs", "brief"],
  "オンボーディング": ["onboarding"],
  "デザイン": ["design"],
  "課題": ["issue"],
  "バグ": ["bug"],
  "顧客": ["customer"],
  "売上": ["revenue"],
  "チャンネル": ["channel"],
};

const INTENT_RULES: Array<[RegExp, TaskInput["intent"]]> = [
  // JA first (substring), then EN word-ish patterns — first match wins
  [/進捗.*(進め|引き継|任せ|お願い)|引き継|任せたい|進めてもら/u, "continue_progress"],
  [/(更新|編集|書き換え|仕上げ)/u, "update"],
  [/(レビュー|確認して|見ておいて)/u, "review"],
  [/(調査|調べて|デバッグ|原因)/u, "investigate"],
  [/\b(continue|move .{0,20}forward|take over|take (this|the|that|it) .{0,20}over|pick up (this|the)|drive|push|keep .{0,10}going)\b/i, "continue_progress"],
  [/\b(update|edit|finish|complete|fill in)\b/i, "update"],
  [/\b(review|check|look at|look over)\b/i, "review"],
  [/\b(investigate|debug|diagnose|root.?cause)\b/i, "investigate"],
  // generic task-handoff phrasing (「この件をお願いしたい」「頼めるかな」) — the
  // assignee is being asked to DO work, so treat as continue_progress. Placed
  // last so review/investigate wording wins when both appear.
  [/(お願いしたい|お願いできる|頼めるかな|頼みたい|任せても|やってもらえ|can you (take|handle)|could you help)/iu, "continue_progress"],
];

export function parseTask(
  text: string,
  graph: Graph,
  context: { dm_other?: string } = {}
): TaskInput {
  text = stripMention(text);
  const lower = text.toLowerCase();

  // --- assignee: first person whose first name or handle appears in the text;
  // fall back to the DM partner.
  let assignee = "";
  for (const p of graph.people) {
    const first = p.name.split(" ")[0].toLowerCase();
    if (lower.includes(first) || lower.includes(p.handle.toLowerCase())) {
      assignee = p.handle;
      break;
    }
  }
  if (!assignee && context.dm_other) assignee = context.dm_other;

  // --- intent
  let intent: TaskInput["intent"] = "read";
  for (const [re, i] of INTENT_RULES) {
    if (re.test(text)) { intent = i; break; }
  }

  // --- keywords: EN tokens that hit any resource keyword + JA dictionary hits
  const known = new Set(graph.resources.flatMap((r) => r.keywords.map((k) => k.toLowerCase())));
  const keywords = new Set<string>();
  for (const tok of lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (tok.length > 2 && known.has(tok)) keywords.add(tok);
  }
  for (const [ja, mapped] of Object.entries(JA_KEYWORDS)) {
    if (text.includes(ja)) mapped.forEach((k) => keywords.add(k));
  }

  // --- project: explicit name/id/alias mention
  let project: string | undefined;
  for (const pr of graph.projects) {
    const candidates = [pr.id, pr.name, ...(pr.aliases || [])].map((s) => s.toLowerCase());
    if (candidates.some((c) => lower.includes(c) || text.includes(c))) {
      project = pr.id;
      break;
    }
  }
  // JA fallback: 「プロダクト」 implies the product project if none matched
  if (!project) {
    for (const pr of graph.projects) {
      if ((pr.aliases || []).some((a) => text.includes(a))) { project = pr.id; break; }
    }
  }

  return {
    assignee,
    project,
    intent,
    keywords: [...keywords],
    raw_text: text,
  };
}
