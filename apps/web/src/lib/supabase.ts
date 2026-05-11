import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase = env.demoMode || !env.supabaseUrl || !env.supabaseAnonKey
  ? null
  : createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
