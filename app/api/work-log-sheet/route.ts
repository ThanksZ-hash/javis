import { NextRequest, NextResponse } from "next/server";

type WorkLogSheetPayload = {
  date: string;
  time: string;
  location: string;
  work_content: string;
  tags: string[];
  // 키워드 입력 기록은 사진/파일이 없으므로 file_name이 없을 수 있습니다.
  file_name?: string;
  document_id?: string;
};

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as Partial<WorkLogSheetPayload>;

  if (!payload.location || !payload.work_content) {
    return NextResponse.json(
      { error: "위치와 업무내용이 필요합니다." },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({
      written: false,
      reason: "GOOGLE_SHEETS_WEBHOOK_URL is not configured",
    });
  }

  const sheetRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: payload.date,
      time: payload.time,
      location: payload.location,
      work_content: payload.work_content,
      tags: payload.tags || [],
      file_name: payload.file_name || "",
      document_id: payload.document_id,
    }),
  });
  const responseText = await sheetRes.text();

  if (!sheetRes.ok) {
    return NextResponse.json(
      { error: "구글 시트 작성에 실패했습니다." },
      { status: 502 }
    );
  }

  try {
    const data = JSON.parse(responseText) as { ok?: boolean };
    if (data.ok !== true) {
      return NextResponse.json(
        { error: "구글 시트 웹훅이 성공 응답을 반환하지 않았습니다." },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "구글 시트 웹훅 응답을 확인할 수 없습니다. Apps Script 배포를 확인해주세요." },
      { status: 502 }
    );
  }

  return NextResponse.json({ written: true });
}
