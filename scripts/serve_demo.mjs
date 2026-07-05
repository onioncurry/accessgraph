// Tiny static server for demo/slack-demo.html (browser QA / judging)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || 8377;

createServer((req, res) => {
  // read per request so edits show up on refresh during the hackathon
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(readFileSync(join(root, "demo", "slack-demo.html")));
}).listen(port, () => console.log(`AccessBot demo on http://localhost:${port}`));
