// Tiny static server for demo/slack-demo.html (browser QA / judging)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "demo", "slack-demo.html"));
const port = process.env.PORT || 8377;

createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, () => console.log(`AccessBot demo on http://localhost:${port}`));
