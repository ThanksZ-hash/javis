import { GoogleGenerativeAI } from "@google/generative-ai";
import { DocumentRow } from "@/lib/supabase";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function findMatchingDocumentIndices(
  query: string,
  documents: DocumentRow[]
): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const docList = documents
    .map(
      (d, i) =>
        `${i}. 파일명: ${d.file_name} / 현장·구역: ${
          d.site_name || "(없음)"
        } / 설명: ${d.description || "(없음)"}`
    )
    .join("\n");

  const prompt = `사용자가 찾는 문서를 다음처럼 자연어로 설명했습니다: "${query}"

아래는 저장된 문서 목록입니다 (번호. 파일명 / 설명):
${docList}

사용자의 설명과 관련성이 높은 문서를 관련도가 높은 순서로 골라주세요.
관련 있는 문서가 하나도 없으면 빈 배열을 반환하세요.
다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"indices": [0, 2]}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return Array.isArray(parsed.indices)
    ? parsed.indices.filter((i: unknown) => typeof i === "number")
    : [];
}

export type RelatedSearchResult = {
  comment: string;
  indices: number[];
};

export async function inferRelatedDocuments(
  keyword: string,
  documents: DocumentRow[],
  scopedToSite: boolean
): Promise<RelatedSearchResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const docList = documents
    .map(
      (d, i) =>
        `${i}. 파일명: ${d.file_name} / 현장·구역: ${
          d.site_name || "(없음)"
        } / 설명: ${d.description || "(없음)"}`
    )
    .join("\n");

  const scopeExplanation = scopedToSite
    ? `아래 문서 목록은 "${keyword}"와 다른 현장·구역으로 명확히 태깅된 문서를 미리 제외한
목록입니다 (현장·구역 태그가 아직 없는 문서는 관련 있을 수 있어 그대로 포함되어 있습니다).
이 안에서, 건설 현장 문서 관리 업무상 "${keyword}"에 실제로 관련 있는 문서를 파일명·설명·
현장 태그를 종합해서 판단하고, 사용자의 실제 업무 문서 구분(검측, 타승, 자검, 시상 도면,
하도급계약 검토/통보 등) 관점에서 관련도 순으로 골라주세요. 목록에 없는 문서 종류가 빠져있다면
comment에서 "~ 문서는 아직 없습니다"처럼 언급해도 좋습니다.`
    : `저장된 문서 중 현장·구역 태그가 있는 문서가 없어서, 전체 문서를 대상으로
파일명·설명만 보고 관련도를 판단해야 합니다. 건설 현장 문서 관리 업무 맥락에서 이 키워드와
관련해 보통 찾게 되는 문서 종류(검측, 타승, 자검, 시상 도면, 배근도 등)를 추론해
관련도 순으로 골라주세요.`;

  const prompt = `사용자가 "${keyword}" 라는 짧은 현장·구역 이름 또는 키워드만 입력하고 연관검색을 요청했습니다.

${scopeExplanation}

${SEOCHO_WORK_CONTEXT}

아래는 문서 목록입니다 (번호. 파일명 / 현장·구역 / 설명):
${docList}

관련 있는 문서가 없으면 빈 배열을 반환하세요.

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"comment": "201동 관련해서 체크리스트, 검측요청서를 찾아보겠습니다.", "indices": [0, 2]}

comment는 사용자에게 보여줄 한 문장짜리 추론 코멘트입니다. 실제로 일치하는 문서가 없으면
comment에 "관련 문서를 찾지 못했습니다" 같은 내용을 담아주세요.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { comment: "추론에 실패했습니다.", indices: [] };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    comment:
      typeof parsed.comment === "string" ? parsed.comment : "관련 문서를 찾아봤습니다.",
    indices: Array.isArray(parsed.indices)
      ? parsed.indices.filter((i: unknown) => typeof i === "number")
      : [],
  };
}

export type InferredMetadata = {
  site_name: string | null;
  description: string;
};

