import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-clients/server";
import { inferRelatedDocuments } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { keyword } = await req.json();

  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    return NextResponse.json({ error: "현장명이나 키워드를 입력해주세요." }, { status: 400 });
  }

  const { data: documents, error } = await supabase
    .from("documents")
    .select("document_id, file_name, storage_path, description, site_name, file_size, uploaded_at")
    .order("uploaded_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "문서 목록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }

  if (!documents || documents.length === 0) {
    return NextResponse.json({ comment: "저장된 문서가 없습니다.", results: [] });
  }

  // 일반 검색과 다르게, 먼저 이 현장·구역과 무관하다고 확신할 수 있는 문서를 제외합니다.
  // site_name이 다른 현장으로 명시된 문서만 제외하고, site_name이 비어있는 문서는
  // (아직 태깅이 안 됐을 뿐 관련 있을 수 있으므로) 후보에 그대로 남겨서 Gemini가
  // 파일명·설명을 보고 직접 판단하게 합니다.
  const normalizedKeyword = keyword.trim().toLowerCase();
  const candidates = documents.filter((d) => {
    if (!d.site_name) return true;
    const site = d.site_name.toLowerCase();
    return site.includes(normalizedKeyword) || normalizedKeyword.includes(site);
  });
  const scopedToSite = candidates.length < documents.length;

  let comment = "";
  let indices: number[] = [];
  try {
    const inferred = await inferRelatedDocuments(keyword, candidates, scopedToSite);
    comment = inferred.comment;
    indices = inferred.indices;
  } catch {
    return NextResponse.json(
      { error: "AI 추론에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }

  const matched = indices
    .filter((i) => i >= 0 && i < candidates.length)
    .map((i) => candidates[i]);

  const results = await Promise.all(
    matched.map(async (doc) => {
      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60 * 10);
      return { ...doc, url: urlData?.signedUrl || null };
    })
  );

  return NextResponse.json({ comment, results });
}
