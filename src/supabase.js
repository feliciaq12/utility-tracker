import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL;

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log("ENV TEST:", {
  url: supabaseUrl,
  key: supabasePublishableKey?.slice(0, 10),
});

if (!supabaseUrl) {
  throw new Error(
    "Missing VITE_SUPABASE_URL"
  );
}

export const supabase =
  createClient(
    supabaseUrl,
    supabasePublishableKey
  );
