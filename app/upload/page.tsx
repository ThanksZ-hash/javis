"use client";

import { useRef, useState } from "react";
import Link from "next/link";

export default function UploadPage() {
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setStatus("error");
      setMessage("파일을 선택해주세요.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("description", description);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "업로드에 실패했습니다.");
        return;
      }

      setStatus("done");
      setMessage(`"${data.document.file_name}" 문서가 저장되었습니다.`);
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setStatus("error");
      setMessage("네트워크 오류로 업로드하지 못했습니다.");
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 검색으로 돌아가기
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          문서 업로드
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          나중에 자연어로 찾을 수 있도록, 문서와 간단한 설명을 함께 저장하세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              파일
            </label>
            <input
              ref={fileInputRef}
              type="file"
              className="mt-1 block w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 8월 발표할 때 쓴 분기 실적 자료"
              className="mt-1 block w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700"
              rows={3}
            />
          </div>

          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {status === "loading" ? "업로드 중..." : "업로드"}
          </button>

          {message && (
            <p
              className={`text-sm ${
                status === "error" ? "text-red-600" : "text-green-600"
              }`}
            >
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
