import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-clients/server";
import { findMatchingDocumentIndices } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { query } = await req.json();

  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "검색어를 입력해주세요." }, { status: 400 });
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
    return NextResponse.json({ results: [] });
  }

  let indices: number[] = [];
  try {
    indices = await findMatchingDocumentIndices(query, documents);
  } catch {
    return NextResponse.json(
      { error: "AI 검색 처리에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }

  const matched = indices
    .filter((i) => i >= 0 && i < documents.length)
    .map((i) => documents[i]);

  const results = await Promise.all(
    matched.map(async (doc) => {
      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60 * 10);
      return { ...doc, url: urlData?.signedUrl || null };
    })
  );

  return NextResponse.json({ results });
}