export type InferredImageMetadata = InferredMetadata & {
  is_site_photo: boolean;
  work_log_entry: string | null;
};

export type InferredSitePhotoWorkLog = {
  location: string;
  work_content: string;
  tags: string[];
};

// 사용자가 정리한 실제 scan 폴더의 파일명 패턴을 일반화한 도메인 컨텍스트입니다.
// 개인정보나 특정 결재 내용이 아니라, 업무 분류·위치·문체만 프롬프트에 반영합니다.
const SEOCHO_WORK_CONTEXT = `사용자의 실제 업무 문서 패턴:
- 주요 문서 구분: 검측(건), 타승(건), 자검-건, 시상-건축, 하도급계약 검토/통보, 감리업무 인계인수서, 시간외근무요청서
- 주요 위치 표기: 203동, 207동, 주변주차장, 주동, 통로구간, 통로#2, EV PIT, 버림, 기초, B4F, B3F, B2F, B1F, 지하4층, 지하3층, 지하2층, 지하1층
- 주요 공종·부재: 골조, 기초배근, 바닥 철근, 바닥 먹매김, 벽체 및 기둥 철근, 수직 철근, 슬래브, 합벽, PC기둥, 거푸집 조립, 콘크리트 타설, 버림콘크리트
- 문서명 예시: "검측(건)-203동-골조-015 지하2층 바닥 철근 및 거푸집 조립", "타승(건)203-010 203동 지하2층 바닥", "시상-건축-161 203동 및 주변주차장 지하1층 바닥 배근도", "자검-건-244 203동 지하1층 주동 및 #3번 주차장 바닥 철근"
- 위치를 만들 때는 "203동 지하2층 바닥", "207동 지하4층 주변주차장 PC기둥", "203동 통로#2 기초", "203동 EV PIT"처럼 동/층/구간/부재를 붙여 씁니다.
- "B4F"와 "지하4층"은 같은 의미로 보고, 사용자가 입력한 표현이 있으면 그 표현을 우선 유지합니다.
- 사진이나 파일명에 근거가 없는 동·층·구간은 새로 만들어내지 않습니다.`;

const WORK_LOG_STYLE_EXAMPLES = `사용자 업무일지 문체 예시 (형식·어투 참고용):
- {"location": "203동 지하2층 바닥", "work_content": "바닥 철근 배근 및 거푸집 조립 상태 확인", "tags": ["203동", "지하2층", "바닥철근", "거푸집", "검측"]}
- {"location": "207동 지하4층 주변주차장 PC기둥", "work_content": "PC기둥 설치 위치 및 주변 철근 간섭 여부 확인", "tags": ["207동", "지하4층", "주변주차장", "PC기둥"]}
- {"location": "203동 통로#2 기초", "work_content": "기초 배근 상태 및 피복 확보 여부 점검", "tags": ["203동", "통로#2", "기초배근", "피복"]}
- {"location": "203동 EV PIT", "work_content": "EV PIT 기초 철근 및 거푸집 조립 상태 확인", "tags": ["203동", "EV PIT", "기초철근", "거푸집"]}
- {"location": "203동 지하3층 합벽", "work_content": "합벽 철근 배근 상태 및 개구부 주변 보강 여부 확인", "tags": ["203동", "지하3층", "합벽", "철근"]}
- {"location": "207동 기초", "work_content": "콘크리트 타설 전 철근·거푸집 시공상태 검측", "tags": ["207동", "기초", "타설전", "검측"]}`;

