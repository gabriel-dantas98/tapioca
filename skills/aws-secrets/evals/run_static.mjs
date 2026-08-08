#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const checks = [];

async function check(name, verify) {
  try {
    await verify();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

await check("skill frontmatter", async () => {
  const skill = await readFile(join(root, "SKILL.md"), "utf8");
  if (!skill.startsWith("---\nname: aws-secrets\ndescription: Use when")) {
    throw new Error("SKILL.md precisa de frontmatter acionável");
  }
});

await check("bootstrap executable", async () => {
  const info = await stat(join(root, "scripts", "bootstrap.sh"));
  if ((info.mode & 0o111) === 0) throw new Error("bootstrap.sh não é executável");
});

await check("approved CLI surface", async () => {
  const program = await readFile(join(root, "src", "cli", "program.ts"), "utf8");
  for (const command of ["doctor", "list", "get", "create", "edit", "inject", "ui"]) {
    if (!program.includes(`command(\"${command}\")`)) throw new Error(`comando ausente: ${command}`);
  }
  if (program.includes('command("delete")') || program.includes('command("run")')) {
    throw new Error("superfície proibida encontrada");
  }
});

await check("read-only loopback server", async () => {
  const routes = await readFile(join(root, "src", "server", "routes.ts"), "utf8");
  const start = await readFile(join(root, "src", "server", "start.ts"), "utf8");
  const mutation = /app\.(?:put|patch|delete)\s*[<(]/;
  if (mutation.test(routes)) throw new Error("rota mutável encontrada");
  if (!start.includes('host: "127.0.0.1"') || start.includes('host: "0.0.0.0"')) {
    throw new Error("servidor não está preso ao loopback");
  }
});

await check("JSON edits do not mutate tags", async () => {
  const gateway = await readFile(join(root, "src", "aws", "gateway.ts"), "utf8");
  if (gateway.includes("TagResourceCommand")) {
    throw new Error("edit ainda pode deixar valor e tags em estado parcial");
  }
});

await check("packaged UI has a real-browser integration test", async () => {
  const test = await readFile(
    join(root, "tests", "ui", "production-server.spec.ts"),
    "utf8",
  );
  for (const evidence of ["dist/ui", "startUiServer", "Revelar por 30s", "Copiar"]) {
    if (!test.includes(evidence)) throw new Error(`evidência ausente: ${evidence}`);
  }
});

await check("no browser persistence", async () => {
  const app = await readFile(join(root, "ui", "src", "App.tsx"), "utf8");
  const forbidden = ["localStorage", "sessionStorage", "indexedDB", "serviceWorker"];
  for (const token of forbidden) {
    if (app.includes(token)) throw new Error(`persistência proibida: ${token}`);
  }
});

await check("eval catalog matches runner", async () => {
  const catalog = JSON.parse(await readFile(join(root, "evals", "evals.json"), "utf8"));
  const runner = await readFile(join(root, "evals", "run_behavior.ts"), "utf8");
  if (catalog.cases.length < 8) throw new Error("catálogo de evals incompleto");
  for (const item of catalog.cases) {
    if (!runner.includes(`\"${item.id}\"`)) throw new Error(`eval sem runner: ${item.id}`);
  }
});

await check("plugin manifests mention aws-secrets", async () => {
  for (const file of [
    ".claude-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".cursor-plugin/marketplace.json",
  ]) {
    const manifest = await readFile(join(repository, file), "utf8");
    if (!manifest.includes("aws-secrets")) throw new Error(`${file} não registra a filling`);
  }
});

for (const result of checks) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
}
const passed = checks.filter((result) => result.ok).length;
console.log(JSON.stringify({ passed, total: checks.length }));
if (passed !== checks.length) process.exitCode = 1;
