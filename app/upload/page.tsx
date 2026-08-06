"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-clients/browser";

const supabase = createClient();

type UploadStatus = "pending" | "uploading" | "done" | "error";

type UploadItem = {
  file: File;
  siteName: string;
  description: string;
  inferring: boolean;
  status: UploadStatus;
  errorMessage?: string;
};

type SitePhotoItem = {
  file: File;
  location: string;
  workContent: string;
  tags: string;
  inferring: boolean;
  status: UploadStatus;
  sheetWritten?: boolean;
  errorMessage?: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function inferMetadata(file: File) {
  const isImage = file.type.startsWith("image/");
  const canAnalyzeImage = isImage && file.size < 3 * 1024 * 1024;

  const body: Record<string, string> = { fileName: file.name };
  if (canAnalyzeImage) {
    body.imageBase64 = await readFileAsBase64(file);
    body.mimeType = file.type;
  }

  const res = await fetch("/api/infer-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return res.ok ? data : { site_name: null, description: "" };
}

async function inferSitePhotoWorkLog(file: File) {
  if (!file.type.startsWith("image/")) {
    return { location: "", work_content: "", tags: [] };
  }

  if (file.size >= 3 * 1024 * 1024) {
    return { location: "", work_content: "", tags: [] };
  }

  const imageBase64 = await readFileAsBase64(file);
  const res = await fetch("/api/infer-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      imageBase64,
      mimeType: file.type,
      mode: "site-photo-work-log",
    }),
  });
  const data = await res.json();
  return res.ok ? data : { location: "", work_content: "", tags: [] };
}

function storagePathFor(file: File) {
  const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0] : "";
  return `${crypto.randomUUID()}${ext}`;
}

function currentWorkLogDateTime() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return { date, time };
}