export async function inferMetadataFromFileName(
  fileName: string
): Promise<InferredMetadata> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `건설 현장 문서 관리 서비스에 아래 파일명으로 문서가 업로드되었습니다.
파일명만 보고, 현장·구역명과 문서에 대한 짧은 한글 설명을 추론해주세요.

파일명: "${fileName}"

- site_name: 파일명에 "203동", "207동", "203동 지하2층", "207동 B4F", "203동 EV PIT",
  "주변주차장", "통로#2"처럼 현장·구역을 나타내는 표현이 있으면 그대로 추출하세요.
  동/층/구간/부재가 함께 있으면 가능한 한 함께 보존하세요. 없으면 null로 답하세요.
  추측해서 지어내지 마세요.
- description: 파일명만으로 추론할 수 있는 문서 종류나 용도를 한 문장으로 짧게 설명하세요.
  "검측(건)"은 현장 검측 문서, "타승(건)"은 콘크리트 타설 승인/타설 관련 문서,
  "자검-건"은 자체 검측/자체 점검 문서, "시상-건축"은 시공상세도/배근도 계열 문서로
  해석하세요.
  파일명을 그대로 반복하지 말고, 어떤 업무에 쓰이는 문서인지 설명하세요.

${SEOCHO_WORK_CONTEXT}

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"site_name": "203동 지하2층", "description": "203동 지하2층 바닥 철근 및 거푸집 조립 검측 문서"}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { site_name: null, description: "" };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    site_name: typeof parsed.site_name === "string" ? parsed.site_name : null,
    description:
      typeof parsed.description === "string" ? parsed.description : "",
  };
}

// dwgText는 도면 파일(DWG)에서 뽑아낸 표제란·시트제목·라벨 등 실제 텍스트입니다
// (dwgread로 변환한 DXF에서 TEXT/MTEXT/ATTRIB 내용만 추출한 것 — 치수 숫자는
// 제외됨). 파일명보다 훨씬 근거 있는 추론이 가능합니다.
export async function inferMetadataFromDwgText(
  fileName: string,
  dwgText: string
): Promise<InferredMetadata> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `건설 현장 문서 관리 서비스에 아래 CAD 도면(DWG) 파일이 업로드되었습니다.
파일명과, 도면 안에서 실제로 추출한 텍스트(표제란, 시트 제목, 라벨 등)를 보고
현장·구역명과 문서에 대한 짧은 한글 설명을 추론해주세요.

파일명: "${fileName}"

도면에서 추출한 텍스트 (일부일 수 있음):
"""
${dwgText.slice(0, 6000)}
"""

- site_name: "201동", "302동", "2공구"처럼 현장·구역을 나타내는 표현이 추출된 텍스트나
  파일명에 실제로 있으면 그대로 추출하세요. 없으면 null로 답하세요. 추측해서 지어내지 마세요.
- description: 추출된 텍스트(도면 제목, 표제란의 DWG.TITLE 등)를 최우선 근거로,
  어떤 도면인지 한 문장으로 짧게 설명하세요. 텍스트가 부족하면 파일명을 보조로 쓰세요.

${SEOCHO_WORK_CONTEXT}

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"site_name": "203동 B3F", "description": "203동 B3F 주동 슬래브 및 주변주차장 슬래브 철근배근 상세도"}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { site_name: null, description: "" };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    site_name: typeof parsed.site_name === "string" ? parsed.site_name : null,
    description:
      typeof parsed.description === "string" ? parsed.description : "",
  };
}

