import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { Award, CalendarCheck, Clock3, Compass, CreditCard, Flame, PlayCircle, Target, Trophy, Zap } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Badge, MeResponse, PracticeSession } from "@speakez/shared";
import { api } from "../lib/api";
import { buttonMotion, cardVariants, listItemVariants, listVariants, quickSpring } from "../lib/motion";
import { formatSeconds, titleCase } from "../lib/format";
import { ParrotCoach } from "./ParrotCoach";

type Props = {
  me: MeResponse;
  sessions: PracticeSession[];
  onStart: () => void;
};

export function Dashboard({ me, sessions, onStart }: Props) {
  const maxWeekly = Math.max(1, ...me.streak.weeklyMinutes);
  const checkout = useMutation({
    mutationFn: me.profile.isPremium ? api.portal : api.checkout,
    onSuccess: ({ url }) => window.location.assign(url)
  });
  const weeklyTotal = me.streak.weeklyMinutes.reduce((sum, minutes) => sum + minutes, 0);
  const todayMinutes = me.streak.weeklyMinutes[me.streak.weeklyMinutes.length - 1] ?? 0;
  const coachMessage = me.streak.practicedToday
    ? `You're on the board today. One cleaner ending gets you closer to level ${me.profile.level + 1}.`
    : `${me.streak.currentStreak} days is a real streak. Start one sharp rep and keep it alive.`;

  return (
    <motion.section className="grid gap-4" variants={listVariants}>
      <motion.div className="rounded-lg border-2 border-ink bg-white p-5 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
        <div className="grid grid-cols-[1fr_auto] items-start gap-4 max-md:grid-cols-1">
          <div>
            <p className="text-sm font-black uppercase text-coral">Level {me.profile.level} speaker</p>
            <h2 className="mt-1 text-4xl font-black leading-tight text-ink max-md:text-3xl">Ready for today's rep?</h2>
            <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-ink/70">
              Prompt, record, review, improve. Keep it light, keep it moving.
            </p>
          </div>
          <motion.button
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-ink bg-mango px-5 py-3 font-black shadow-[5px_5px_0_#15131a]"
            onClick={onStart}
            {...buttonMotion}
          >
            <Zap size={18} />
            Start
          </motion.button>
        </div>

        <motion.div className="mt-5 grid grid-cols-4 gap-3 max-md:grid-cols-2" variants={listVariants}>
          <Metric icon={<Flame size={20} />} label="Streak" value={`${me.streak.currentStreak} days`} color="bg-coral" />
          <Metric icon={<Target size={20} />} label="Goal" value={`${me.profile.dailyGoalMinutes} min`} color="bg-mint" />
          <Metric icon={<Trophy size={20} />} label="XP" value={`${me.profile.xp}`} color="bg-mango" />
          <Metric icon={<CalendarCheck size={20} />} label="AI trial" value={me.usage.canUseAi ? "Ready" : "Used"} color="bg-aqua" />
        </motion.div>
      </motion.div>

      <motion.div className="rounded-lg border-2 border-ink bg-white p-5 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
        <div className="rounded-lg border-2 border-ink bg-[#fffaf0] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-ink">Weekly minutes</h3>
              <p className="text-sm font-bold text-ink/55">{weeklyTotal} minutes logged this week</p>
            </div>
            <span className="rounded-lg border-2 border-ink bg-white px-3 py-1 text-sm font-black text-ink/60">Goal fuel</span>
          </div>
          <div className="mt-4 flex h-32 items-end gap-3">
            {me.streak.weeklyMinutes.map((minutes, index) => (
              <motion.div key={index} className="flex flex-1 flex-col items-center gap-2" variants={listItemVariants}>
                <motion.div
                  className="w-full rounded-t-lg border-2 border-ink bg-mint shadow-[3px_0_0_#15131a]"
                  initial={{ height: 8 }}
                  animate={{ height: Math.max(8, (minutes / maxWeekly) * 96) }}
                  transition={{ ...quickSpring, delay: index * 0.04 }}
                  title={`${minutes} minutes`}
                />
                <span className="text-xs font-black text-ink/60">{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      <FlightPlan me={me} todayMinutes={todayMinutes} onStart={onStart} />
      <RecentTakes sessions={sessions.slice(0, 3)} />

      <motion.div className="grid grid-cols-2 items-stretch gap-4 max-md:grid-cols-1" variants={listVariants}>
        <BillingCard isPremium={me.profile.isPremium} checkout={checkout} />
        <BadgesCard badges={me.badges} />
      </motion.div>

      <ParrotCoach mood="celebrate" message={coachMessage} />
    </motion.section>
  );
}

function BillingCard({
  isPremium,
  checkout
}: {
  isPremium: boolean;
  checkout: UseMutationResult<{ url: string }, Error, void, unknown>;
}) {
  return (
    <motion.div className="rounded-lg border-2 border-ink bg-white p-4 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
      <div className="grid h-full grid-cols-[auto_1fr] gap-4 max-sm:grid-cols-1">
        <motion.div
          className="grid h-16 w-16 place-items-center rounded-lg border-2 border-ink bg-mint"
          whileHover={{ rotate: -5, scale: 1.04 }}
          transition={quickSpring}
        >
          <CreditCard size={26} />
        </motion.div>
        <div className="flex min-w-0 flex-col">
          <div>
            <h3 className="text-xl font-black text-ink">{isPremium ? "Premium" : "AI Coach"}</h3>
            <p className="mt-1 text-sm font-bold leading-5 text-ink/60">
              {isPremium ? "Unlimited analysis unlocked for every saved rep." : "$5/month after your free analysis, with deeper transcript feedback."}
            </p>
          </div>
          <motion.button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-mango px-4 py-3 font-black shadow-[4px_4px_0_#15131a] disabled:opacity-60"
            disabled={checkout.isPending}
            onClick={() => checkout.mutate()}
            {...buttonMotion}
          >
            <CreditCard size={18} />
            {checkout.isPending ? "Opening..." : isPremium ? "Manage billing" : "Upgrade"}
          </motion.button>
          {checkout.error && <p className="mt-3 text-sm font-bold text-coral">{checkout.error.message}</p>}
        </div>
      </div>
    </motion.div>
  );
}

function BadgesCard({ badges }: { badges: Badge[] }) {
  const visibleBadges = badges.slice(0, 2);
  const extraCount = Math.max(0, badges.length - visibleBadges.length);

  return (
    <motion.div className="rounded-lg border-2 border-ink bg-white p-4 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
      <div className="grid h-full grid-cols-[auto_1fr] gap-4 max-sm:grid-cols-1">
        <motion.div
          className="grid h-16 w-16 place-items-center rounded-lg border-2 border-ink bg-lilac text-white"
          whileHover={{ rotate: 5, scale: 1.04 }}
          transition={quickSpring}
        >
          <Award size={26} />
        </motion.div>
        <div className="min-w-0">
          <h3 className="text-xl font-black text-ink">Badges</h3>
          <p className="mt-1 text-sm font-bold text-ink/60">{badges.length} unlocked</p>
          <motion.div className="mt-3 space-y-2" variants={listVariants}>
            {badges.length === 0 && <p className="rounded-lg bg-[#fffaf0] p-3 text-sm font-bold text-ink/60">Your first badge is one rep away.</p>}
            {visibleBadges.map((badge) => (
              <motion.div key={badge.id} className="rounded-lg bg-[#fffaf0] p-3" variants={listItemVariants}>
                <p className="font-black text-ink">{badge.label}</p>
                <p className="line-clamp-2 text-sm font-semibold text-ink/60">{badge.description}</p>
              </motion.div>
            ))}
            {extraCount > 0 && <p className="text-sm font-black text-ink/55">+{extraCount} more waiting in your collection</p>}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function FlightPlan({ me, todayMinutes, onStart }: { me: MeResponse; todayMinutes: number; onStart: () => void }) {
  const goal = Math.max(1, me.profile.dailyGoalMinutes);
  const remaining = Math.max(0, goal - todayMinutes);
  const progress = Math.min(100, (todayMinutes / goal) * 100);

  return (
    <motion.div className="flex flex-col rounded-lg border-2 border-ink bg-white p-4 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border-2 border-ink bg-aqua p-3">
            <Compass size={22} />
          </div>
          <div>
            <h3 className="font-black text-ink">Today's flight plan</h3>
            <p className="text-sm font-bold text-ink/60">{remaining === 0 ? "Daily goal cleared" : `${remaining} min left to clear goal`}</p>
          </div>
        </div>
        <motion.button className="rounded-lg border-2 border-ink bg-mango p-3" aria-label="Start practice" onClick={onStart} {...buttonMotion}>
          <PlayCircle size={20} />
        </motion.button>
      </div>
      <div className="mt-5">
        <div className="h-4 overflow-hidden rounded-full border-2 border-ink bg-[#fffaf0]">
        <motion.div className="h-full bg-mint" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={quickSpring} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Today" value={`${todayMinutes}m`} />
        <MiniStat label="Longest" value={`${me.streak.longestStreak}d`} />
        <MiniStat label="Level" value={String(me.profile.level)} />
      </div>
    </motion.div>
  );
}

function RecentTakes({ sessions }: { sessions: PracticeSession[] }) {
  return (
    <motion.div className="flex flex-col rounded-lg border-2 border-ink bg-white p-4 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border-2 border-ink bg-coral p-3 text-white">
            <Clock3 size={22} />
          </div>
          <div>
            <h3 className="font-black text-ink">Recent takes</h3>
            <p className="text-sm font-bold text-ink/60">{sessions.length ? "Latest practice reps" : "No recordings saved yet"}</p>
          </div>
        </div>
      </div>
      <motion.div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1" variants={listVariants}>
        {sessions.length === 0 && (
          <motion.p className="rounded-lg bg-[#fffaf0] p-3 text-sm font-bold text-ink/60" variants={listItemVariants}>
            Start in Practice, save a recording, and it will show up here.
          </motion.p>
        )}
        {sessions.map((session) => (
          <motion.div key={session.id} className="rounded-lg bg-[#fffaf0] p-3" variants={listItemVariants}>
            <p className="line-clamp-1 font-black text-ink">{session.promptText || "Freestyle practice"}</p>
            <p className="mt-1 text-xs font-bold uppercase text-ink/55">
              {titleCase(session.sessionStyle)} · {formatSeconds(session.durationSeconds)} · {titleCase(session.status)}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#fffaf0] p-2">
      <p className="text-[11px] font-black uppercase text-ink/50">{label}</p>
      <p className="font-black text-ink">{value}</p>
    </div>
  );
}

function Metric({ icon, label, value, color }: { icon: ReactNode; label: string; value: string; color: string }) {
  return (
    <motion.div
      className="rounded-lg border-2 border-ink bg-[#fffaf0] p-3"
      variants={listItemVariants}
      whileHover={{ y: -4, rotate: -0.4, boxShadow: "5px 5px 0 #15131a" }}
      transition={quickSpring}
    >
      <motion.div className={`mb-2 inline-flex rounded-lg border-2 border-ink p-2 ${color}`} whileHover={{ rotate: [0, -8, 8, 0] }}>
        {icon}
      </motion.div>
      <p className="text-xs font-black uppercase text-ink/55">{label}</p>
      <p className="mt-1 text-xl font-black text-ink">{value}</p>
    </motion.div>
  );
}
