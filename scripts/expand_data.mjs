// One-shot data expansion: 4 projects, 2 confidential policies, 10 new
// resources (all NON-phoenix so the hero demo stays "Share all (5)"),
// plus file_path attachments linking graph entries to real files in
// company_drive/. Idempotent — safe to re-run.
import { readFileSync, writeFileSync } from "node:fs";
const j = (f) => JSON.parse(readFileSync(f, "utf8"));

// --- projects ---
const p = j("data/people.json");
const newProjects = [
  { id: "people-ops", name: "People Ops", aliases: ["hiring", "hr", "採用"], lead: "jiayi_li", members: ["jiayi_li", "koichi_ikeno"] },
  { id: "operations", name: "Operations", aliases: ["ops", "internal"], lead: "mitsuhiro_suzuki", members: ["mitsuhiro_suzuki", "shota_gushima"] },
  { id: "finance", name: "Finance & Board", aliases: ["finance", "board", "財務"], lead: "jiayi_li", members: ["jiayi_li"] },
  { id: "brand", name: "Brand & Design System", aliases: ["brand", "ブランド"], lead: "koichi_ikeno", members: ["koichi_ikeno", "shota_gushima"] },
];
for (const np of newProjects) if (!p.projects.some((x) => x.id === np.id)) p.projects.push(np);
writeFileSync("data/people.json", JSON.stringify(p, null, 2));

// --- policies: hr_data + finance_data (confidential, never auto-grant) ---
const pol = j("data/policies.json");
for (const t of ["hr_data", "finance_data"]) {
  if (!pol.policies.some((x) => x.resource_type === t)) pol.policies.push({
    resource_type: t,
    description: t === "hr_data"
      ? "Confidential HR data (interviews, payroll, comp). Manager approval, never auto-bundled."
      : "Confidential finance/board material. Manager approval, never auto-bundled.",
    read_intent_permission: "viewer", write_intent_permission: "viewer",
    max_duration: "3 days", approval_required: true, approver_rule: "assignee_manager", never_auto_grant: true,
  });
}
writeFileSync("data/policies.json", JSON.stringify(pol, null, 2));

// --- resources ---
const r = j("data/resources.json");
const attach = {
  "product-brief": "company_drive/Project Phoenix - Product Brief.docx",
  "q2-roadmap-milestones": "company_drive/Q2 Roadmap & Milestones.xlsx",
  "onboarding-flow-v2": "company_drive/Onboarding Flow v2 - Design Notes.docx",
  "customer-accounts-sfdc": "company_drive/Customer Accounts.xlsx",
  "prod-1327": "company_drive/PROD-1327 - Bug Report.docx",
};
for (const res of r.resources) if (attach[res.id]) res.file_path = attach[res.id];

