import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { findMatchingDocumentIndices } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "검색어를 입력해주세요." }, { status: 400 });
  }

  const { data: documents, error } = await supabase
    .from("documents")
    .select("document_id, file_name, storage_path, description, file_size, uploaded_at")
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

  const results = matched.map((doc) => {
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(doc.storage_path);
    return { ...doc, url: urlData.publicUrl };
  });

  return NextResponse.json({ results });
}
