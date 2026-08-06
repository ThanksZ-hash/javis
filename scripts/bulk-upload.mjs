#!/usr/bin/env node
// 로컬 폴더의 파일들을 한 번에 Supabase(documents 테이블 + Storage)에 업로드하는 개발용 스크립트.
//
// 사용법:
//   node scripts/bulk-upload.mjs <폴더경로> [최대개수=100] ["기본 설명"]
//
// - 폴더 안의 모든 파일(하위 폴더 포함)을 재귀적으로 찾습니다.
// - 파일 크기가 작은 것부터 우선으로 최대개수만큼만 업로드합니다.
//   (Supabase 무료 플랜 File Storage 한도 1GB, 그리고 검색 시 문서 목록 전체를
//    Gemini 프롬프트에 넣는 구조라 문서가 너무 많으면 검색이 느려지고 비용도 커짐)
// - 파일명에 "201동", "302동"처럼 "숫자+동/블록/구역" 패턴이 있으면 site_name으로 자동 추출합니다.
// - .env.local의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY를 사용합니다.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { randomUUID } from "crypto";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

// 실제 업무 문서로 볼 수 있는 확장자만 허용합니다.
// (아이콘, 바로가기, 서명/도장 이미지 같은 것들은 대상에서 제외)
const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".hwp",
  ".hwpx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".dwg",
]);

// 파일명에 이 키워드가 포함되면 개인 서명/도장/인감처럼 민감할 수 있어 제외합니다.
const BLOCKED_KEYWORDS = ["싸인", "도장", "서명", "sign", "seal", "인감", "직인"];

const BLOCKED_EXACT_NAMES = new Set(["desktop.ini", "thumbs.db"]);

function isUploadable(rawFileName, size) {
  // macOS(APFS)는 한글 파일명을 분리형(NFD)으로 반환하는데, 코드에 적은 키워드는
  // 결합형(NFC)이라 정규화하지 않으면 "싸인" 같은 키워드가 매칭되지 않습니다.
  const fileName = rawFileName.normalize("NFC");

  if (fileName.startsWith("~$")) return false; // Office 임시 잠금 파일
  if (BLOCKED_EXACT_NAMES.has(fileName.toLowerCase())) return false;
  if (size < 1024) return false; // 1KB 미만은 빈 파일/placeholder일 가능성이 큼

  const extMatch = fileName.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0].toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;

  const lowerName = fileName.toLowerCase();
  if (BLOCKED_KEYWORDS.some((kw) => lowerName.includes(kw.normalize("NFC").toLowerCase()))) {
    return false;
  }

  return true;
}

function findFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results; // 권한 없는 폴더는 건너뜀
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...findFiles(fullPath));
    } else if (stat.isFile() && isUploadable(entry, stat.size)) {
      results.push({ path: fullPath, size: stat.size });
    }
  }
  return results;
}

function guessSiteName(fileName) {
  const match = fileName.match(/(\d+)\s*(동|블록|BL|구역)/i);
  return match ? match[0] : null;
}

async function main() {
  const folder = process.argv[2];
  const maxCount = parseInt(process.argv[3], 10) || 100;
  const defaultDescription = process.argv[4] || "";

  if (!folder) {
    console.error(
      '사용법: node scripts/bulk-upload.mjs <폴더경로> [최대개수=100] ["기본 설명"]'
    );
    process.exit(1);
  }

  loadEnvLocal();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const rawFiles = findFiles(folder);
  const totalSize = rawFiles.reduce((sum, f) => sum + f.size, 0);
  console.log(
    `전체 ${rawFiles.length}개 파일 발견 (총 ${(totalSize / 1024 / 1024).toFixed(1)}MB).`
  );

  // 원본 폴더에 같은 파일(같은 파일명 + 같은 크기)이 여러 하위 폴더에 중복 저장된
  // 경우가 많아서, 검색 결과가 같은 문서로 도배되는 것을 막기 위해 중복을 제거합니다.
  const seen = new Set();
  const allFiles = [];
  for (const f of rawFiles) {
    const name = f.path.split("/").pop().normalize("NFC");
    const key = `${name}::${f.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allFiles.push(f);
  }
  console.log(`중복 제거 후 ${allFiles.length}개.`);

  const files = allFiles.sort((a, b) => a.size - b.size).slice(0, maxCount);
  const selectedSize = files.reduce((sum, f) => sum + f.size, 0);
  console.log(
    `크기가 작은 것부터 ${files.length}개를 업로드합니다 (총 ${(selectedSize / 1024 / 1024).toFixed(1)}MB).\n`
  );

  let success = 0;
  let failed = 0;

  for (const { path: filePath } of files) {
    const fileName = relative(folder, filePath).split("/").pop().normalize("NFC");
    const buffer = readFileSync(filePath);
    const extMatch = fileName.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : "";
    const storagePath = `${randomUUID()}${ext}`;
    const siteName = guessSiteName(fileName);

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer);

    if (uploadError) {
      console.error(`실패: ${fileName} - ${uploadError.message}`);
      failed++;
      continue;
    }

    const { error: insertError } = await supabase.from("documents").insert({
      file_name: fileName,
      storage_path: storagePath,
      description: defaultDescription,
      site_name: siteName,
      file_size: buffer.length,
    });

    if (insertError) {
      console.error(`메타데이터 저장 실패: ${fileName} - ${insertError.message}`);
      failed++;
      continue;
    }

    console.log(`업로드됨: ${fileName}${siteName ? ` (site_name: ${siteName})` : ""}`);
    success++;
  }

  console.log(`\n완료: 성공 ${success}개, 실패 ${failed}개`);
}

main();
