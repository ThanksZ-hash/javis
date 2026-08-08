import { NextRequest, NextResponse } from "next/server";
import {
  inferMetadataFromFileName,
  inferMetadataFromImage,
  inferMetadataFromDwgText,
  inferSitePhotoWorkLogFromImage,
  inferSitePhotoWorkLogFromImages,
  inferWorkLogFromKeyword,
} from "@/lib/gemini";
import { extractDwgText } from "@/lib/dwg";
import { createClient } from "@/lib/supabase-clients/server";

// DWG는 원본을 그대로 API 요청 본문에 담기엔 Vercel 함수 요청 본문 제한(4.5MB)에
// 걸리기 쉬워서, 클라이언트가 먼저 Storage에 올린 뒤 storage_path만 넘겨받아
// 서버에서 직접 내려받아 처리합니다. dwgread 변환 자체가 큰 도면일수록 느려지므로
// 원본 파일 크기로도 한 번 더 상한을 둡니다.
// 실측: 69.7MB 도면도 dwgread 변환 4.5초 수준이라 100MB까지 올려도 안전 (Hobby 메모리 2GB 한도 내).
const MAX_DWG_INFER_SIZE = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { fileName, imageBase64, mimeType, mode, dwgStoragePath, keyword, fileNames, images } =
    await req.json();

  // 그룹 현장사진 업무일지는 사진 여러 장을 한 번에 받으므로 단일 파일명 요구사항 이전에 처리합니다.
  if (mode === "site-photo-work-log" && Array.isArray(fileNames) && Array.isArray(images)) {
    if (fileNames.length === 0 || images.length === 0) {
      return NextResponse.json(
        { error: "현장사진 업무일지 추론에는 이미지가 필요합니다." },
        { status: 400 }
      );
    }
    try {
      const workLog = await inferSitePhotoWorkLogFromImages(fileNames, images);
      return NextResponse.json(workLog);
    } catch (err) {
      console.error("infer-metadata (group) failed:", err);
      return NextResponse.json(
        { location: "", work_content: "", tags: [] },
        { status: 200 }
      );
    }
  }

  // 키워드 업무일지는 사진/파일이 없는 흐름이라 파일명 요구사항 이전에 처리합니다.
  if (mode === "keyword-work-log") {
    if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
      return NextResponse.json({ error: "키워드를 입력해주세요." }, { status: 400 });
    }
    try {
      const workLog = await inferWorkLogFromKeyword(keyword.trim());
      return NextResponse.json(workLog);
    } catch {
      return NextResponse.json(
        { location: keyword.trim(), work_content: "", tags: [] },
        { status: 200 }
      );
    }
  }

  if (!fileName || typeof fileName !== "string" || !fileName.trim()) {
    return NextResponse.json({ error: "파일명이 필요합니다." }, { status: 400 });
  }

  try {
    if (mode === "site-photo-work-log") {
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return NextResponse.json(
          { error: "현장사진 업무일지 추론에는 이미지가 필요합니다." },
          { status: 400 }
        );
      }

      const workLog = await inferSitePhotoWorkLogFromImage(
        fileName,
        imageBase64,
        mimeType || "image/jpeg"
      );
      return NextResponse.json(workLog);
    }

    if (dwgStoragePath && typeof dwgStoragePath === "string") {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // DWG는 클라이언트가 추론 전에 자신의 user id 폴더 밑에 먼저 올려두므로,
      // 요청자가 그 경로의 소유자인지 여기서 확인합니다(documents 행은 이 시점에
      // 아직 없으므로 documents 테이블로는 소유권을 판단할 수 없습니다).
      if (!user || !dwgStoragePath.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }

      const { data: blob } = await supabase.storage
        .from("documents")
        .download(dwgStoragePath);

      if (blob && blob.size > 0 && blob.size <= MAX_DWG_INFER_SIZE) {
        const buffer = Buffer.from(await blob.arrayBuffer());
        try {
          const dwgText = await extractDwgText(buffer);
          const metadata = dwgText.trim()
            ? await inferMetadataFromDwgText(fileName, dwgText)
            : await inferMetadataFromFileName(fileName);
          return NextResponse.json(metadata);
        } catch (err) {
          // dwgread 실패/타임아웃 시에도 업로드는 막지 않고 파일명 추론으로 대체
          console.error("DWG text extraction failed:", err);
          return NextResponse.json(await inferMetadataFromFileName(fileName));
        }
      }

      return NextResponse.json(await inferMetadataFromFileName(fileName));
    }

    const metadata =
      imageBase64 && typeof imageBase64 === "string"
        ? await inferMetadataFromImage(fileName, imageBase64, mimeType || "image/jpeg")
        : await inferMetadataFromFileName(fileName);
    return NextResponse.json(metadata);
  } catch (err) {
    console.error("infer-metadata failed:", err);
    if (mode === "site-photo-work-log") {
      return NextResponse.json(
        { location: "", work_content: "", tags: [] },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { site_name: null, description: "", is_site_photo: false, work_log_entry: null },
      { status: 200 }
    );
  }
}
