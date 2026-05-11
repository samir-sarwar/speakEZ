import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, LogOut, Rocket, Settings, Video } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "./lib/api";
import { buttonMotion, pageVariants, quickSpring } from "./lib/motion";
import { supabase } from "./lib/supabase";
import { AuthGate } from "./components/AuthGate";
import { Dashboard } from "./components/Dashboard";
import { HistoryPanel } from "./components/HistoryPanel";
import { ParrotMascot } from "./components/ParrotCoach";
import { PracticeStudio } from "./components/PracticeStudio";
import { SettingsModal } from "./components/SettingsModal";

type View = "dashboard" | "practice" | "history";

export default function App() {
  return (
    <AuthGate>
      <SpeakEzApp />
    </AuthGate>
  );
}

function SpeakEzApp() {
  const [view, setView] = useState<View>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const sessionsQuery = useQuery({ queryKey: ["sessions"], queryFn: api.sessions });
  const deleteSession = useMutation({
    mutationFn: api.deleteSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] })
  });
  const nav = useMemo(
    () => [
      { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
      { id: "practice" as const, label: "Practice", icon: Rocket },
      { id: "history" as const, label: "History", icon: Video }
    ],
    []
  );

  function signOut() {
    if (supabase) {
      supabase.auth.signOut();
      return;
    }
    window.location.reload();
  }

  if (meQuery.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fffaf0]">
        <div className="rounded-lg border-2 border-ink bg-white p-8 text-center shadow-[8px_8px_0_#15131a]">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-ink border-t-mango" />
          <p className="mt-4 font-black text-ink">Warming up your voice room...</p>
        </div>
      </main>
    );
  }

  if (meQuery.error || !meQuery.data) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fffaf0] p-6">
        <div className="rounded-lg border-2 border-ink bg-white p-8 shadow-[8px_8px_0_#15131a]">
          <h1 className="text-2xl font-black text-ink">Could not load SpeakEZ</h1>
          <p className="mt-2 font-semibold text-ink/60">{meQuery.error?.message || "Unknown error"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="noise soft-grid min-h-screen bg-[#fffaf0] px-5 py-5">
      <div className="mx-auto grid max-w-[1500px] grid-cols-[260px_1fr] gap-5 max-lg:grid-cols-1">
        <motion.aside
          className="flex rounded-lg border-2 border-ink bg-white p-4 shadow-[8px_8px_0_#15131a] max-lg:flex-col lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)] lg:flex-col"
          initial={{ opacity: 0, x: -16, rotate: -0.3 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={quickSpring}
        >
          <div className="flex items-center gap-3">
            <motion.div
              className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg border-2 border-ink bg-mint"
              animate={{ rotate: [0, -4, 4, 0] }}
              transition={{ repeat: Infinity, repeatDelay: 4, duration: 0.75 }}
            >
              <ParrotMascot mood="ready" size="brand" />
            </motion.div>
            <div>
              <p className="text-2xl font-black text-ink">SpeakEZ</p>
              <p className="text-xs font-black uppercase text-ink/50">Daily voice reps</p>
            </div>
          </div>
          <nav className="mt-7 space-y-2">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.id}
                  className={`relative flex w-full items-center gap-3 overflow-hidden rounded-lg border-2 border-ink px-4 py-3 font-black transition ${
                    view === item.id ? "bg-mango shadow-[4px_4px_0_#15131a]" : "bg-[#fffaf0] hover:bg-white"
                  }`}
                  onClick={() => setView(item.id)}
                  {...buttonMotion}
                >
                  {view === item.id && (
                    <motion.span
                      layoutId="active-nav-splash"
                      className="absolute inset-y-1 left-1 w-1.5 rounded-full bg-coral"
                      transition={quickSpring}
                    />
                  )}
                  <Icon size={18} />
                  <span className="relative">{item.label}</span>
                </motion.button>
              );
            })}
          </nav>
          <motion.div className="mt-7 rounded-lg bg-[#fffaf0] p-4" variants={pageVariants} initial="initial" animate="animate">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-ink">{meQuery.data.profile.displayName}</p>
                <p className="mt-1 truncate text-xs font-bold text-ink/55">{meQuery.data.profile.email}</p>
              </div>
              <motion.button
                className="rounded-lg border-2 border-ink bg-white p-2"
                aria-label="Open settings"
                onClick={() => setSettingsOpen(true)}
                {...buttonMotion}
              >
                <Settings size={16} />
              </motion.button>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full border-2 border-ink bg-white">
              <motion.div
                className="h-full bg-mint"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (meQuery.data.profile.xp % 250) / 2.5)}%` }}
                transition={{ ...quickSpring, delay: 0.25 }}
              />
            </div>
            <p className="mt-2 text-xs font-black text-ink/50">Level {meQuery.data.profile.level}</p>
          </motion.div>
          <div className="mt-auto pt-6">
            <motion.button
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-white px-4 py-3 font-black"
              onClick={signOut}
              {...buttonMotion}
            >
              <LogOut size={18} />
              Log out
            </motion.button>
          </div>
        </motion.aside>

        <section className="min-w-0">
          {view !== "dashboard" && (
            <motion.header
              className="mb-4 flex items-center justify-between gap-4 rounded-lg border-2 border-ink bg-white px-5 py-4 shadow-[7px_7px_0_#15131a]"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={quickSpring}
            >
              <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-sm font-black uppercase text-coral">{view}</p>
                <h1 className="text-3xl font-black text-ink">{view === "practice" ? "Practice studio" : "Past reps"}</h1>
              </motion.div>
              <motion.button className="rounded-lg border-2 border-ink bg-mint p-3" aria-label="Settings" onClick={() => setSettingsOpen(true)} {...buttonMotion}>
                <Settings size={22} />
              </motion.button>
            </motion.header>
          )}

          <AnimatePresence mode="wait">
            <motion.section key={view} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {view === "dashboard" && <Dashboard me={meQuery.data} sessions={sessionsQuery.data?.sessions ?? []} onStart={() => setView("practice")} />}
              {view === "practice" && <PracticeStudio me={meQuery.data} />}
              {view === "history" && (
                <HistoryPanel sessions={sessionsQuery.data?.sessions ?? []} onDelete={(id) => deleteSession.mutate(id)} />
              )}
            </motion.section>
          </AnimatePresence>
        </section>
      </div>
      <SettingsModal open={settingsOpen} me={meQuery.data} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
