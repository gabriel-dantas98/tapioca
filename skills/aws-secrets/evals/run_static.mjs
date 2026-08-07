#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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

for (const result of checks) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
}
const passed = checks.filter((result) => result.ok).length;
console.log(JSON.stringify({ passed, total: checks.length }));
if (passed !== checks.length) process.exitCode = 1;
