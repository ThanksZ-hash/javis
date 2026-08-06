import { NextRequest, NextResponse } from "next/server";
import {
  inferMetadataFromFileName,
  inferMetadataFromImage,
  inferSitePhotoWorkLogFromImage,
} from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { fileName, imageBase64, mimeType, mode } = await req.json();

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

    const metadata =
      imageBase64 && typeof imageBase64 === "string"
        ? await inferMetadataFromImage(fileName, imageBase64, mimeType || "image/jpeg")
        : await inferMetadataFromFileName(fileName);
    return NextResponse.json(metadata);
  } catch {
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
