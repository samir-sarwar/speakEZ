import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { env } from "../lib/env";
import { buttonMotion, listItemVariants, listVariants, popVariants, quickSpring } from "../lib/motion";
import { supabase } from "../lib/supabase";
import { ParrotCoach } from "./ParrotCoach";

type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [demoAuthed, setDemoAuthed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session || demoAuthed) return children;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabase) {
      if (env.demoMode) {
        setDemoAuthed(true);
      } else {
        setError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or enable VITE_DEMO_MODE.");
      }
      return;
    }
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin }
          })
        : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setError(authErrorMessage(result.error.message));
      return;
    }
    if (result.data.session) {
      setSession(result.data.session);
      return;
    }
    if (mode === "signup") {
      setNotice(`Account created for ${email}. Confirm your email, then log in here.`);
      setMode("signin");
    }
  }

  async function resendConfirmation() {
    if (!supabase || !email) return;
    setError("");
    setNotice("");
    setResending(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    setResending(false);
    if (resendError) {
      setError(authErrorMessage(resendError.message));
      return;
    }
    setNotice(`Confirmation email sent to ${email}.`);
  }

  return (
    <main className="noise soft-grid min-h-screen bg-[#fffaf0] px-6 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl grid-cols-[1.1fr_0.9fr] items-center gap-10 max-lg:grid-cols-1">
        <motion.section variants={listVariants} initial="initial" animate="animate">
          <motion.div className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-mango px-4 py-2 text-sm font-black text-ink shadow-[4px_4px_0_#15131a]" variants={popVariants}>
            <Sparkles size={16} />
            Daily speaking practice, less awkward by design
          </motion.div>
          <motion.h1 className="mt-8 max-w-3xl text-7xl font-black leading-[0.95] text-ink max-md:text-5xl" variants={listItemVariants}>
            SpeakEZ
          </motion.h1>
          <motion.p className="mt-6 max-w-2xl text-xl font-semibold leading-8 text-ink/78" variants={listItemVariants}>
            Pick a prompt, record your answer, keep your streak alive, and unlock gentle AI coaching when you want sharper feedback.
          </motion.p>
          <motion.div className="mt-8 grid max-w-2xl grid-cols-3 gap-3" variants={listVariants}>
            {["Quick fire", "Prep mode", "Freestyle"].map((item) => (
              <motion.div
                key={item}
                className="rounded-lg border-2 border-ink bg-white p-4 text-center font-black shadow-[5px_5px_0_#15131a]"
                variants={listItemVariants}
                whileHover={{ y: -4, rotate: item === "Prep mode" ? 0.6 : -0.6 }}
                transition={quickSpring}
              >
                {item}
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        <motion.section
          className="rounded-lg border-2 border-ink bg-white p-5 shadow-[12px_12px_0_#15131a]"
          variants={popVariants}
          initial="initial"
          animate="animate"
        >
          <ParrotCoach mood="ready" message="Create an account first so every practice rep can count toward your streak." />
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label className="text-sm font-black text-ink" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="mt-2 w-full rounded-lg border-2 border-ink bg-[#fffaf0] px-4 py-3 font-semibold outline-none focus:bg-white"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                type="email"
                required={!env.demoMode}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-sm font-black text-ink" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="mt-2 w-full rounded-lg border-2 border-ink bg-[#fffaf0] px-4 py-3 font-semibold outline-none focus:bg-white"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                type="password"
                required={!env.demoMode}
                minLength={6}
                placeholder="6+ characters"
              />
            </div>
            {error && <p className="rounded-lg bg-coral/15 p-3 text-sm font-bold text-coral">{error}</p>}
            {notice && <p className="rounded-lg bg-mint/20 p-3 text-sm font-bold text-ink/75">{notice}</p>}
            <motion.button className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-mint px-5 py-3 font-black text-ink shadow-[5px_5px_0_#15131a]" {...buttonMotion}>
              {env.demoMode ? "Enter demo app" : mode === "signup" ? "Create account" : "Log in"}
              <ArrowRight size={18} />
            </motion.button>
          </form>
          {!env.demoMode && (
            <div className="mt-5 space-y-3">
              <motion.button
                className="w-full text-sm font-black text-ink/70"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError("");
                  setNotice("");
                }}
                {...buttonMotion}
              >
                {mode === "signup" ? "Already have an account? Log in" : "Need an account? Sign up"}
              </motion.button>
              {mode === "signin" && (
                <motion.button
                  className="w-full text-sm font-black text-coral disabled:opacity-50"
                  disabled={!email || resending}
                  onClick={resendConfirmation}
                  {...buttonMotion}
                >
                  {resending ? "Sending confirmation..." : "Resend confirmation email"}
                </motion.button>
              )}
            </div>
          )}
          {env.demoMode && <p className="mt-4 text-center text-xs font-bold text-ink/55">Demo mode is active until Supabase env vars are configured.</p>}
        </motion.section>
      </div>
    </main>
  );
}

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) {
    return "Email not confirmed yet. Check your inbox, or use Resend confirmation email below.";
  }
  return message;
}
