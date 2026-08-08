import type { NextConfig } from "next";
import { hostname, networkInterfaces } from "node:os";

const machineHost = hostname().replace(/\.local$/, "");
const localDevOrigins = [
  "localhost",
  `${machineHost}.local`,
  "*.local",
  ...Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((networkInterface) => networkInterface.family === "IPv4" && !networkInterface.internal)
    .map((networkInterface) => networkInterface.address),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: localDevOrigins,
  turbopack: {
    root: __dirname,
  },
  // DWG 업로드 시 dwgread(정적 링크된 Linux 바이너리)를 shell out해서 쓰기 위해,
  // 자동 파일 추적이 잡아내지 못하는 이 바이너리를 명시적으로 번들에 포함시킵니다.
  outputFileTracingIncludes: {
    "/api/infer-metadata": ["./bin/dwgread"],
  },
};

export default nextConfig;
