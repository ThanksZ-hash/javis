import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const description = (formData.get("description") as string) || "";

  if (!file) {
    return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
  }

  const storagePath = `${Date.now()}-${file.name}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "업로드에 실패했습니다. 잠시 후 다시 시도해주세요." },
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
    return NextResponse.json(
      { error: "문서 정보 저장에 실패했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ document: data });
}
