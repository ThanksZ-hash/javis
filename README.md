# javis

건설 현장 문서와 현장사진 업무일지를 다루는 로컬 우선 문서 검색 도구입니다.

## 현재 기능

- 문서 다중 업로드
- Gemini 기반 파일명/이미지 자동 태깅
- 자연어 문서 검색
- 현장명·구역명 기반 연관검색
- PDF·이미지·HWP AI 브리핑
- 전체 문서 보기(`/browse`)
- Supabase Auth 로그인
- 비공개 Supabase Storage + 만료형 signed URL
- 현장사진 업무일지 생성
- Google Sheets 업무일지 웹훅 기록
- 모바일/안드로이드 브라우저 대응
- Google Sheets 확인 후 앱 복귀 화면

## 배포 주소

```text
https://javis-mauve.vercel.app
```

## 로컬 실행

```bash
npm install
npm run dev
```

로컬 주소:

```text
http://localhost:3000
```

업로드 화면:

```text
http://localhost:3000/upload
```

## 환경변수

`.env.local`에 아래 값들이 필요합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GOOGLE_SHEETS_WEBHOOK_URL=
```

`GOOGLE_SHEETS_WEBHOOK_URL`은 Google Sheets 링크가 아니라 Apps Script 웹앱 URL입니다.

```text
https://script.google.com/macros/s/.../exec
```

## 현장사진 업무일지

업로드 화면 하단의 `현장사진 업무일지` 영역에서 사진을 여러 장 선택하면 Gemini가 사진별로 아래 값을 추론합니다.

- 위치
- 업무내용
- 자동 태그

사용자가 값을 확인·수정한 뒤 반영하면 사진은 Supabase Storage와 `documents` 테이블에 저장되고, 업무일지 데이터는 `work_logs`와 Google Sheets `업무일지` 탭에 기록됩니다.

Google Sheets 컬럼:

```text
날짜 | 시간 | 위치 | 업무내용 | 태그 | 파일명 | 문서ID
```

## 제출 참고

제출용 zip에는 `node_modules`, `.next`, `.env.local`, `.git`, `.vercel`, 실제 업무 원본 폴더를 제외합니다.
