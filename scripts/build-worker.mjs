import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const workerSource = await readFile(resolve(root, "worker/index.js"), "utf8");
const pageHtml = await readFile(resolve(root, "app/index.html"), "utf8");
const output = workerSource.replace("\"__PALMER_PAGE_HTML__\"", JSON.stringify(pageHtml));

if (output === workerSource) {
  throw new Error("Worker source did not contain the page HTML placeholder.");
}

await mkdir(resolve(root, "dist/server"), { recursive: true });
await writeFile(resolve(root, "dist/server/index.js"), output);
