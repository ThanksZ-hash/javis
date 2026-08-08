import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-clients/server";
import { summarizeFromInlineData, summarizeFromText } from "@/lib/gemini";
import { extractHwpText, isBinaryHwp, HwpUnsupportedError } from "@/lib/hwp";
import { extractDwgText, extractDxfText } from "@/lib/dwg";

// PDF·이미지는 Gemini가 원본을 직접 보고 요약합니다 (업로드 자동 태깅과 동일한 방식).
// 스프레드시트(xlsx 등)는 계좌번호·급여 같은 개인정보가 표 형태로 그대로 들어있는 경우가 많아,
// 검색 결과만으로 누구나 요약을 볼 수 있는 지금 구조에서는 위험이 커서 지원하지 않습니다.
const INLINE_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const HWP_EXTENSION = ".hwp";
const DWG_EXTENSION = ".dwg";
const DXF_EXTENSION = ".dxf";

// 파일 하나가 지나치게 크면 Gemini 호출이 느려지거나 실패할 수 있어 요약 대상에서 제외합니다.
const MAX_BRIEF_FILE_SIZE = 15 * 1024 * 1024;

// 실측: 69.7MB 도면도 dwgread 변환 4.5초 수준이라 infer-metadata와 동일하게 100MB로 맞춥니다.
const MAX_DWG_BRIEF_FILE_SIZE = 100 * 1024 * 1024;

function getExtension(fileName: string) {
  const match = fileName.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0].toLowerCase() : "";
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { document_id } = await req.json();

  if (!document_id || typeof document_id !== "string") {
    return NextResponse.json({ error: "document_id가 필요합니다." }, { status: 400 });
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("file_name, storage_path, description, site_name, file_size")
    .eq("document_id", document_id)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const ext = getExtension(doc.file_name);
  const mimeType = INLINE_MIME_TYPES[ext];

  const isDwgOrDxf = ext === DWG_EXTENSION || ext === DXF_EXTENSION;

  if (!mimeType && ext !== HWP_EXTENSION && !isDwgOrDxf) {
    return NextResponse.json({
      supported: false,
      brief: "AI 브리핑은 현재 PDF, 이미지, HWP, DWG, DXF 파일만 지원합니다.",
    });
  }

  if (isDwgOrDxf) {
    if (doc.file_size && doc.file_size > MAX_DWG_BRIEF_FILE_SIZE) {
      return NextResponse.json({
        supported: false,
        brief: "도면 파일이 너무 커서 자동 요약을 지원하지 않습니다. 직접 열어서 확인해주세요.",
      });
    }
  } else if (doc.file_size && doc.file_size > MAX_BRIEF_FILE_SIZE) {
    return NextResponse.json({
      supported: false,
      brief: "파일이 너무 커서 자동 요약을 지원하지 않습니다. 직접 열어서 확인해주세요.",
    });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { error: "파일을 불러오지 못했습니다." },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  try {
    if (mimeType) {
      const brief = await summarizeFromInlineData(
        doc.file_name,
        buffer.toString("base64"),
        mimeType
      );
      return NextResponse.json({ supported: true, brief });
    }

    if (isDwgOrDxf) {
      let text = "";
      try {
        text = ext === DWG_EXTENSION ? await extractDwgText(buffer) : await extractDxfText(buffer);
      } catch (err) {
        console.error("DWG/DXF text extraction failed:", err);
        return NextResponse.json({
          supported: false,
          brief: "도면에서 텍스트를 추출하지 못했습니다.",
        });
      }
      if (!text.trim()) {
        return NextResponse.json({
          supported: false,
          brief: "이 도면에서 요약할 텍스트를 찾지 못했습니다.",
        });
      }
      const brief = await summarizeFromText(doc.file_name, text);
      return NextResponse.json({ supported: true, brief });
    }

    // .hwp: 실제로는 한글 프로그램이 내보낸 HTML인 경우도 있어 시그니처로 먼저 구분합니다.
    if (isBinaryHwp(buffer)) {
      let text = "";
      try {
        text = await extractHwpText(buffer);
      } catch (err) {
        if (err instanceof HwpUnsupportedError) {
          return NextResponse.json({
            supported: false,
            brief: `이 HWP 문서는 지원하지 않는 형식입니다. (${err.message})`,
          });
        }
        text = "";
      }
      if (!text.trim()) {
        return NextResponse.json({
          supported: false,
          brief:
            "이 HWP 문서는 표·그림 위주라 지금 방식으로는 텍스트를 추출하지 못했습니다.",
        });
      }
      const brief = await summarizeFromText(doc.file_name, text);
      return NextResponse.json({ supported: true, brief });
    }

    const htmlText = stripHtmlTags(buffer.toString("utf-8"));
    if (!htmlText) {
      return NextResponse.json({
        supported: false,
        brief: "문서에서 읽을 수 있는 내용이 없습니다.",
      });
    }
    const brief = await summarizeFromText(doc.file_name, htmlText);
    return NextResponse.json({ supported: true, brief });
  } catch {
    return NextResponse.json(
      { error: "AI 요약에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }
}
