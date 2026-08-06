import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-clients/server";

export async function GET() {
  const supabase = await createClient();

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

  const results = await Promise.all(
    (documents || []).map(async (doc) => {
      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60 * 10);
      return { ...doc, url: urlData?.signedUrl || null };
    })
  );

  return NextResponse.json({ results });
}
