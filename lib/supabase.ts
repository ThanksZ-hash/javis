import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type DocumentRow = {
  document_id: string;
  file_name: string;
  storage_path: string;
  description: string | null;
  site_name: string | null;
  file_size: number | null;
  uploaded_at: string;
};
