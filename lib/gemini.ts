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
현장 태그를 종합해서 판단하고, 보통 필요한 문서 종류(체크리스트, 검측요청서, 배근도,
시공계획서 등) 관점에서 관련도 순으로 골라주세요. 목록에 없는 문서 종류가 빠져있다면
comment에서 "~ 문서는 아직 없습니다"처럼 언급해도 좋습니다.`
    : `저장된 문서 중 현장·구역 태그가 있는 문서가 없어서, 전체 문서를 대상으로
파일명·설명만 보고 관련도를 판단해야 합니다. 건설 현장 문서 관리 업무 맥락에서 이 키워드와
관련해 보통 찾게 되는 문서 종류(체크리스트, 검측요청서, 배근도, 시공계획서 등)를 추론해
관련도 순으로 골라주세요.`;

  const prompt = `사용자가 "${keyword}" 라는 짧은 현장·구역 이름 또는 키워드만 입력하고 연관검색을 요청했습니다.

${scopeExplanation}

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

export async function inferMetadataFromFileName(
  fileName: string
): Promise<InferredMetadata> {
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `건설 현장 문서 관리 서비스에 아래 파일명으로 문서가 업로드되었습니다.
파일명만 보고, 현장·구역명과 문서에 대한 짧은 한글 설명을 추론해주세요.

파일명: "${fileName}"

- site_name: 파일명에 "201동", "302동", "2공구"처럼 현장·구역을 나타내는 표현이 있으면 그대로 추출하세요.
  없으면 null로 답하세요. 추측해서 지어내지 마세요.
- description: 파일명만으로 추론할 수 있는 문서 종류나 용도를 한 문장으로 짧게 설명하세요.
  파일명을 그대로 반복하지 말고, 어떤 업무에 쓰이는 문서인지 설명하세요.

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"site_name": "201동", "description": "201동 골조 공사 체크리스트"}`;

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

- site_name: 이미지 안에 "201동", "302동", "2공구"처럼 현장·구역을 나타내는 표지판, 라벨, 문서
  제목 등이 실제로 보이면 그대로 적으세요. 보이지 않으면 null로 답하세요. 추측해서 지어내지 마세요.
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
{"site_name": "201동", "description": "201동 지하층 골조 공사 현장 사진, 철근 배근 작업 중", "is_site_photo": true, "work_log_entry": "201동 지하 1층 철근 배근 작업 진행 확인"}`;

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
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `건설 현장 업무일지에 사용할 사진이 업로드되었습니다 (파일명: "${fileName}").
이미지를 직접 보고 구글 시트의 한 행으로 들어갈 값을 추론해주세요.

반드시 아래 세 개 키만 반환하세요.

- location: 업무 위치입니다. 사진 안 표지판, 파일명, 촬영 맥락에서 확인되는 "201동 지하 1층",
  "201동 지상 1층", "2공구 PIT층" 같은 위치를 적으세요. 사진만으로 층이나 동을 알 수 없으면
  보이는 범위 안에서 "철근 배근 구간", "슬래브 단부"처럼 지어내지 않은 위치 표현을 쓰세요.
- work_content: 업무일지에 바로 넣을 업무내용입니다. 사진에서 보이는 하자, 확인, 시정 지시,
  재확인, 보고 지시 내용을 공문체로 한 문장 작성하세요. 예: "피복두께 불량 확인 및 시정 조치 후
  재확인 및 보고 지시". 사진만으로 확정할 수 없는 내용은 단정하지 말고 "철근 배근 상태 확인 및
  간격·피복 확보 여부 점검 지시"처럼 확인 가능한 범위로 쓰세요.
- tags: 검색과 분류에 쓸 짧은 한글 태그입니다. 위치, 공종, 부재, 점검 성격을 중심으로
  3~6개를 반환하세요. 예: ["201동", "지하1층", "철근", "피복두께", "시정지시"]

다른 설명 없이 반드시 아래 JSON 형식으로만 답하세요:
{"location": "201동 지하 1층", "work_content": "피복두께 불량 확인 및 시정 조치 후 재확인 및 보고 지시", "tags": ["201동", "지하1층", "철근", "피복두께", "시정지시"]}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType, data: base64Data } },
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
