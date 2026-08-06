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
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 검색으로 돌아가기
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          전체 문서
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          현장·구역명별로 묶어서 저장된 문서 전체를 보여줍니다 (총 {documents.length}개).
        </p>

        {state === "loading" && (
          <p className="mt-6 text-sm text-zinc-500">불러오는 중...</p>
        )}
        {state === "error" && (
          <p className="mt-6 text-sm text-red-600">{errorMessage}</p>
        )}
        {state === "done" && documents.length === 0 && (
          <p className="mt-6 text-sm text-zinc-500">아직 업로드된 문서가 없습니다.</p>
        )}

        {state === "done" &&
          groupNames.map((name) => (
            <div key={name} className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {name}
                <span className="ml-2 text-sm font-normal text-zinc-400">
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
