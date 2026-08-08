"use client";

import { useState } from "react";
import Link from "next/link";
import exifr from "exifr";
import { createClient } from "@/lib/supabase-clients/browser";

const supabase = createClient();

// 촬영시각 간격이 이 범위(분) 안이면 같은 업무 상황으로 보고 하나의 그룹으로 묶습니다.
const GROUP_GAP_MINUTES = 10;
// 그룹당 Gemini에 보내는 이미지 수 상한 (요청 페이로드 상한 때문에 제한).
const MAX_GROUP_IMAGES = 4;

type UploadStatus = "pending" | "uploading" | "done" | "error";

type UploadItem = {
  file: File;
  siteName: string;
  description: string;
  inferring: boolean;
  status: UploadStatus;
  errorMessage?: string;
  // DWG는 추론 전에 먼저 Storage에 올려두고 여기 채워집니다 (uploadOne에서 재업로드 방지).
  storagePath?: string;
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

type SitePhotoGroup = {
  id: string;
  photos: SitePhotoItem[];
  location: string;
  workContent: string;
  tags: string;
  inferring: boolean;
  status: UploadStatus;
  sheetWritten?: boolean;
  errorMessage?: string;
  hasExifTime: boolean;
};

type KeywordLogItem = {
  id: string;
  keyword: string;
  location: string;
  workContent: string;
  tags: string;
  inferring: boolean;
  status: UploadStatus;
  sheetWritten?: boolean;
  errorMessage?: string;
};

function readFileAsBase64(file: File | Blob): Promise<string> {
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

// 폰 카메라 사진은 보통 몇 MB~십몇 MB라, Vercel 함수 요청 본문 제한(4.5MB)에 안전하게
// 걸리도록 AI 분석용으로만 리사이즈·재압축한 사본을 만듭니다. Storage에 실제로 저장되는
// 원본 파일(item.file)은 그대로 두고, 이 압축본은 Gemini 호출에만 씁니다.
async function compressImageForInference(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<{ base64: string; mimeType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context 생성 실패");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) throw new Error("이미지 압축 실패");

    const base64 = await readFileAsBase64(blob);
    return { base64, mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function isDwgFile(file: File) {
  return /\.dwg$/i.test(file.name);
}

// DWG는 원본을 그대로 추론 API에 실어보내면 Vercel 요청 본문 제한(4.5MB)에 걸리기
// 쉬워서, 이미지 압축 대신 Storage에 먼저 올리고 storage_path만 서버에 넘깁니다.
// 이 시점엔 documents 행이 아직 없으므로(추론 후에 insert), 서버가 소유권을
// 확인할 수 있도록 경로 앞에 업로더의 user id를 붙여둡니다.
async function uploadDwgForInference(file: File): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const storagePath = `${user.id}/${storagePathFor(file)}`;
  const { error } = await supabase.storage.from("documents").upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  return storagePath;
}

async function inferMetadata(file: File, dwgStoragePath?: string) {
  const isImage = file.type.startsWith("image/");
  const body: Record<string, string> = { fileName: file.name };

  if (isImage) {
    try {
      const { base64, mimeType } = await compressImageForInference(file);
      body.imageBase64 = base64;
      body.mimeType = mimeType;
    } catch {
      // 압축이 실패해도 파일명 기반 추론은 계속 시도합니다.
    }
  } else if (dwgStoragePath) {
    body.dwgStoragePath = dwgStoragePath;
  }

  const res = await fetch("/api/infer-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return res.ok ? data : { site_name: null, description: "" };
}

async function inferSitePhotoWorkLogGroup(files: File[]) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    return { location: "", work_content: "", tags: [], error: "이미지 파일만 지원합니다." };
  }

  // 페이로드 상한 때문에 그룹당 앞쪽 MAX_GROUP_IMAGES장만 AI에 보냅니다.
  const targetFiles = imageFiles.slice(0, MAX_GROUP_IMAGES);

  let compressed: { base64: string; mimeType: string }[];
  try {
    compressed = await Promise.all(
      targetFiles.map((file) => compressImageForInference(file))
    );
  } catch {
    return {
      location: "",
      work_content: "",
      tags: [],
      error: "사진을 처리하지 못했습니다. 다른 사진으로 다시 시도해주세요.",
    };
  }

  try {
    const res = await fetch("/api/infer-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileNames: targetFiles.map((file) => file.name),
        images: compressed.map((c) => ({ base64Data: c.base64, mimeType: c.mimeType })),
        mode: "site-photo-work-log",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { location: "", work_content: "", tags: [], error: data.error || "AI 추론에 실패했습니다." };
    }
    return data;
  } catch {
    return {
      location: "",
      work_content: "",
      tags: [],
      error: "네트워크 오류로 AI 추론에 실패했습니다.",
    };
  }
}

async function inferKeywordWorkLog(keyword: string) {
  try {
    const res = await fetch("/api/infer-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, mode: "keyword-work-log" }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { location: keyword, work_content: "", tags: [], error: data.error || "AI 추론에 실패했습니다." };
    }
    return data;
  } catch {
    return {
      location: keyword,
      work_content: "",
      tags: [],
      error: "네트워크 오류로 AI 추론에 실패했습니다.",
    };
  }
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

function sitePhotoDescription(item: { tags: string; workContent: string }) {
  const tags = parseTags(item.tags);
  const tagText = tags.length > 0 ? `태그: ${tags.join(", ")}\n` : "";
  return `${tagText}${item.workContent.trim()}`;
}

async function getExifDateTime(file: File): Promise<Date | null> {
  try {
    const exif = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
    const value = exif?.DateTimeOriginal || exif?.CreateDate;
    return value instanceof Date ? value : null;
  } catch {
    return null;
  }
}

// 실제 폰 사진 상당수는 DateTimeOriginal이 없으므로, 촬영시각이 있는 사진끼리만
// 시간순으로 묶고 없는 사진은 각각 단일 그룹으로 처리합니다.
async function groupPhotosByExifTime(
  files: File[]
): Promise<{ files: File[]; hasExifTime: boolean }[]> {
  const withTime: { file: File; time: Date }[] = [];
  const withoutTime: File[] = [];

  for (const file of files) {
    const time = await getExifDateTime(file);
    if (time) {
      withTime.push({ file, time });
    } else {
      withoutTime.push(file);
    }
  }

  withTime.sort((a, b) => a.time.getTime() - b.time.getTime());

  const groups: { files: File[]; hasExifTime: boolean }[] = [];
  let currentGroup: File[] = [];
  let previousTime: Date | null = null;

  for (const { file, time } of withTime) {
    if (
      previousTime &&
      (time.getTime() - previousTime.getTime()) / 60000 <= GROUP_GAP_MINUTES
    ) {
      currentGroup.push(file);
    } else {
      if (currentGroup.length > 0) {
        groups.push({ files: currentGroup, hasExifTime: true });
      }
      currentGroup = [file];
    }
    previousTime = time;
  }
  if (currentGroup.length > 0) {
    groups.push({ files: currentGroup, hasExifTime: true });
  }

  for (const file of withoutTime) {
    groups.push({ files: [file], hasExifTime: false });
  }

  return groups;
}

export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [sitePhotoGroups, setSitePhotoGroups] = useState<SitePhotoGroup[]>([]);
  const [message, setMessage] = useState("");
  const [sitePhotoMessage, setSitePhotoMessage] = useState("");
  const [uploadingAll, setUploadingAll] = useState(false);
  const [uploadingSitePhotos, setUploadingSitePhotos] = useState(false);

  const [keywordInput, setKeywordInput] = useState("");
  const [keywordItems, setKeywordItems] = useState<KeywordLogItem[]>([]);
  const [keywordMessage, setKeywordMessage] = useState("");
  const [uploadingKeywords, setUploadingKeywords] = useState(false);
  const hasSitePhotoSheetWritten = sitePhotoGroups.some(
    (group) => group.status === "done" && group.sheetWritten
  );
  const hasKeywordSheetWritten = keywordItems.some(
    (item) => item.status === "done" && item.sheetWritten
  );

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
        let dwgStoragePath: string | undefined;
        if (isDwgFile(item.file)) {
          try {
            dwgStoragePath = await uploadDwgForInference(item.file);
            setItems((prev) =>
              prev.map((it) => (it.file === item.file ? { ...it, storagePath: dwgStoragePath } : it))
            );
          } catch {
            // Storage 선업로드가 실패해도 파일명 기반 추론은 계속 시도합니다.
          }
        }

        const inferred = await inferMetadata(item.file, dwgStoragePath);
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

    setSitePhotoMessage("");
    const groupedFiles = await groupPhotosByExifTime(files);

    const newGroups: SitePhotoGroup[] = groupedFiles.map(({ files: groupFiles, hasExifTime }) => ({
      id: crypto.randomUUID(),
      photos: groupFiles.map((file) => ({
        file,
        location: "",
        workContent: "",
        tags: "",
        inferring: true,
        status: "pending",
      })),
      location: "",
      workContent: "",
      tags: "",
      inferring: true,
      status: "pending",
      hasExifTime,
    }));
    setSitePhotoGroups((prev) => [...prev, ...newGroups]);

    newGroups.forEach(async (group) => {
      try {
        const inferred = await inferSitePhotoWorkLogGroup(group.photos.map((p) => p.file));
        setSitePhotoGroups((prev) =>
          prev.map((g) =>
            g.id === group.id
              ? {
                  ...g,
                  location: inferred.location || "",
                  workContent: inferred.work_content || "",
                  tags: Array.isArray(inferred.tags) ? inferred.tags.join(", ") : "",
                  inferring: false,
                  errorMessage: inferred.error,
                }
              : g
          )
        );
      } catch {
        setSitePhotoGroups((prev) =>
          prev.map((g) =>
            g.id === group.id
              ? {
                  ...g,
                  inferring: false,
                  errorMessage: "AI 추론 중 오류가 발생했습니다. 직접 입력해주세요.",
                }
              : g
          )
        );
      }
    });

    e.target.value = "";
  }

  async function handleKeywordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const keyword = keywordInput.trim();
    if (!keyword) return;

    const newItem: KeywordLogItem = {
      id: crypto.randomUUID(),
      keyword,
      location: "",
      workContent: "",
      tags: "",
      inferring: true,
      status: "pending",
    };
    setKeywordItems((prev) => [...prev, newItem]);
    setKeywordInput("");
    setKeywordMessage("");

    try {
      const inferred = await inferKeywordWorkLog(keyword);
      setKeywordItems((prev) =>
        prev.map((it) =>
          it.id === newItem.id
            ? {
                ...it,
                location: inferred.location || "",
                workContent: inferred.work_content || "",
                tags: Array.isArray(inferred.tags) ? inferred.tags.join(", ") : "",
                inferring: false,
                errorMessage: inferred.error,
              }
            : it
        )
      );
    } catch {
      setKeywordItems((prev) =>
        prev.map((it) =>
          it.id === newItem.id
            ? {
                ...it,
                inferring: false,
                errorMessage: "AI 추론 중 오류가 발생했습니다. 직접 입력해주세요.",
              }
            : it
        )
      );
    }
  }

  function updateItem(file: File, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.file === file ? { ...it, ...patch } : it)));
  }

  function updateSitePhotoGroup(id: string, patch: Partial<SitePhotoGroup>) {
    setSitePhotoGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function removeItem(file: File) {
    setItems((prev) => prev.filter((it) => it.file !== file));
  }

  function removeSitePhotoGroup(id: string) {
    setSitePhotoGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function updateKeywordItem(id: string, patch: Partial<KeywordLogItem>) {
    setKeywordItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeKeywordItem(id: string) {
    setKeywordItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function uploadOne(item: UploadItem) {
    const { file } = item;
    const storagePath = item.storagePath || storagePathFor(file);

    // DWG는 추론 단계에서 이미 Storage에 올라가 있으므로 재업로드하지 않습니다.
    if (!item.storagePath) {
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }
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

  async function uploadOneSitePhotoGroup(group: SitePhotoGroup) {
    const { date, time } = currentWorkLogDateTime();
    const tags = parseTags(group.tags);
    const description = sitePhotoDescription(group);

    let representativeDocumentId: number | string | undefined;

    for (const photo of group.photos) {
      const { file } = photo;
      const storagePath = storagePathFor(file);

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
          description,
          site_name: group.location,
          file_size: file.size,
        })
        .select("document_id")
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      if (representativeDocumentId === undefined) {
        representativeDocumentId = inserted?.document_id;
      }
    }

    const { error: logError } = await supabase.from("work_logs").insert({
      document_id: representativeDocumentId,
      site_name: group.location || null,
      log_date: date,
      content: group.workContent.trim(),
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
        location: group.location,
        work_content: group.workContent.trim(),
        tags,
        file_name: group.photos[0].file.name,
        document_id: representativeDocumentId,
      }),
    });
    const sheetData = await sheetRes.json();

    if (!sheetRes.ok) {
      throw new Error(sheetData.error || "구글 시트 작성 실패");
    }

    return sheetData.written === true;
  }

  async function uploadOneKeywordLog(item: KeywordLogItem) {
    const { date, time } = currentWorkLogDateTime();
    const tags = parseTags(item.tags);

    const { error: logError } = await supabase.from("work_logs").insert({
      document_id: null,
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
    const pending = sitePhotoGroups.filter(
      (g) => g.status === "pending" || g.status === "error"
    );
    const incomplete = pending.find(
      (g) => !g.location.trim() || !g.workContent.trim()
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

    for (const group of pending) {
      updateSitePhotoGroup(group.id, {
        status: "uploading",
        errorMessage: undefined,
        sheetWritten: undefined,
      });
      try {
        const written = await uploadOneSitePhotoGroup(group);
        updateSitePhotoGroup(group.id, { status: "done", sheetWritten: written });
        success++;
        if (written) sheetWritten++;
      } catch (err) {
        updateSitePhotoGroup(group.id, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "현장사진 업로드 실패",
        });
        failed++;
      }
    }

    setUploadingSitePhotos(false);
    setSitePhotoMessage(
      failed === 0
        ? `${success}건의 업무일지를 반영했습니다. 구글 시트 작성 ${sheetWritten}건.`
        : `${success}건 성공, ${failed}건 실패했습니다. 실패한 항목은 다시 시도할 수 있습니다.`
    );
  }

  async function handleUploadKeywordLogs() {
    const pending = keywordItems.filter(
      (it) => it.status === "pending" || it.status === "error"
    );
    const incomplete = pending.find(
      (it) => !it.location.trim() || !it.workContent.trim()
    );

    if (pending.length === 0) {
      setKeywordMessage("기록할 키워드가 없습니다.");
      return;
    }

    if (incomplete) {
      setKeywordMessage("위치와 업무내용을 확인한 뒤 기록해주세요.");
      return;
    }

    setUploadingKeywords(true);
    setKeywordMessage("");

    let success = 0;
    let failed = 0;
    let sheetWritten = 0;

    for (const item of pending) {
      updateKeywordItem(item.id, {
        status: "uploading",
        errorMessage: undefined,
        sheetWritten: undefined,
      });
      try {
        const written = await uploadOneKeywordLog(item);
        updateKeywordItem(item.id, { status: "done", sheetWritten: written });
        success++;
        if (written) sheetWritten++;
      } catch (err) {
        updateKeywordItem(item.id, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "기록 실패",
        });
        failed++;
      }
    }

    setUploadingKeywords(false);
    setKeywordMessage(
      failed === 0
        ? `${success}개 키워드를 업무일지에 반영했습니다. 구글 시트 작성 ${sheetWritten}건.`
        : `${success}개 성공, ${failed}개 실패했습니다. 실패한 항목은 다시 시도할 수 있습니다.`
    );
  }

  return (
    <div className="luxury-surface flex flex-col flex-1 items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl">
        <Link href="/help" className="luxury-link text-sm">
          ← 시작하기
        </Link>

        <div className="mt-4">
          <h1 className="font-serif text-3xl font-medium tracking-wide text-[var(--luxury-text)]">
            문서 업로드
          </h1>
          <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-[var(--luxury-text-muted)]">
            파일 · 자동 태깅
          </p>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
          여러 파일을 한꺼번에 선택하면 AI가 현장명·설명을 자동으로 채워줍니다.
          내용을 확인·수정한 뒤 한 번에 업로드하세요.
        </p>

        <input
          type="file"
          multiple
          onChange={handleFilesSelected}
          className="luxury-input mt-6 block w-full cursor-pointer rounded-lg p-2.5 text-sm text-[var(--luxury-text-muted)] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--luxury-accent)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#171106]"
        />

        {items.length > 0 && (
          <ul className="mt-6 flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.file.name + item.file.size + item.file.lastModified}
                className="luxury-card rounded-xl p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--luxury-text)]">
                    {item.file.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.status === "done" && (
                      <span className="text-xs font-medium text-emerald-400">완료</span>
                    )}
                    {item.status === "uploading" && (
                      <span className="text-xs text-[var(--luxury-text-muted)]">업로드 중...</span>
                    )}
                    {item.status !== "done" && item.status !== "uploading" && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.file)}
                        className="text-xs text-[var(--luxury-text-muted)] transition-colors hover:text-rose-400"
                      >
                        제거
                      </button>
                    )}
                  </div>
                </div>

                {item.inferring ? (
                  <p className="mt-2 text-xs text-[var(--luxury-text-muted)]">AI가 추론하는 중...</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    <input
                      type="text"
                      value={item.siteName}
                      onChange={(e) => updateItem(item.file, { siteName: e.target.value })}
                      placeholder="현장·구역명 (선택)"
                      disabled={item.status === "done" || item.status === "uploading"}
                      className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                    />
                    <textarea
                      value={item.description}
                      onChange={(e) => updateItem(item.file, { description: e.target.value })}
                      placeholder="설명 (선택)"
                      rows={2}
                      disabled={item.status === "done" || item.status === "uploading"}
                      className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                    />
                  </div>
                )}

                {item.status === "error" && (
                  <p className="mt-2 text-xs text-rose-400">
                    <span className="mr-1 font-semibold">오류</span>
                    {item.errorMessage}
                  </p>
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
            className="luxury-btn-primary mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploadingAll ? "업로드 중..." : `전체 업로드 (${items.length}개)`}
          </button>
        )}

        {message && (
          <p className="mt-4 text-sm text-[var(--luxury-text-muted)]">{message}</p>
        )}

        <hr className="luxury-divider mt-12" />

        <section className="mt-8">
          <h2 className="font-serif text-lg font-medium tracking-wide text-[var(--luxury-text)]">
            현장사진 → 업무일지 자동 기록
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
            사진을 여러 장 선택하면 AI가 위치와 업무내용을 추론합니다. 확인 후 업로드하면
            업무일지 테이블과 구글 시트 작성 API에 함께 반영됩니다.
          </p>

          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleSitePhotosSelected}
            className="luxury-input mt-6 block w-full cursor-pointer rounded-lg p-2.5 text-sm text-[var(--luxury-text-muted)] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--luxury-accent)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#171106]"
          />

          {sitePhotoGroups.length > 0 && (
            <ul className="mt-6 flex flex-col gap-3">
              {sitePhotoGroups.map((group) => (
                <li key={group.id} className="luxury-card rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--luxury-text)]">
                      {group.photos.map((p) => p.file.name).join(", ")}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {group.status === "done" && (
                        <span className="text-xs font-medium text-emerald-400">
                          {group.sheetWritten ? "시트 작성 완료" : "업무일지 저장 완료"}
                        </span>
                      )}
                      {group.status === "uploading" && (
                        <span className="text-xs text-[var(--luxury-text-muted)]">반영 중...</span>
                      )}
                      {group.status !== "done" && group.status !== "uploading" && (
                        <button
                          type="button"
                          onClick={() => removeSitePhotoGroup(group.id)}
                          className="text-xs text-[var(--luxury-text-muted)] transition-colors hover:text-rose-400"
                        >
                          제거
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {group.photos.length > 1 && group.hasExifTime && (
                      <span className="luxury-badge rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide">
                        {group.photos.length}장 자동 그룹
                      </span>
                    )}
                    {!group.hasExifTime && (
                      <span className="luxury-badge rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide">
                        안내 · 촬영시각 정보 없음
                      </span>
                    )}
                  </div>

                  {group.inferring ? (
                    <p className="mt-2 text-xs text-[var(--luxury-text-muted)]">
                      사진에서 위치와 업무내용을 추론하는 중...
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      <input
                        type="text"
                        value={group.location}
                        onChange={(e) =>
                          updateSitePhotoGroup(group.id, { location: e.target.value })
                        }
                        placeholder="위치 예: 201동 지하 1층"
                        disabled={group.status === "done" || group.status === "uploading"}
                        className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                      />
                      <textarea
                        value={group.workContent}
                        onChange={(e) =>
                          updateSitePhotoGroup(group.id, { workContent: e.target.value })
                        }
                        placeholder="업무내용 예: 피복두께 불량 확인 및 시정 조치 후 재확인 및 보고 지시"
                        rows={2}
                        disabled={group.status === "done" || group.status === "uploading"}
                        className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                      />
                      <input
                        type="text"
                        value={group.tags}
                        onChange={(e) =>
                          updateSitePhotoGroup(group.id, { tags: e.target.value })
                        }
                        placeholder="자동 태그 예: 201동, 지하1층, 철근, 피복두께, 시정지시"
                        disabled={group.status === "done" || group.status === "uploading"}
                        className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                      />
                    </div>
                  )}

                  {group.errorMessage && (
                    <p className="mt-2 text-xs text-rose-400">
                      <span className="mr-1 font-semibold">오류</span>
                      {group.errorMessage}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {sitePhotoGroups.length > 0 && (
            <button
              type="button"
              onClick={handleUploadSitePhotos}
              disabled={uploadingSitePhotos}
              className="luxury-btn-primary mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploadingSitePhotos
                ? "업무일지 반영 중..."
                : `현장사진 업무일지 반영 (${sitePhotoGroups.length}건)`}
            </button>
          )}

          {sitePhotoMessage && (
            <p className="mt-4 text-sm text-[var(--luxury-text-muted)]">
              {sitePhotoMessage}
            </p>
          )}

          {hasSitePhotoSheetWritten && (
            <Link
              href="/sheet-check"
              className="luxury-btn-ghost mt-3 inline-flex rounded-lg px-4 py-2 text-sm font-semibold"
            >
              시트 확인
            </Link>
          )}
        </section>

        <hr className="luxury-divider mt-12" />

        <section className="mt-8">
          <h2 className="font-serif text-lg font-medium tracking-wide text-[var(--luxury-text)]">
            키워드 입력
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
            사진 없이 키워드만 입력하면 AI가 위치와 업무내용을 추론합니다. 확인 후
            기록하면 현장사진과 같은 업무일지 테이블·구글 시트에 함께 반영됩니다.
          </p>

          <form onSubmit={handleKeywordSubmit} className="mt-4 flex gap-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="예: 201동 지하1층 철근"
              className="luxury-input flex-1 rounded-lg px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              className="luxury-btn-primary shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold"
            >
              추가
            </button>
          </form>

          {keywordItems.length > 0 && (
            <ul className="mt-6 flex flex-col gap-3">
              {keywordItems.map((item) => (
                <li key={item.id} className="luxury-card rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--luxury-text)]">
                      {item.keyword}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.status === "done" && (
                        <span className="text-xs font-medium text-emerald-400">
                          {item.sheetWritten ? "시트 작성 완료" : "업무일지 저장 완료"}
                        </span>
                      )}
                      {item.status === "uploading" && (
                        <span className="text-xs text-[var(--luxury-text-muted)]">반영 중...</span>
                      )}
                      {item.status !== "done" && item.status !== "uploading" && (
                        <button
                          type="button"
                          onClick={() => removeKeywordItem(item.id)}
                          className="text-xs text-[var(--luxury-text-muted)] transition-colors hover:text-rose-400"
                        >
                          제거
                        </button>
                      )}
                    </div>
                  </div>

                  {item.inferring ? (
                    <p className="mt-2 text-xs text-[var(--luxury-text-muted)]">
                      키워드에서 위치와 업무내용을 추론하는 중...
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      <input
                        type="text"
                        value={item.location}
                        onChange={(e) =>
                          updateKeywordItem(item.id, { location: e.target.value })
                        }
                        placeholder="위치 예: 201동 지하 1층"
                        disabled={item.status === "done" || item.status === "uploading"}
                        className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                      />
                      <textarea
                        value={item.workContent}
                        onChange={(e) =>
                          updateKeywordItem(item.id, { workContent: e.target.value })
                        }
                        placeholder="업무내용 예: 철근 배근 상태 확인 및 이상 유무 점검"
                        rows={2}
                        disabled={item.status === "done" || item.status === "uploading"}
                        className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                      />
                      <input
                        type="text"
                        value={item.tags}
                        onChange={(e) =>
                          updateKeywordItem(item.id, { tags: e.target.value })
                        }
                        placeholder="자동 태그 예: 201동, 지하1층, 철근"
                        disabled={item.status === "done" || item.status === "uploading"}
                        className="luxury-input rounded-lg p-2 text-sm disabled:opacity-50"
                      />
                    </div>
                  )}

                  {item.errorMessage && (
                    <p className="mt-2 text-xs text-rose-400">
                      <span className="mr-1 font-semibold">오류</span>
                      {item.errorMessage}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {keywordItems.length > 0 && (
            <button
              type="button"
              onClick={handleUploadKeywordLogs}
              disabled={uploadingKeywords}
              className="luxury-btn-primary mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploadingKeywords
                ? "업무일지 반영 중..."
                : `업무일지 기록 (${keywordItems.length}개)`}
            </button>
          )}

          {keywordMessage && (
            <p className="mt-4 text-sm text-[var(--luxury-text-muted)]">
              {keywordMessage}
            </p>
          )}

          {hasKeywordSheetWritten && (
            <Link
              href="/sheet-check"
              className="luxury-btn-ghost mt-3 inline-flex rounded-lg px-4 py-2 text-sm font-semibold"
            >
              시트 확인
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
