import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CliIo {
  writeOut(value: string): void;
  writeError(value: string): void;
  readStdin(): Promise<string>;
  promptSecret(label: string): Promise<string>;
  copy(value: string): Promise<void>;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Use --stdin quando o terminal interativo não estiver disponível.");
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (): void => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) {
          finish();
          reject(new Error("Entrada cancelada."));
          return;
        }
        if (byte === 10 || byte === 13) {
          finish();
          resolve(value);
          return;
        }
        if (byte === 127) value = value.slice(0, -1);
        else value += String.fromCharCode(byte);
      }
    };
    process.stdin.on("data", onData);
  });
}

function pipeTo(command: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], { stdio: ["pipe", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", (chunk) => {
      errorText += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} falhou: ${errorText.trim()}`));
    });
    child.stdin.end(value);
  });
}

export const processIo: CliIo = {
  writeOut: (value) => console.log(value),
  writeError: (value) => console.error(value),
  readStdin: async () => readStream(process.stdin),
  promptSecret: hiddenPrompt,
  copy: async (value) => pipeTo("pbcopy", value),
};

export async function readValueSource(
  options: { stdin?: boolean; fromFile?: string },
  io: CliIo,
): Promise<string> {
  if (options.stdin && options.fromFile) {
    throw new Error("Use apenas uma fonte: --stdin ou --from-file.");
  }
  if (options.fromFile) return readFile(options.fromFile, "utf8");
  if (options.stdin) return (await io.readStdin()).replace(/\r?\n$/, "");
  return io.promptSecret("Valor: ");
}

export async function defaultIsIgnored(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git", ["check-ignore", "-q", "--", path], {
      cwd: dirname(path),
      stdio: "ignore",
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}
