"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/* 골드 톤 인라인 아이콘 — 외부 아이콘 라이브러리 없이 stroke=currentColor로 luxury-accent 색을 상속 */
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
function IconKeyboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="7" width="18" height="11" rx="2" />
      <path d="M7 11h.01M11 11h.01M15 11h.01M17 11h.01M7 14h10" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}
function IconCompass() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.2l-2 5.6-5.6 2 2-5.6 5.6-2Z" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3v4M12 17v4M4.5 12h4M15.5 12h4M6.5 6.5l2.8 2.8M14.7 14.7l2.8 2.8M17.5 6.5l-2.8 2.8M9.3 14.7l-2.8 2.8" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

type GuideCard = {
  number: string;
  icon: ReactNode;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
  note?: string;
};

const cards: GuideCard[] = [
  {
    number: "01",
    icon: <IconUpload />,
    title: "문서 업로드",
    body: "여러 파일을 한꺼번에 선택하면 AI가 파일명·이미지·도면 내용을 보고 현장명과 설명을 자동으로 채워줍니다. 확인·수정 후 한 번에 업로드하면 끝입니다.",
    href: "/upload",
    linkLabel: "업로드 화면 열기",
  },
  {
    number: "02",
    icon: <IconCamera />,
    title: "현장사진 업무일지",
    body: "현장사진 여러 장을 올리면 촬영시각이 가까운 사진끼리 묶고, AI가 위치·업무내용·태그를 추론합니다. 확인 후 반영하면 Google Sheets에도 함께 기록됩니다.",
    href: "/upload",
    linkLabel: "업로드 화면 열기",
  },
  {
    number: "03",
    icon: <IconKeyboard />,
    title: "키워드로 업무일지 기록",
    body: "사진이 없을 때는 짧은 키워드만 입력해도 됩니다. AI가 위치·업무내용·태그를 추론해 업무일지와 Google Sheets에 기록합니다.",
    href: "/upload",
    linkLabel: "업로드 화면 열기",
  },
  {
    number: "04",
    icon: <IconFolder />,
    title: "전체 문서 보기",
    body: "검색 없이 저장된 문서 전체를 현장·구역명별로 묶어서 한 번에 확인할 수 있습니다. 현장명이 없는 문서는 미분류로 모아둡니다.",
    href: "/browse",
    linkLabel: "전체 문서 보기",
  },
  {
    number: "05",
    icon: <IconSearch />,
    title: "자연어 검색",
    body: "찾고 싶은 문서를 문장으로 설명하면 AI가 검색 조건으로 바꿔 저장된 문서 중 일치하는 항목을 찾아줍니다.",
    href: "/",
    linkLabel: "검색 화면 열기",
  },
  {
    number: "06",
    icon: <IconCompass />,
    title: "연관검색",
    body: "\"201동\"처럼 짧은 현장명만 입력하면, AI가 그 현장에서 보통 필요한 문서 종류를 코멘트로 짚어주고 관련 문서를 찾아줍니다.",
    href: "/",
    linkLabel: "검색 화면 열기",
  },
  {
    number: "07",
    icon: <IconSpark />,
    title: "AI 브리핑",
    body: "검색 결과나 전체 문서 목록에서 문서를 열지 않고도 버튼 한 번으로 내용을 요약해서 볼 수 있습니다. PDF·이미지·HWP·DWG/DXF를 지원합니다.",
    href: "/",
    linkLabel: "검색 화면 열기",
  },
];

export default function HelpPage() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="luxury-surface flex flex-col flex-1 items-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-wide text-[var(--luxury-text)]">
              javis
            </h1>
            <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-[var(--luxury-text-muted)]">
              시작하기
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-1.5 text-xs">
            <Link href="/" className="luxury-link">
              문서 검색
            </Link>
            <span className="text-[var(--luxury-border-strong)]">·</span>
            <Link href="/browse" className="luxury-link">
              전체 문서
            </Link>
            <span className="text-[var(--luxury-border-strong)]">·</span>
            <Link href="/upload" className="luxury-link">
              + 문서 업로드
            </Link>
            <span className="text-[var(--luxury-border-strong)]">·</span>
            <button type="button" onClick={handleLogout} className="luxury-link">
              로그아웃
            </button>
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--luxury-text-muted)]">
          무엇부터 시작할지 아래에서 골라보세요.
        </p>

        {/* 히어로 카드 */}
        <div className="luxury-card mt-8 flex items-center gap-5 rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
          <div className="min-w-0 flex-1">
            <span className="luxury-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-wide">
              <IconSpark />
              빠른 시작
            </span>
            <h2 className="mt-3 font-serif text-lg font-medium leading-snug text-[var(--luxury-text)] sm:text-xl">
              찾고 싶은 문서를 말로 설명하면, AI가 대신 찾아드립니다
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
              문서를 올려두면 AI가 현장명·설명을 자동으로 채워 정리하고, 나중에 필요할 때는 자연어 한 문장으로 검색해 휴대폰에서 바로 열람·다운로드할 수 있습니다.
            </p>
          </div>
          <div
            className="luxury-badge flex h-16 w-16 shrink-0 items-center justify-center rounded-full sm:h-20 sm:w-20"
            aria-hidden="true"
          >
            <IconGrid />
          </div>
        </div>

        <h3 className="mt-10 font-serif text-base font-medium text-[var(--luxury-text)] sm:text-lg">
          단계별 시작하기
        </h3>

        {/* 2열 그리드 카드 */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {cards.map((card) => (
            <div
              key={card.number}
              className="luxury-card flex flex-col rounded-xl px-4 py-4 sm:px-5 sm:py-5"
            >
              <div className="luxury-badge flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                {card.icon}
              </div>
              <h4 className="mt-3 flex items-baseline gap-2 text-sm font-semibold text-[var(--luxury-text)]">
                <span className="text-[var(--luxury-accent-soft)]">{card.number}</span>
                <span>{card.title}</span>
              </h4>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
                {card.body}
              </p>
              {card.href ? (
                <Link
                  href={card.href}
                  className="luxury-btn-ghost mt-4 inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm"
                >
                  {card.linkLabel}
                </Link>
              ) : card.note ? (
                <p className="mt-4 text-xs italic text-[var(--luxury-text-muted)]">
                  {card.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