export async function inferMetadataFromImage(
  fileName: string,
  base64Data: string,
  mimeType: string
): Promise<InferredImageMetadata> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `건설 현장 문서 관리 서비스에 아래 이미지가 업로드되었습니다 (파일명: "${fileName}").
이미지 내용을 직접 보고 아래 항목에 답하세요.

${SEOCHO_WORK_CONTEXT}

- site_name: 이미지 안에 "201동", "302동", "2공구"처럼 현장·구역을 나타내는 표지판, 라벨, 문서
  제목 등이 실제로 보이면 그대로 적으세요. 파일명에 "203동", "207동", "B4F", "지하2층",
  "EV PIT", "주변주차장" 같은 위치가 있으면 함께 참고하세요. 보이지 않으면 null로 답하세요.
  추측해서 지어내지 마세요.
- description: 이미지에 실제로 무엇이 찍혀 있는지(현장 사진, 도면, 서류, 장비 등) 한 문장으로
  짧게 설명하세요.
- is_site_photo: 실제 공사 현장의 작업 모습(철근·콘크리트·배관·장비·인력 작업 등)을 찍은 사진이면
  true, 도면·서류·스캔본·현장과 무관한 사진이면 false로 답하세요.
- work_log_entry: is_site_photo가 true일 때만, 사진에서 실제로 확인되는 작업 내용을
  감리일지·업무일지 같은 공문 형식 행정문서에 그대로 옮길 수 있는 문어체로 작성하세요.
  구어체·감상·추측 표현 없이, "~을 확인함", "~을 진행함", "~상태임"처럼 명사형·"-함"체로
  끝나는 객관적 서술로 쓰세요 (예: "201동 지하 1층 철근 배근 작업 진행 확인함",
  "302동 콘크리트 양생 상태 이상 없음을 확인함"). 사진만으로 알 수 없는 내용은 지어내지
  말고, is_site_photo가 false면 null로 답하세요.

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"site_name": "203동 지하2층", "description": "203동 지하2층 바닥 철근 배근 및 거푸집 조립 현장 사진", "is_site_photo": true, "work_log_entry": "203동 지하2층 바닥 철근 배근 및 거푸집 조립 상태 확인"}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType, data: base64Data } },
  ]);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { site_name: null, description: "", is_site_photo: false, work_log_entry: null };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    site_name: typeof parsed.site_name === "string" ? parsed.site_name : null,
    description:
      typeof parsed.description === "string" ? parsed.description : "",
    is_site_photo: parsed.is_site_photo === true,
    work_log_entry:
      typeof parsed.work_log_entry === "string" ? parsed.work_log_entry : null,
  };
}

export async function inferSitePhotoWorkLogFromImage(
  fileName: string,
  base64Data: string,
  mimeType: string
): Promise<InferredSitePhotoWorkLog> {
  return inferSitePhotoWorkLogFromImages([fileName], [{ base64Data, mimeType }]);
}

export async function inferSitePhotoWorkLogFromImages(
  fileNames: string[],
  images: { base64Data: string; mimeType: string }[]
): Promise<InferredSitePhotoWorkLog> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const fileNameText =
    fileNames.length > 1
      ? `같은 시간대에 촬영된 것으로 보이는 사진 ${fileNames.length}장이 업로드되었습니다 (파일명: ${fileNames
          .map((name) => `"${name}"`)
          .join(", ")}).`
      : `건설 현장 업무일지에 사용할 사진이 업로드되었습니다 (파일명: "${fileNames[0]}").`;

  const prompt = `${fileNameText}
이미지를 직접 보고 구글 시트의 한 행으로 들어갈 값을 추론해주세요.${
    fileNames.length > 1
      ? " 여러 장의 사진은 하나의 업무 상황을 나타내므로 전체를 종합해 하나의 위치와 업무내용으로 정리하세요."
      : ""
  }

${SEOCHO_WORK_CONTEXT}

반드시 아래 세 개 키만 반환하세요.

- location: 업무 위치입니다. 사진 안 표지판, 파일명, 촬영 맥락에서 확인되는 "203동 지하2층 바닥",
  "207동 B4F 주변주차장 PC기둥", "203동 EV PIT", "203동 통로#2 기초" 같은 위치를 적으세요.
  사진만으로 층이나 동을 알 수 없으면 보이는 범위 안에서 "바닥 철근 구간", "합벽 철근 구간",
  "기초 배근 구간"처럼 지어내지 않은 위치 표현을 쓰세요.
- work_content: 업무일지에 바로 넣을 업무내용입니다. 사진에서 보이는 하자, 확인, 시정 지시,
  재확인, 보고 지시 내용을 공문체로 한 문장 작성하세요. 예: "피복두께 불량 확인 및 시정 조치 후
  재확인 및 보고 지시". 사진만으로 확정할 수 없는 내용은 단정하지 말고 "철근 배근 상태 확인 및
  간격·피복 확보 여부 점검 지시"처럼 확인 가능한 범위로 쓰세요. 사용자의 업무 문체에 맞게
  "검측", "시공상태 확인", "배근 상태 확인", "타설 전 확인", "도면검토", "시정 조치 후 재확인"
  같은 표현을 우선 사용하세요.
