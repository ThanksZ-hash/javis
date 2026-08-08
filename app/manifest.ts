import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "javis 문서 검색",
    short_name: "javis",
    description: "자연어로 저장된 문서를 찾고 현장 기록을 관리합니다.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0908",
    theme_color: "#0a0908",
    lang: "ko",
    orientation: "portrait",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