const add = [
  { id: "phoenix-launch-deck", title: "Phoenix Launch Deck", system: "Google Slides", icon: "gdocs", owner: "shota_gushima", project: "sales", sensitivity: "internal", resource_type: "product_doc", intent_role: "work_surface", keywords: ["deck", "announcement", "gtm", "marketing"], default_permission: "editor", current_access: [{ person: "shota_gushima", level: "owner" }, { person: "ayumu_kobayashi", level: "editor" }], category: "spec", summary: "Go-to-market launch narrative and announcement plan.", file_path: "company_drive/Phoenix Launch Deck.pptx" },
  { id: "sales-pipeline-review", title: "Q2 Sales Pipeline Review", system: "Google Slides", icon: "gdocs", owner: "ayumu_kobayashi", project: "sales", sensitivity: "internal", resource_type: "product_doc", intent_role: "reference", keywords: ["pipeline", "forecast", "deals", "review"], default_permission: "viewer", current_access: [{ person: "ayumu_kobayashi", level: "owner" }, { person: "jiayi_li", level: "viewer" }], category: "report", summary: "Quarterly pipeline health, forecast, and deal movement.", file_path: "company_drive/Q2 Sales Pipeline Review.pptx" },
  { id: "market-research-competitors", title: "Market Research - Competitor Scan", system: "Google Drive", icon: "gdocs", owner: "ayumu_kobayashi", project: "sales", sensitivity: "internal", resource_type: "product_doc", intent_role: "reference", keywords: ["competitor", "market", "research", "benchmark"], default_permission: "viewer", current_access: [{ person: "ayumu_kobayashi", level: "owner" }], category: "report", summary: "Firmographic scan of adjacent companies (real Crustdata pull).", file_path: "company_drive/Market Research - Competitor Scan.json" },
  { id: "hiring-plan-2026", title: "2026 Hiring Plan", system: "Google Sheets", icon: "sheets", owner: "jiayi_li", project: "people-ops", sensitivity: "internal", resource_type: "product_doc", intent_role: "work_surface", keywords: ["hiring", "headcount", "recruiting"], default_permission: "editor", current_access: [{ person: "jiayi_li", level: "owner" }], category: "report", summary: "Headcount plan by team and quarter.", file_path: "company_drive/2026 Hiring Plan.xlsx" },
  { id: "interview-notes-design-lead", title: "Interview Notes - Design Lead Candidate", system: "Google Docs", icon: "gdocs", owner: "jiayi_li", project: "people-ops", sensitivity: "confidential", resource_type: "hr_data", intent_role: "reference", keywords: ["interview", "candidate", "notes"], default_permission: "viewer", current_access: [{ person: "jiayi_li", level: "owner" }, { person: "koichi_ikeno", level: "viewer" }], category: "meeting-notes", summary: "Confidential interview feedback (HR data).", file_path: "company_drive/Interview Notes - Design Lead Candidate.docx" },
  { id: "payroll-q2", title: "Q2 Payroll", system: "Google Sheets", icon: "sheets", owner: "jiayi_li", project: "finance", sensitivity: "confidential", resource_type: "hr_data", intent_role: "reference", keywords: ["payroll", "salary", "compensation"], default_permission: "viewer", current_access: [{ person: "jiayi_li", level: "owner" }], category: "report", summary: "Confidential payroll ledger.", file_path: "company_drive/Q2 Payroll.xlsx" },
  { id: "q2-board-update", title: "Q2 Board Update", system: "Google Slides", icon: "gdocs", owner: "jiayi_li", project: "finance", sensitivity: "confidential", resource_type: "finance_data", intent_role: "reference", keywords: ["board", "investor", "financials"], default_permission: "viewer", current_access: [{ person: "jiayi_li", level: "owner" }], category: "report", summary: "Confidential board pack: metrics, runway, asks.", file_path: "company_drive/Q2 Board Update.pptx" },
  { id: "brand-guidelines-v3", title: "Brand Guidelines v3", system: "Figma", icon: "figma", owner: "koichi_ikeno", project: "brand", sensitivity: "internal", resource_type: "product_doc", intent_role: "reference", keywords: ["brand", "guidelines", "logo", "typography"], default_permission: "viewer", current_access: [{ person: "koichi_ikeno", level: "owner" }, { person: "shota_gushima", level: "viewer" }], category: "design", summary: "Logo usage, color, typography rules.", file_path: "company_drive/Brand Guidelines v3.docx" },
  { id: "company-handbook", title: "Company Handbook", system: "Notion", icon: "gdocs", owner: "mitsuhiro_suzuki", project: "operations", sensitivity: "internal", resource_type: "product_doc", intent_role: "reference", keywords: ["handbook", "benefits", "holiday", "policies"], default_permission: "viewer", current_access: [{ person: "mitsuhiro_suzuki", level: "owner" }, { person: "shota_gushima", level: "viewer" }, { person: "jiayi_li", level: "viewer" }, { person: "rei_kawaji", level: "viewer" }, { person: "koichi_ikeno", level: "viewer" }, { person: "ayumu_kobayashi", level: "viewer" }], category: "spec", summary: "How we work: policies, benefits, holidays.", file_path: "company_drive/Company Handbook.docx" },
  { id: "incident-runbook", title: "Incident Response Runbook", system: "Notion", icon: "gdocs", owner: "mitsuhiro_suzuki", project: "operations", sensitivity: "internal", resource_type: "product_doc", intent_role: "reference", keywords: ["incident", "runbook", "oncall", "outage"], default_permission: "viewer", current_access: [{ person: "mitsuhiro_suzuki", level: "owner" }], category: "spec", summary: "Step-by-step incident response for on-call.", file_path: "company_drive/Incident Response Runbook.docx" },
];
for (const a of add) if (!r.resources.some((x) => x.id === a.id)) r.resources.push(a);
writeFileSync("data/resources.json", JSON.stringify(r, null, 2));
console.log("resources:", r.resources.length, "| projects:", p.projects.length, "| policies:", pol.policies.length);