- tags: 검색과 분류에 쓸 짧은 한글 태그입니다. 위치, 공종, 부재, 점검 성격을 중심으로
  3~6개를 반환하세요. 예: ["203동", "지하2층", "바닥철근", "거푸집", "검측"]

${WORK_LOG_STYLE_EXAMPLES}

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"location": "203동 지하2층 바닥", "work_content": "바닥 철근 배근 및 거푸집 조립 상태 확인", "tags": ["203동", "지하2층", "바닥철근", "거푸집", "검측"]}`;

  const result = await model.generateContent([
    prompt,
    ...images.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.base64Data },
    })),
  ]);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { location: "", work_content: "", tags: [] };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    location: typeof parsed.location === "string" ? parsed.location : "",
    work_content:
      typeof parsed.work_content === "string" ? parsed.work_content : "",
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag: unknown) => typeof tag === "string")
      : [],
  };
}

export async function inferWorkLogFromKeyword(
  keyword: string
): Promise<InferredSitePhotoWorkLog> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `건설 현장 업무일지에 아래 키워드만 입력되었습니다 (사진 없음): "${keyword}"

이 키워드만 보고 구글 시트의 한 행으로 들어갈 값을 추론해주세요.

${SEOCHO_WORK_CONTEXT}

반드시 아래 세 개 키만 반환하세요.

- location: 키워드에 "203동 지하2층", "207동 B4F", "203동 EV PIT", "통로#2"처럼 위치를
  나타내는 표현이 있으면 그대로 쓰세요.
  위치 표현이 없으면 키워드 자체를 location으로 쓰세요. 지어내지 마세요.
- work_content: 업무일지에 바로 넣을 업무내용입니다. 키워드가 뜻하는 작업·확인·점검 내용을
  공문체 한 문장으로 작성하세요. 예: "203동 지하2층 바닥 철근" -> "바닥 철근 배근 상태 및
  피복 확보 여부 확인". 키워드만으로 확정할 수 없는 세부사항은 지어내지 말고, 확인 가능한
  범위로 쓰세요.
- tags: 검색과 분류에 쓸 짧은 한글 태그입니다. 위치, 공종, 점검 성격을 중심으로 2~5개를
  반환하세요.

${WORK_LOG_STYLE_EXAMPLES}

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"location": "203동 지하2층 바닥", "work_content": "바닥 철근 배근 상태 및 피복 확보 여부 확인", "tags": ["203동", "지하2층", "바닥철근"]}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { location: keyword, work_content: "", tags: [] };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    location: typeof parsed.location === "string" ? parsed.location : keyword,
    work_content:
      typeof parsed.work_content === "string" ? parsed.work_content : "",
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag: unknown) => typeof tag === "string")
      : [],
  };
}

const BRIEF_INSTRUCTION = `문서를 열지 않고도 내용을 파악할 수 있도록 briefing을 작성해주세요.
다음 형식으로, 다른 설명 없이 한글로만 답하세요:

핵심 요약: (2~3문장)
주요 내용:
- (항목)
- (항목)
- (항목)`;

export async function summarizeFromText(
  fileName: string,
  textContent: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const truncated = textContent.slice(0, 30000);
  const prompt = `파일명: "${fileName}"

아래는 이 문서에서 추출한 내용입니다:
"""
${truncated}
"""

${BRIEF_INSTRUCTION}`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

export async function summarizeFromInlineData(
  fileName: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `파일명: "${fileName}"

첨부된 파일의 실제 내용을 보고 아래 요청에 답하세요.

${BRIEF_INSTRUCTION}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType, data: base64Data } },
  ]);
  return result.response.text().trim();
}