function parseTags(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function sitePhotoDescription(item: SitePhotoItem) {
  const tags = parseTags(item.tags);
  const tagText = tags.length > 0 ? `태그: ${tags.join(", ")}\n` : "";
  return `${tagText}${item.workContent.trim()}`;
}

export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [sitePhotoItems, setSitePhotoItems] = useState<SitePhotoItem[]>([]);
  const [message, setMessage] = useState("");
  const [sitePhotoMessage, setSitePhotoMessage] = useState("");
  const [uploadingAll, setUploadingAll] = useState(false);
  const [uploadingSitePhotos, setUploadingSitePhotos] = useState(false);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems: UploadItem[] = files.map((file) => ({
      file,
      siteName: "",
      description: "",
      inferring: true,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...newItems]);
    setMessage("");

    newItems.forEach(async (item) => {
      try {
        const inferred = await inferMetadata(item.file);
        setItems((prev) =>
          prev.map((it) =>
            it.file === item.file
              ? {
                  ...it,
                  siteName: inferred.site_name || "",
                  description: inferred.description || "",
                  inferring: false,
                }
              : it
          )
        );
      } catch {
        setItems((prev) =>
          prev.map((it) => (it.file === item.file ? { ...it, inferring: false } : it))
        );
      }
    });

    e.target.value = "";
  }

  async function handleSitePhotosSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length === 0) return;

    const newItems: SitePhotoItem[] = files.map((file) => ({
      file,
      location: "",
      workContent: "",
      tags: "",
      inferring: true,
      status: "pending",
    }));
    setSitePhotoItems((prev) => [...prev, ...newItems]);
    setSitePhotoMessage("");

    newItems.forEach(async (item) => {
      try {
        const inferred = await inferSitePhotoWorkLog(item.file);
        setSitePhotoItems((prev) =>
          prev.map((it) =>
            it.file === item.file
              ? {
                  ...it,
                  location: inferred.location || "",
                  workContent: inferred.work_content || "",
                  tags: Array.isArray(inferred.tags) ? inferred.tags.join(", ") : "",
                  inferring: false,
                }
              : it
          )
        );
      } catch {
        setSitePhotoItems((prev) =>
          prev.map((it) => (it.file === item.file ? { ...it, inferring: false } : it))
        );
      }
    });

    e.target.value = "";
  }

  function updateItem(file: File, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.file === file ? { ...it, ...patch } : it)));
  }

  function updateSitePhotoItem(file: File, patch: Partial<SitePhotoItem>) {
    setSitePhotoItems((prev) =>
      prev.map((it) => (it.file === file ? { ...it, ...patch } : it))
    );
  }

  function removeItem(file: File) {
    setItems((prev) => prev.filter((it) => it.file !== file));
  }

  function removeSitePhotoItem(file: File) {
    setSitePhotoItems((prev) => prev.filter((it) => it.file !== file));
  }

  async function uploadOne(item: UploadItem) {
    const { file } = item;
    const storagePath = storagePathFor(file);

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: insertError } = await supabase.from("documents").insert({
      file_name: file.name,
      storage_path: storagePath,
      description: item.description,
      site_name: item.siteName,
      file_size: file.size,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  async function uploadOneSitePhoto(item: SitePhotoItem) {
    const { file } = item;
    const storagePath = storagePathFor(file);
    const { date, time } = currentWorkLogDateTime();
    const tags = parseTags(item.tags);

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("documents")
      .insert({
        file_name: file.name,
        storage_path: storagePath,
        description: sitePhotoDescription(item),
        site_name: item.location,
        file_size: file.size,
      })
      .select("document_id")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    const { error: logError } = await supabase.from("work_logs").insert({
      document_id: inserted?.document_id,
      site_name: item.location || null,
      log_date: date,
      content: item.workContent.trim(),
    });

    if (logError) {
      throw new Error(`업무일지 저장 실패: ${logError.message}`);
    }

    const sheetRes = await fetch("/api/work-log-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        time,
        location: item.location,
        work_content: item.workContent.trim(),
        tags,
        file_name: file.name,
        document_id: inserted?.document_id,
      }),
    });
    const sheetData = await sheetRes.json();

    if (!sheetRes.ok) {
      throw new Error(sheetData.error || "구글 시트 작성 실패");
    }

    return sheetData.written === true;
  }

  async function handleUploadAll() {
    const pending = items.filter((it) => it.status === "pending" || it.status === "error");
    if (pending.length === 0) {
      setMessage("업로드할 파일이 없습니다.");
      return;
    }

    setUploadingAll(true);
    setMessage("");

    let success = 0;
    let failed = 0;

    for (const item of pending) {
      updateItem(item.file, { status: "uploading", errorMessage: undefined });
      try {
        await uploadOne(item);
        updateItem(item.file, { status: "done" });
        success++;
      } catch (err) {
        updateItem(item.file, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "업로드 실패",
        });
        failed++;
      }
    }

    setUploadingAll(false);
    setMessage(
      failed === 0
        ? `${success}개 문서가 모두 저장되었습니다.`
        : `${success}개 성공, ${failed}개 실패했습니다. 실패한 항목은 다시 시도할 수 있습니다.`
    );
  }

  async function handleUploadSitePhotos() {
    const pending = sitePhotoItems.filter(
      (it) => it.status === "pending" || it.status === "error"
    );
    const incomplete = pending.find(
      (it) => !it.location.trim() || !it.workContent.trim()
    );

    if (pending.length === 0) {
      setSitePhotoMessage("업로드할 현장사진이 없습니다.");
      return;
    }

    if (incomplete) {
      setSitePhotoMessage("위치와 업무내용을 확인한 뒤 업로드해주세요.");
      return;
    }

    setUploadingSitePhotos(true);
    setSitePhotoMessage("");

    let success = 0;
    let failed = 0;
    let sheetWritten = 0;

    for (const item of pending) {
      updateSitePhotoItem(item.file, {
        status: "uploading",
        errorMessage: undefined,
        sheetWritten: undefined,
      });
      try {
        const written = await uploadOneSitePhoto(item);
        updateSitePhotoItem(item.file, { status: "done", sheetWritten: written });
        success++;
        if (written) sheetWritten++;
      } catch (err) {
        updateSitePhotoItem(item.file, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "현장사진 업로드 실패",
        });
        failed++;
      }
    }

    setUploadingSitePhotos(false);
    setSitePhotoMessage(
      failed === 0
        ? `${success}개 현장사진을 업무일지에 반영했습니다. 구글 시트 작성 ${sheetWritten}건.`
        : `${success}개 성공, ${failed}개 실패했습니다. 실패한 항목은 다시 시도할 수 있습니다.`
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-2xl">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 검색으로 돌아가기
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          문서 업로드
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          여러 파일을 한꺼번에 선택하면 AI가 현장명·설명을 자동으로 채워줍니다.
          내용을 확인·수정한 뒤 한 번에 업로드하세요.
        </p>

        <input
          type="file"
          multiple
          onChange={handleFilesSelected}
          className="mt-6 block w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700"
        />

        {items.length > 0 && (
          <ul className="mt-6 flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.file.name + item.file.size + item.file.lastModified}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {item.file.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.status === "done" && (
                      <span className="text-xs text-green-600">완료</span>
                    )}
                    {item.status === "uploading" && (
                      <span className="text-xs text-zinc-400">업로드 중...</span>
                    )}
                    {item.status !== "done" && item.status !== "uploading" && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.file)}
                        className="text-xs text-zinc-400 hover:text-red-600"
                      >
                        제거
                      </button>
                    )}
                  </div>
                </div>

                {item.inferring ? (
                  <p className="mt-2 text-xs text-zinc-400">AI가 추론하는 중...</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      type="text"
                      value={item.siteName}
                      onChange={(e) => updateItem(item.file, { siteName: e.target.value })}
                      placeholder="현장·구역명 (선택)"
                      disabled={item.status === "done" || item.status === "uploading"}
                      className="rounded-md border border-zinc-300 p-1.5 text-sm dark:border-zinc-700"
                    />
                    <textarea
                      value={item.description}
                      onChange={(e) => updateItem(item.file, { description: e.target.value })}
                      placeholder="설명 (선택)"
                      rows={2}
                      disabled={item.status === "done" || item.status === "uploading"}
                      className="rounded-md border border-zinc-300 p-1.5 text-sm dark:border-zinc-700"
                    />
                  </div>
                )}

                {item.status === "error" && (
                  <p className="mt-1 text-xs text-red-600">{item.errorMessage}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <button
            type="button"
            onClick={handleUploadAll}
            disabled={uploadingAll}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {uploadingAll ? "업로드 중..." : `전체 업로드 (${items.length}개)`}
          </button>
        )}

        {message && <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>}

        <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            현장사진 업무일지
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            사진을 여러 장 선택하면 AI가 위치와 업무내용을 추론합니다. 확인 후 업로드하면
            업무일지 테이블과 구글 시트 작성 API에 함께 반영됩니다.
          </p>

          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleSitePhotosSelected}
            className="mt-6 block w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700"
          />

          {sitePhotoItems.length > 0 && (
            <ul className="mt-6 flex flex-col gap-3">
              {sitePhotoItems.map((item) => (
                <li
                  key={item.file.name + item.file.size + item.file.lastModified}
                  className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {item.file.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {item.status === "done" && (
                        <span className="text-xs text-green-600">
                          {item.sheetWritten ? "시트 작성 완료" : "업무일지 저장 완료"}
                        </span>
                      )}
                      {item.status === "uploading" && (
                        <span className="text-xs text-zinc-400">반영 중...</span>
                      )}
                      {item.status !== "done" && item.status !== "uploading" && (
                        <button
                          type="button"
                          onClick={() => removeSitePhotoItem(item.file)}
                          className="text-xs text-zinc-400 hover:text-red-600"
                        >
                          제거
                        </button>
                      )}
                    </div>
                  </div>

                  {item.inferring ? (
                    <p className="mt-2 text-xs text-zinc-400">
                      사진에서 위치와 업무내용을 추론하는 중...
                    </p>
                  ) : (
                    <div className="mt-2 grid gap-2">
                      <input
                        type="text"
                        value={item.location}
                        onChange={(e) =>
                          updateSitePhotoItem(item.file, { location: e.target.value })
                        }
                        placeholder="위치 예: 201동 지하 1층"
                        disabled={item.status === "done" || item.status === "uploading"}
                        className="rounded-md border border-zinc-300 p-1.5 text-sm dark:border-zinc-700"
                      />
                      <textarea
                        value={item.workContent}
                        onChange={(e) =>
                          updateSitePhotoItem(item.file, { workContent: e.target.value })
                        }
                        placeholder="업무내용 예: 피복두께 불량 확인 및 시정 조치 후 재확인 및 보고 지시"
                        rows={2}
                        disabled={item.status === "done" || item.status === "uploading"}
                        className="rounded-md border border-zinc-300 p-1.5 text-sm dark:border-zinc-700"
                      />
                      <input
                        type="text"
                        value={item.tags}
                        onChange={(e) =>
                          updateSitePhotoItem(item.file, { tags: e.target.value })
                        }
                        placeholder="자동 태그 예: 201동, 지하1층, 철근, 피복두께, 시정지시"
                        disabled={item.status === "done" || item.status === "uploading"}
                        className="rounded-md border border-zinc-300 p-1.5 text-sm dark:border-zinc-700"
                      />
                    </div>
                  )}

                  {item.status === "error" && (
                    <p className="mt-1 text-xs text-red-600">{item.errorMessage}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {sitePhotoItems.length > 0 && (
            <button
              type="button"
              onClick={handleUploadSitePhotos}
              disabled={uploadingSitePhotos}
              className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {uploadingSitePhotos
                ? "업무일지 반영 중..."
                : `현장사진 업무일지 반영 (${sitePhotoItems.length}개)`}
            </button>
          )}

          {sitePhotoMessage && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {sitePhotoMessage}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
