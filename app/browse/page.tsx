"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ResultList, type SearchResult } from "@/components/ResultList";

type LoadState = "loading" | "done" | "error";

const UNCATEGORIZED = "미분류";

export default function BrowsePage() {
  const [documents, setDocuments] = useState<SearchResult[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/api/documents")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error || "문서 목록을 불러오지 못했습니다.");
          setState("error");
          return;
        }
        setDocuments(data.results);
        setState("done");
      })
      .catch(() => {
        setErrorMessage("네트워크 오류로 문서 목록을 불러오지 못했습니다.");
        setState("error");
      });
  }, []);

  const groups = documents.reduce<Record<string, SearchResult[]>>((acc, doc) => {
    const key = doc.site_name || UNCATEGORIZED;
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  // 미분류는 맨 뒤로, 나머지는 이름순으로 정렬합니다.
  const groupNames = Object.keys(groups).sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="luxury-surface flex flex-col flex-1 items-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/help" className="luxury-link text-sm">
          ← 시작하기
        </Link>
        <h1 className="mt-4 font-serif text-2xl font-medium tracking-wide text-[var(--luxury-text)]">
          전체 문서
        </h1>
        <p className="mt-1 text-sm text-[var(--luxury-text-muted)]">
          현장·구역명별로 묶어서 저장된 문서 전체를 보여줍니다 (총 {documents.length}개).
        </p>

        {state === "loading" && (
          <p className="mt-6 text-sm text-[var(--luxury-text-muted)]">불러오는 중...</p>
        )}
        {state === "error" && (
          <p className="mt-6 text-sm text-rose-400">
            <span className="mr-1 font-semibold">오류</span>
            {errorMessage}
          </p>
        )}
        {state === "done" && documents.length === 0 && (
          <p className="mt-6 text-sm text-[var(--luxury-text-muted)]">
            <span className="mr-1 font-semibold text-[var(--luxury-accent-soft)]">안내</span>
            아직 업로드된 문서가 없습니다.
          </p>
        )}

        {state === "done" &&
          groupNames.map((name) => (
            <div key={name} className="mt-8">
              <h2 className="font-serif text-lg font-medium text-[var(--luxury-text)]">
                {name}
                <span className="ml-2 text-sm font-normal text-[var(--luxury-text-muted)]">
                  {groups[name].length}개
                </span>
              </h2>
              <ResultList results={groups[name]} />
            </div>
          ))}
      </div>
    </div>
  );
}
