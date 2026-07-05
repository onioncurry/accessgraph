// AccessBot demo server — UI + REAL engine, fully offline (no API, no deps)
//
//   npm run serve:demo   ->  http://localhost:8377
//
//   GET /            the split-screen Slack demo (Person 1 UI)
//   GET /resolve     the REAL pipeline: ?text=<message>&dm=<receiver>
//                    -> isTriggered + parseTask + resolveAccess (AccessPackage)
//   GET /data        the whole offline graph (people/resources/policies/tasks)
//
// Everything reads from data/*.json on disk — zero network calls.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph, resolveAccess } from "../lib/mockAccess.ts";
import { parseTask, isTriggered } from "../lib/parseTask.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || 8377;

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === "/resolve") {
    const text = url.searchParams.get("text") || "";
    const dm = url.searchParams.get("dm") || undefined;
    const graph = loadGraph();
    const triggered = isTriggered(text);
    const input = parseTask(text, graph, dm ? { dm_other: dm } : {});
    const pkg = triggered ? resolveAccess(input, graph) : null;
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ triggered, input, package: pkg }, null, 2));
    return;
  }

  if (url.pathname === "/data") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(loadGraph(), null, 2));
    return;
  }

  // read per request so edits show up on refresh during the hackathon
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(readFileSync(join(root, "demo", "slack-demo.html")));
}).listen(port, () => console.log(`AccessBot demo on http://localhost:${port}  (UI: /  ·  engine: /resolve?text=...  ·  graph: /data)`));
