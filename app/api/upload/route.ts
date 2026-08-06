import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const description = (formData.get("description") as string) || "";

  if (!file) {
    return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
  }

  const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0] : "";
  const storagePath = `${crypto.randomUUID()}${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    console.error("Storage upload failed:", uploadError);
    return NextResponse.json(
      { error: `업로드에 실패했습니다: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data, error: insertError } = await supabase
    .from("documents")
    .insert({
      file_name: file.name,
      storage_path: storagePath,
      description,
      file_size: file.size,
    })
    .select()
    .single();

  if (insertError) {
    console.error("documents insert failed:", insertError);
    return NextResponse.json(
      { error: `문서 정보 저장에 실패했습니다: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ document: data });
}
