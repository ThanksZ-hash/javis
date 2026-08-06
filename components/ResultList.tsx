"use client";

import { useState } from "react";

export type SearchResult = {
  document_id: string;
  file_name: string;
  description: string | null;
  site_name: string | null;
  file_size: number | null;
  uploaded_at: string;
  url: string | null;
};

type BriefState = {
  loading: boolean;
  brief?: string;
  error?: string;
};

export function ResultList({ results }: { results: SearchResult[] }) {
  const [briefs, setBriefs] = useState<Record<string, BriefState>>({});

  async function handleBrief(documentId: string) {
    const current = briefs[documentId];
    if (current?.loading) return;

    // 이미 요약을 열어본 적이 있으면 다시 요청하지 않고 토글만 합니다.
    if (current?.brief || current?.error) {
      setBriefs((prev) => {
        const next = { ...prev };
        delete next[documentId];
        return next;
      });
      return;
    }

    setBriefs((prev) => ({ ...prev, [documentId]: { loading: true } }));
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBriefs((prev) => ({
          ...prev,
          [documentId]: { loading: false, error: data.error || "요약에 실패했습니다." },
        }));
        return;
      }
      setBriefs((prev) => ({ ...prev, [documentId]: { loading: false, brief: data.brief } }));
    } catch {
      setBriefs((prev) => ({
        ...prev,
        [documentId]: { loading: false, error: "네트워크 오류로 요약하지 못했습니다." },
      }));
    }
  }

  return (
    <ul className="mt-4 flex flex-col gap-3">
      {results.map((doc) => {
        const brief = briefs[doc.document_id];
        return (
          <li
            key={doc.document_id}
            className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between gap-2">
              {doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {doc.file_name}
                </a>
              ) : (
                <span className="truncate font-medium text-zinc-400">{doc.file_name}</span>
              )}
              <button
                type="button"
                onClick={() => handleBrief(doc.document_id)}
                className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {brief?.loading
                  ? "요약 중..."
                  : brief?.brief || brief?.error
                  ? "요약 닫기"
                  : "AI 브리핑"}
              </button>
            </div>
            {doc.site_name && (
              <span className="mt-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                {doc.site_name}
              </span>
            )}
            {doc.description && (
              <p className="mt-1 text-sm text-zinc-500">{doc.description}</p>
            )}
            {brief?.brief && (
              <p className="mt-2 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {brief.brief}
              </p>
            )}
            {brief?.error && (
              <p className="mt-2 text-sm text-red-600">{brief.error}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
