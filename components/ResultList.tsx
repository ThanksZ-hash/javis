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
            className="luxury-card rounded-xl p-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              {doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm font-medium text-[var(--luxury-text)] hover:text-[var(--luxury-accent-soft)]"
                >
                  {doc.file_name}
                </a>
              ) : (
                <span className="truncate text-sm font-medium text-[var(--luxury-text-muted)]">
                  {doc.file_name}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleBrief(doc.document_id)}
                className="luxury-btn-ghost shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
              >
                {brief?.loading
                  ? "요약 중..."
                  : brief?.brief || brief?.error
                  ? "요약 닫기"
                  : "AI 브리핑"}
              </button>
            </div>
            {doc.site_name && (
              <span className="luxury-badge mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide">
                {doc.site_name}
              </span>
            )}
            {doc.description && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
                {doc.description}
              </p>
            )}
            {brief?.brief && (
              <div className="mt-3 rounded-lg border border-[var(--luxury-border)] bg-black/20 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--luxury-accent-soft)]">
                  AI 브리핑
                </span>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--luxury-text)]">
                  {brief.brief}
                </p>
              </div>
            )}
            {brief?.error && (
              <p className="mt-2 text-sm text-rose-400">
                <span className="mr-1.5 font-semibold">오류</span>
                {brief.error}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
