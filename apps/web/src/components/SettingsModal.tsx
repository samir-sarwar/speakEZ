import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCard, LogOut, Save, Settings, X } from "lucide-react";
import type { MeResponse, ProfilePatch } from "@speakez/shared";
import { api } from "../lib/api";
import { buttonMotion, listItemVariants, listVariants, popVariants } from "../lib/motion";
import { supabase } from "../lib/supabase";
import { ParrotCoach } from "./ParrotCoach";

type Props = {
  open: boolean;
  me: MeResponse;
  onClose: () => void;
};

export function SettingsModal({ open, me, onClose }: Props) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(me.profile.displayName);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(String(me.profile.dailyGoalMinutes));
  const [timezone, setTimezone] = useState(me.profile.timezone);
  const updateProfile = useMutation({
    mutationFn: (body: ProfilePatch) => api.updateMe(body),
    onSuccess: (nextMe) => {
      queryClient.setQueryData(["me"], nextMe);
    }
  });
  const billing = useMutation({
    mutationFn: me.profile.isPremium ? api.portal : api.checkout,
    onSuccess: ({ url }) => window.location.assign(url)
  });

  useEffect(() => {
    if (!open) return;
    setDisplayName(me.profile.displayName);
    setDailyGoalMinutes(String(me.profile.dailyGoalMinutes));
    setTimezone(me.profile.timezone);
  }, [me.profile.dailyGoalMinutes, me.profile.displayName, me.profile.timezone, open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    updateProfile.mutate({
      displayName: displayName.trim() || "Speaker",
      dailyGoalMinutes: Math.min(120, Math.max(1, Number(dailyGoalMinutes) || me.profile.dailyGoalMinutes)),
      timezone: timezone.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  function signOut() {
    if (supabase) {
      supabase.auth.signOut();
      return;
    }
    window.location.reload();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section
            className="w-full max-w-3xl rounded-lg border-2 border-ink bg-white p-5 shadow-[12px_12px_0_#15131a]"
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border-2 border-ink bg-mint p-3">
                  <Settings size={22} />
                </div>
                <div>
                  <p className="text-sm font-black uppercase text-coral">Settings</p>
                  <h2 className="text-2xl font-black text-ink">Your voice room</h2>
                </div>
              </div>
              <motion.button className="rounded-lg border-2 border-ink bg-white p-2" aria-label="Close settings" onClick={onClose} {...buttonMotion}>
                <X size={18} />
              </motion.button>
            </div>

            <motion.div className="grid grid-cols-[1fr_260px] gap-4 max-md:grid-cols-1" variants={listVariants} initial="initial" animate="animate">
              <motion.form className="space-y-4 rounded-lg bg-[#fffaf0] p-4" onSubmit={submit} variants={listItemVariants}>
                <div>
                  <label className="text-sm font-black text-ink" htmlFor="display-name">
                    Display name
                  </label>
                  <input
                    id="display-name"
                    className="mt-2 w-full rounded-lg border-2 border-ink bg-white px-4 py-3 font-semibold outline-none focus:bg-mint/10"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  <div>
                    <label className="text-sm font-black text-ink" htmlFor="daily-goal">
                      Daily goal
                    </label>
                    <input
                      id="daily-goal"
                      className="mt-2 w-full rounded-lg border-2 border-ink bg-white px-4 py-3 font-semibold outline-none focus:bg-mint/10"
                      value={dailyGoalMinutes}
                      min={1}
                      max={120}
                      onChange={(event) => setDailyGoalMinutes(event.target.value)}
                      type="number"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-black text-ink" htmlFor="timezone">
                      Timezone
                    </label>
                    <input
                      id="timezone"
                      className="mt-2 w-full rounded-lg border-2 border-ink bg-white px-4 py-3 font-semibold outline-none focus:bg-mint/10"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                    />
                  </div>
                </div>
                <motion.button
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-mango px-4 py-3 font-black shadow-[4px_4px_0_#15131a] disabled:opacity-60"
                  disabled={updateProfile.isPending}
                  {...buttonMotion}
                >
                  <Save size={18} />
                  {updateProfile.isPending ? "Saving..." : "Save settings"}
                </motion.button>
                {updateProfile.isSuccess && <p className="rounded-lg bg-mint/20 p-3 text-sm font-bold text-ink">Saved. Your dashboard is up to date.</p>}
                {updateProfile.error && <p className="rounded-lg bg-coral/15 p-3 text-sm font-bold text-coral">{updateProfile.error.message}</p>}
              </motion.form>

              <motion.div className="space-y-3" variants={listItemVariants}>
                <ParrotCoach compact mood="thinking" message="Tune the room once, then get back to the rep." />
                <motion.button
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-white px-4 py-3 font-black shadow-[4px_4px_0_#15131a]"
                  disabled={billing.isPending}
                  onClick={() => billing.mutate()}
                  {...buttonMotion}
                >
                  <CreditCard size={18} />
                  {billing.isPending ? "Opening..." : me.profile.isPremium ? "Manage billing" : "Upgrade"}
                </motion.button>
                {billing.error && <p className="rounded-lg bg-coral/15 p-3 text-sm font-bold text-coral">{billing.error.message}</p>}
                <motion.button
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-white px-4 py-3 font-black"
                  onClick={signOut}
                  {...buttonMotion}
                >
                  <LogOut size={18} />
                  Log out
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
