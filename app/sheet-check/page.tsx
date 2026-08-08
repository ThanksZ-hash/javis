import Link from "next/link";

const WORK_LOG_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1GKn9BH_z1SN-eGgLJvjfAZXvpEB8dDbFHS_7YeY3ujQ/edit?usp=sharing";

export default function SheetCheckPage() {
  return (
    <div className="luxury-surface flex flex-1 items-center justify-center px-4 py-10">
      <div className="luxury-card w-full max-w-sm rounded-xl p-6">
        <Link href="/upload" className="luxury-link text-sm">
          ← 업로드로 돌아가기
        </Link>

        <h1 className="mt-5 font-serif text-2xl font-medium tracking-wide text-[var(--luxury-text)]">
          시트 확인
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--luxury-text-muted)]">
          업무일지가 Google Sheets에 기록됐는지 확인한 뒤 다시 앱으로 돌아올 수 있습니다.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <a
            href={WORK_LOG_SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="luxury-btn-primary inline-flex justify-center rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Google Sheets 열기
          </a>
          <Link
            href="/upload"
            className="luxury-btn-ghost inline-flex justify-center rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            앱으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
