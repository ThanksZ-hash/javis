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
    <div className="luxury-surface flex flex-col flex-1 items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <Link href="/help" className="luxury-link text-sm">
          ← 시작하기
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-medium tracking-wide text-[var(--luxury-text)]">
          javis
        </h1>
        <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-[var(--luxury-text-muted)]">
          문서 검색
        </p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
          찾고 싶은 문서를 자연어로 설명해보세요. 예: &quot;저번 발표 자료&quot;
        </p>

        <form onSubmit={handleSearch} className="mt-5 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="찾는 문서를 설명해주세요"
            className="luxury-input flex-1 rounded-lg px-3.5 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="luxury-btn-primary shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state === "loading" ? "검색 중..." : "검색"}
          </button>
        </form>

        {state === "error" && (
          <p className="mt-4 text-sm text-rose-400">
            <span className="mr-1.5 font-semibold text-rose-400">오류</span>
            {errorMessage}
          </p>
        )}
        {state === "empty" && (
          <p className="mt-4 text-sm text-[var(--luxury-text-muted)]">
            <span className="mr-1.5 font-semibold text-[var(--luxury-accent-soft)]">안내</span>
            일치하는 문서가 없습니다. 다른 표현으로 다시 검색해보세요.
          </p>
        )}
        {state === "done" && <ResultList results={results} />}

        <hr className="luxury-divider mt-10" />

        <div className="mt-8">
          <h2 className="font-serif text-lg font-medium tracking-wide text-[var(--luxury-text)]">
            연관검색
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
            현장·구역명이나 짧은 키워드만 입력하면, AI가 관련 업무를 추론해서 문서를 찾아줍니다.
            예: &quot;201동&quot;
          </p>

          <form onSubmit={handleRelatedSearch} className="mt-4 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 201동"
              className="luxury-input flex-1 rounded-lg px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={relatedState === "loading"}
              className="luxury-btn-primary shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {relatedState === "loading" ? "추론 중..." : "연관검색"}
            </button>
          </form>

          {relatedState === "error" && (
            <p className="mt-4 text-sm text-rose-400">
              <span className="mr-1.5 font-semibold text-rose-400">오류</span>
              {relatedError}
            </p>
          )}

          {relatedComment && (
            <p className="mt-4 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
              {relatedComment}
            </p>
          )}

          {relatedState === "empty" && !relatedComment && (
            <p className="mt-4 text-sm text-[var(--luxury-text-muted)]">
              <span className="mr-1.5 font-semibold text-[var(--luxury-accent-soft)]">안내</span>
              관련 문서를 찾지 못했습니다.
            </p>
          )}

          {relatedState === "done" && <ResultList results={relatedResults} />}
        </div>
      </div>
    </div>
  );
}
