import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) process.exit(0);

const url = new URL(databaseUrl);
const hostname = url.hostname.replace(/^\[|\]$/g, "");
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(hostname);
const port = Number(url.port || 5432);
if (!isLocal || port !== 5433) process.exit(0);

function isListening() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

if (await isListening()) process.exit(0);

const db = spawn(process.execPath, [path.join(root, "scripts", "embedded-db.mjs"), "start"], {
  cwd: root,
  env: process.env,
  stdio: "ignore",
  detached: true,
  windowsHide: true,
});
db.unref();

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  if (await isListening()) process.exit(0);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

console.error("The local PostgreSQL service did not start on port 5433.");
process.exit(1);
