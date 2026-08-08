import { HwpxReader, HwpxWriter, detectFormat, hwpToHwpx, HwpUnsupportedError } from "hwp-convert";

export { HwpUnsupportedError };

// 일부 .hwp 파일은 실제로는 한글 프로그램이 내보낸 HTML이라, 진짜 바이너리 HWP인지
// 시그니처로 먼저 확인합니다. HWP 5.0(OLE Compound File)뿐 아니라 hwp-convert가
// (지원은 안 하지만) 인식하는 HWP 3.0도 바이너리로 취급해, HTML strip 경로로
// 잘못 빠져 깨진 텍스트가 만들어지는 것을 막습니다.
export function isBinaryHwp(buffer: Buffer): boolean {
  const format = detectFormat(new Uint8Array(buffer));
  return format === "hwp" || format === "hwp3";
}

// hwp-convert로 HWP -> HWPX 변환 후 HwpxReader로 추출합니다. 표 셀 안 텍스트까지
// 재귀적으로 뽑아내는 경로가 HWPX 리더 쪽에 있어서, hwpToText로 바로 뽑는 것보다
// 이 경로가 더 안정적으로 표 내용을 포함합니다.
export async function extractHwpText(buffer: Buffer): Promise<string> {
  const hwpxBytes = await hwpToHwpx(new Uint8Array(buffer));
  const reader = new HwpxReader();
  await reader.loadFromArrayBuffer(
    hwpxBytes.buffer.slice(
      hwpxBytes.byteOffset,
      hwpxBytes.byteOffset + hwpxBytes.byteLength
    ) as ArrayBuffer
  );
  return reader.extractText();
}

// 평문을 한컴오피스에서 바로 열리는 .hwpx로 만듭니다. 실제 .hwp(바이너리) 쓰기는
// hwp-convert가 지원하지 않아 결과물은 항상 .hwpx입니다.
export async function textToHwpxBuffer(
  text: string,
  options?: { title?: string; creator?: string }
): Promise<Buffer> {
  const writer = new HwpxWriter();
  const bytes = await writer.createFromPlainText(text, options);
  return Buffer.from(bytes);
}
