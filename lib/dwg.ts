import { spawn } from "child_process";
import { createReadStream, promises as fsp } from "fs";
import { createInterface } from "readline";
import os from "os";
import path from "path";

// 실측: DWG/ 폴더의 실제 도면 기준 69.7MB 파일도 dwgread 변환 4.5초, 15MB는 1.19초.
// Vercel Linux 바이너리가 로컬보다 느릴 가능성을 감안한 여유값(300초 함수 한도 내).
const DWGREAD_TIMEOUT_MS = 60_000;
const MAX_EXTRACTED_CHARS = 8000;
const TEXT_ENTITY_TYPES = new Set(["TEXT", "MTEXT", "ATTRIB"]);

// On Vercel this resolves to the Linux binary bundled via
// next.config.ts's outputFileTracingIncludes. Locally (npm run dev on this
// Mac) it falls back to the Homebrew-installed dwgread already on PATH.
function dwgreadBinaryPath() {
  return process.env.VERCEL ? path.join(process.cwd(), "bin", "dwgread") : "dwgread";
}

function runDwgread(dwgPath: string, dxfPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(dwgreadBinaryPath(), ["-O", "DXF", "-o", dxfPath, dwgPath]);
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      reject(new Error("dwgread timed out"));
    }, DWGREAD_TIMEOUT_MS);

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    // dwgread can exit non-zero on "unstable class" warnings while still
    // writing a usable DXF, so success is judged by the DXF existing
    // afterwards (checked by the caller), not by the exit code here.
    proc.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    });
  });
}

// DXF ASCII records alternate: a group-code line, then a value line.
// MTEXT splits long strings across repeated group-3 chunks followed by
// one final group-1 chunk, so group-3 is buffered until that group-1 lands.
async function extractTextFromDxf(dxfPath: string): Promise<string> {
  const rl = createInterface({ input: createReadStream(dxfPath, { encoding: "utf-8" }) });

  const chunks: string[] = [];
  let total = 0;
  let pendingCode: string | null = null;
  let currentType: string | null = null;
  let mtextBuffer = "";

  const flushMtext = () => {
    const text = mtextBuffer.trim();
    if (text) {
      chunks.push(text);
      total += text.length;
    }
    mtextBuffer = "";
  };

  for await (const rawLine of rl) {
    if (total >= MAX_EXTRACTED_CHARS) break;
    const line = rawLine.trim();

    if (pendingCode === null) {
      pendingCode = line;
      continue;
    }
    const code = pendingCode;
    const value = line;
    pendingCode = null;

    if (code === "0") {
      flushMtext();
      currentType = value;
      continue;
    }

    if (currentType === "MTEXT" && code === "3") {
      mtextBuffer += value;
      continue;
    }

    if (currentType && TEXT_ENTITY_TYPES.has(currentType) && code === "1") {
      if (currentType === "MTEXT") {
        mtextBuffer += value;
        flushMtext();
      } else if (value.trim()) {
        chunks.push(value.trim());
        total += value.length;
      }
    }
  }
  flushMtext();
  rl.close();

  return chunks.join("\n").slice(0, MAX_EXTRACTED_CHARS);
}

// Converts a DWG to DXF with the bundled dwgread binary and pulls out
// TEXT/MTEXT/ATTRIB content (title block fields, sheet titles, labels) —
// enough for AI metadata inference, not a full geometry export.
export async function extractDwgText(dwgBuffer: Buffer): Promise<string> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "dwg-"));
  const dwgPath = path.join(tmpDir, "input.dwg");
  const dxfPath = path.join(tmpDir, "output.dxf");

  try {
    await fsp.writeFile(dwgPath, dwgBuffer);
    await runDwgread(dwgPath, dxfPath);
    await fsp.access(dxfPath);
    return await extractTextFromDxf(dxfPath);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
      console.error("Failed to clean up DWG tmp dir:", err);
    });
  }
}

// For files that are already DXF (no dwgread conversion needed), pulls out
// the same TEXT/MTEXT/ATTRIB content as extractDwgText via extractTextFromDxf.
export async function extractDxfText(dxfBuffer: Buffer): Promise<string> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "dxf-"));
  const dxfPath = path.join(tmpDir, "input.dxf");

  try {
    await fsp.writeFile(dxfPath, dxfBuffer);
    return await extractTextFromDxf(dxfPath);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
      console.error("Failed to clean up DXF tmp dir:", err);
    });
  }
}
