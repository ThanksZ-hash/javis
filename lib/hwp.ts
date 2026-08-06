import { parse } from "hwp.js";

type HwpParagraphItem = { type: number; value: string | number };
type HwpParagraph = { content: HwpParagraphItem[] };
type HwpSection = { content: HwpParagraph[] };
type HwpDocument = { sections: HwpSection[] };

// hwp.js는 실제 렌더링(Viewer)까지는 지원이 불안정해서, 문단의 문자 스트림만 그대로
// 이어붙여 일반 텍스트를 뽑아냅니다. 표·도형 안의 텍스트는 이 방식으로는 못 뽑습니다.
export function extractHwpText(buffer: Buffer): string {
  // hwp.js의 타입 선언은 CFB$Blob을 요구한다고 되어있지만, 실제 구현은 base64 문자열을
  // 받도록 되어있어(런타임으로 확인함) 여기서는 타입 선언 쪽이 부정확한 것으로 판단합니다.
  const doc = parse(
    buffer.toString("base64") as unknown as Parameters<typeof parse>[0]
  ) as HwpDocument;
  const lines: string[] = [];

  for (const section of doc.sections) {
    for (const paragraph of section.content) {
      let line = "";
      for (const item of paragraph.content) {
        if (item.type === 0 && typeof item.value === "string") {
          line += item.value;
        }
      }
      if (line.trim()) lines.push(line);
    }
  }

  return lines.join("\n");
}

// 일부 .hwp 파일은 실제로는 한글 프로그램이 내보낸 HTML이라, 진짜 바이너리 HWP인지
// 시그니처(OLE Compound File signature)로 먼저 확인합니다.
export function isBinaryHwp(buffer: Buffer): boolean {
  const signature = buffer.subarray(0, 8).toString("hex");
  return signature === "d0cf11e0a1b11ae1";
}
