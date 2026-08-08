"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-clients/browser";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    router.push("/help");
    router.refresh();
  }

  return (
    <div className="luxury-surface flex flex-1 items-center justify-center px-4">
      <div className="luxury-card w-full max-w-sm rounded-xl p-8 text-center">
        <h1 className="font-serif text-2xl font-medium tracking-wide text-[var(--luxury-text)]">
          javis
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--luxury-text-muted)]">
          문서 검색
        </p>
        <p className="mt-4 text-sm text-[var(--luxury-text-muted)]">
          로그인 후 이용할 수 있습니다.
        </p>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="luxury-btn-ghost mt-6 w-full rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "이동 중..." : "Google로 로그인"}
        </button>

        <div className="mt-6 flex items-center gap-2 text-xs text-[var(--luxury-text-muted)]">
          <div className="luxury-divider flex-1" />
          또는 테스트 계정
          <div className="luxury-divider flex-1" />
        </div>

        <form onSubmit={handlePasswordLogin} className="mt-4 flex flex-col gap-2 text-left">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="luxury-input rounded-md p-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="luxury-input rounded-md p-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="luxury-btn-primary rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-rose-400">
            <span className="mr-1 font-semibold">오류</span>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
