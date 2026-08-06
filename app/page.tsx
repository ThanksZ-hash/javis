"use client";

import { useState } from "react";
import Link from "next/link";
import { ResultList, type SearchResult } from "@/components/ResultList";

type RequestState = "idle" | "loading" | "done" | "error" | "empty";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [keyword, setKeyword] = useState("");
  const [relatedResults, setRelatedResults] = useState<SearchResult[]>([]);
  const [relatedComment, setRelatedComment] = useState("");
  const [relatedState, setRelatedState] = useState<RequestState>("idle");
  const [relatedError, setRelatedError] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    if (!query.trim()) {
      setState("error");
      setErrorMessage("검색어를 입력해주세요.");
      return;
    }

    setState("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setErrorMessage(data.error || "검색에 실패했습니다.");
        return;
      }

      setResults(data.results);
      setState(data.results.length === 0 ? "empty" : "done");
    } catch {
      setState("error");
      setErrorMessage("네트워크 오류로 검색하지 못했습니다.");
    }
  }

  async function handleRelatedSearch(e: React.FormEvent) {
    e.preventDefault();

    if (!keyword.trim()) {
      setRelatedState("error");
      setRelatedError("현장명이나 키워드를 입력해주세요.");
      return;
    }

    setRelatedState("loading");
    setRelatedError("");
    setRelatedComment("");

    try {
      const res = await fetch("/api/related-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRelatedState("error");
        setRelatedError(data.error || "연관검색에 실패했습니다.");
        return;
      }

      setRelatedComment(data.comment || "");
      setRelatedResults(data.results);
      setRelatedState(data.results.length === 0 ? "empty" : "done");
    } catch {
      setRelatedState("error");
      setRelatedError("네트워크 오류로 연관검색하지 못했습니다.");
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            javis 문서 검색
          </h1>
          <div className="flex items-center gap-3">
            <Link href="/browse" className="text-sm text-zinc-500 hover:underline">
              전체 문서
            </Link>
            <Link href="/upload" className="text-sm text-zinc-500 hover:underline">
              + 문서 업로드
            </Link>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="text-sm text-zinc-500 hover:underline"
            >
              로그아웃
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          찾고 싶은 문서를 자연어로 설명해보세요. 예: &quot;저번 발표 자료&quot;
        </p>

        <form onSubmit={handleSearch} className="mt-6 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="찾는 문서를 설명해주세요"
            className="flex-1 rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {state === "loading" ? "검색 중..." : "검색"}
          </button>
        </form>

        {state === "error" && (
          <p className="mt-4 text-sm text-red-600">{errorMessage}</p>
        )}
        {state === "empty" && (
          <p className="mt-4 text-sm text-zinc-500">
            일치하는 문서가 없습니다. 다른 표현으로 다시 검색해보세요.
          </p>
        )}
        {state === "done" && <ResultList results={results} />}

        <hr className="mt-8 border-zinc-200 dark:border-zinc-800" />

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            연관검색
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            현장·구역명이나 짧은 키워드만 입력하면, AI가 관련 업무를 추론해서 문서를 찾아줍니다.
            예: &quot;201동&quot;
          </p>

          <form onSubmit={handleRelatedSearch} className="mt-4 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 201동"
              className="flex-1 rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700"
            />
            <button
              type="submit"
              disabled={relatedState === "loading"}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {relatedState === "loading" ? "추론 중..." : "연관검색"}
            </button>
          </form>

          {relatedState === "error" && (
            <p className="mt-4 text-sm text-red-600">{relatedError}</p>
          )}

          {relatedComment && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {relatedComment}
            </p>
          )}

          {relatedState === "empty" && !relatedComment && (
            <p className="mt-4 text-sm text-zinc-500">
              관련 문서를 찾지 못했습니다.
            </p>
          )}

          {relatedState === "done" && <ResultList results={relatedResults} />}
        </div>
      </div>
    </div>
  );
}
