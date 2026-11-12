import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = process.env.NEXORAO_DIST_DIR ?? ".next-production";
const output = path.resolve(root, distDir);
const standalone = path.join(output, "standalone");

for (const entry of ["static", "public"]) {
  const source = path.join(entry === "static" ? output : root, entry);
  const destination = path.join(standalone, entry === "static" ? path.basename(output) : "", entry);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

console.log("[nexorao] Standalone server assets are ready.");
