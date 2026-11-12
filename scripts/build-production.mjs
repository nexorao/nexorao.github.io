import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const distDir = process.env.NEXORAO_BUILD_DIR ?? ".next-production";
const env = { ...process.env, NEXORAO_DIST_DIR: distDir };
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

const build = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: root,
  env,
  stdio: "inherit",
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const assets = spawnSync(process.execPath, [path.join(root, "scripts", "prepare-standalone.mjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});

if (assets.error) throw assets.error;
if (assets.status !== 0) process.exit(assets.status ?? 1);
