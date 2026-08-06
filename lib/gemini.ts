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
        `${i}. 파일명: ${d.file_name} / 설명: ${d.description || "(없음)"}`
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
