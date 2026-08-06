import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // route handler가 아닌 곳(서버 컴포넌트)에서 호출되면 쿠키를 못 쓸 수 있는데,
            // 미들웨어가 세션 갱신을 담당하므로 여기서는 무시해도 됩니다.
          }
        },
      },
    }
  );
}
