# Integration setup (Person 1 + 2 + 3 on one device)

Everything Person 3 built is self-contained in this repo. Follow this top to
bottom on the integration machine — ~5 minutes.

## 0. Prerequisites

- **Node.js ≥ 23.6** (native TypeScript execution — check with `node -v`;
  Node 24 recommended). Nothing to `npm install`; there are zero dependencies.
- gbrain CLI/MCP if you want the live brain (optional — Mode A works without it).

## 1. Clone & verify

```bash
git clone https://github.com/onioncurry/accessgraph.git
cd accessgraph
npm test          # must print: 54 passed / 0 failed
npm run demo      # hero task -> 5 resources, Share all (5)
```

If both pass, Person 3's layer works on your machine. Everything below is optional
enrichment.

## 2. Secrets (.env) — NEVER commit this file

Create `accessgraph/.env` (already gitignored):

```
CRUSTDATA_API_KEY=<get this from Ray via DM — not in the repo, repo is public>
```

Then the real-data demo works:

```bash
npm run demo:crustdata            # live Stripe org -> same skill
node scripts/crustdata_demo.ts openai.com   # any company domain
```

If the API is down or you have no key: `data/crustdata_demo.json` and
`docs/crustdata_demo.md` are cached deliverables — the demo story still stands.

## 3. Seed the G-Brain on THIS machine (the #1 integration gotcha)

The brain Person 3 seeded lives on Person 3's machine. Your device's brain is
empty until you load `gbrain_pages/` (all 27 pages are in the repo):

```bash
node scripts/seed_gbrain.ts        # regenerates gbrain_pages/ + _manifest.json

# then load every page (bash):
node -e "
const m = require('./gbrain_pages/_manifest.json');
for (const {slug, file} of m) console.log(\`gbrain capture --file \${file} --slug \${slug}\`);
" | bash
```

(Or loop `_manifest.json` through your gbrain MCP `put_page` — same content.
Typed links are in `gbrain_pages/_links.json` → `gbrain add_link` / MCP `add_link`.)

Verify: `gbrain search "who approves access to customer data"` → should return
`policy/customer_data`.

## 4. Wire-up points

| Person | integrates with | how |
|---|---|---|
| **2 (Skill)** | `lib/mockAccess.ts` | `import { resolveAccess } from "../../lib/mockAccess.ts"` — input/output contract: `docs/access_query_contract.md`. A reference parser exists at `lib/parseTask.ts` (JA/EN) — replace or keep. |
| **1 (UI)** | `AccessPackage` JSON | golden sample: `contract/sample_response.json`. Card mapping table is in the contract doc. Loading state → call, `required_access[]` → rows, `summary.missing` → "Share all (N)". |
| glue | CLI | `node scripts/query.ts --json --dm Rei_Kawaji "<raw message>"` returns the full AccessPackage — Person 1 can shell out to this before the TS import is wired. |

## 5. Demo commands (for the video)

```bash
node scripts/query.ts --dm Rei_Kawaji "Can you take this task over? Product progress is stuck."
# Japanese input works too (bilingual parser):
node scripts/query.ts --dm Rei_Kawaji "プロダクトの進捗が行き詰まっててこのタスクお願いしたいんだけど頼めるかな？"
npm run demo:review      # least privilege: read task -> all viewer
npm run demo:blocked     # confidential -> blocked, manager approver
npm run demo:crustdata   # real org data
npm test                 # 54 adversarial cases, run live in front of judges
```

## Troubleshooting

- `SyntaxError` on `.ts` files → Node too old. Need ≥ 23.6.
- `CRUSTDATA_API_KEY not found` → step 2.
- gbrain search returns nothing → step 3 (brain is per-machine).
- Windows PowerShell: quote the Japanese message with double quotes, not single.
