"use client";

import { useState } from "react";
import Link from "next/link";

type SearchResult = {
  document_id: string;
  file_name: string;
  description: string | null;
  file_size: number | null;
  uploaded_at: string;
  url: string;
};

type SearchState = "idle" | "loading" | "done" | "error" | "empty";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

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

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            javis 문서 검색
          </h1>
          <Link href="/upload" className="text-sm text-zinc-500 hover:underline">
            + 문서 업로드
          </Link>
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

        {state === "done" && (
          <ul className="mt-6 flex flex-col gap-3">
            {results.map((doc) => (
              <li
                key={doc.document_id}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {doc.file_name}
                </a>
                {doc.description && (
                  <p className="mt-1 text-sm text-zinc-500">{doc.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
