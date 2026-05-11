import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Lock, MessageCircle, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { AiAnalysis, MeResponse } from "@speakez/shared";
import { api } from "../lib/api";
import { buttonMotion, cardVariants, listItemVariants, listVariants, quickSpring } from "../lib/motion";
import { ParrotCoach } from "./ParrotCoach";

type Props = {
  sessionId: string | null;
  me: MeResponse;
};

export function AiPanel({ sessionId, me }: Props) {
  const queryClient = useQueryClient();
  const analysis = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Save the session before analyzing.");
      return api.analyze(sessionId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] })
  });
  const result = analysis.data as AiAnalysis | undefined;
  const canUseAi = me.profile.isPremium || me.usage.canUseAi;

  return (
    <motion.aside className="rounded-lg border-2 border-ink bg-white p-5 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <motion.div className="rounded-lg border-2 border-ink bg-lilac p-3 text-white" whileHover={{ rotate: 5, scale: 1.05 }} transition={quickSpring}>
            <Brain size={22} />
          </motion.div>
          <div>
            <h3 className="font-black text-ink">AI Coach</h3>
            <p className="text-sm font-bold text-ink/60">{me.profile.isPremium ? "Premium unlocked" : "1 free analysis included"}</p>
          </div>
        </div>
        {!canUseAi && <Lock size={20} className="text-ink/50" />}
      </div>

      {!result && (
        <motion.div className="mt-5 space-y-4" variants={listVariants} initial="initial" animate="animate">
          <ParrotCoach
            compact
            mood={analysis.isPending ? "thinking" : canUseAi ? "ready" : "sleepy"}
            message={analysis.isPending ? "Reading the transcript for structure, clarity, and pace." : canUseAi ? "Save a take, then I can mark up what got stronger." : "Upgrade unlocks more coaching passes when you are ready."}
          />
          <motion.div className="rounded-lg bg-[#fffaf0] p-4" variants={listItemVariants}>
          <p className="font-semibold leading-6 text-ink/70">
            Get a gentle transcript-based scorecard for clarity, structure, pacing, confidence, and concision.
          </p>
          <motion.button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-mint px-4 py-3 font-black shadow-[4px_4px_0_#15131a] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!sessionId || !canUseAi || analysis.isPending}
            onClick={() => analysis.mutate()}
            {...buttonMotion}
          >
            <Sparkles size={18} />
            {analysis.isPending ? "Analyzing..." : canUseAi ? "Analyze this take" : "Upgrade to analyze"}
          </motion.button>
          {analysis.error && <p className="mt-3 text-sm font-bold text-coral">{analysis.error.message}</p>}
          </motion.div>
        </motion.div>
      )}

      {result && (
        <motion.div className="mt-5 space-y-4" variants={listVariants} initial="initial" animate="animate">
          <ParrotCoach compact mood="celebrate" message={result.encouragement} />
          <motion.div className="rounded-lg border-2 border-ink bg-mango p-4" variants={listItemVariants}>
            <p className="text-sm font-black uppercase text-ink/60">Overall score</p>
            <motion.p className="text-5xl font-black text-ink" initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={quickSpring}>
              {result.overallScore}
            </motion.p>
          </motion.div>
          <motion.div className="grid grid-cols-2 gap-2" variants={listVariants}>
            {Object.entries(result.categoryScores).map(([label, value]) => (
              <motion.div key={label} className="rounded-lg bg-[#fffaf0] p-3" variants={listItemVariants}>
                <p className="text-xs font-black uppercase text-ink/50">{label}</p>
                <p className="text-xl font-black text-ink">{value}</p>
              </motion.div>
            ))}
          </motion.div>
          <List title="Strengths" items={result.strengths} />
          <List title="Try next" items={result.improvements} />
          {result.fillerWords.length > 0 && (
            <div>
              <h4 className="mb-2 font-black text-ink">Filler words</h4>
              <div className="flex flex-wrap gap-2">
                {result.fillerWords.map((word) => (
                  <span key={word} className="rounded-lg border-2 border-ink bg-white px-3 py-1 text-sm font-black text-ink/70">
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4 className="mb-2 font-black text-ink">Transcript</h4>
            <p className="max-h-36 overflow-auto rounded-lg bg-[#fffaf0] p-3 text-sm font-semibold leading-6 text-ink/70">{result.transcript}</p>
          </div>
          <motion.button className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-white px-4 py-3 font-black" {...buttonMotion}>
            <MessageCircle size={18} />
            Ask follow-up
          </motion.button>
        </motion.div>
      )}
    </motion.aside>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-2 font-black text-ink">{title}</h4>
      <motion.div className="space-y-2" variants={listVariants}>
        {items.map((item) => (
          <motion.p key={item} className="rounded-lg bg-[#fffaf0] p-3 text-sm font-bold text-ink/70" variants={listItemVariants}>
            {item}
          </motion.p>
        ))}
      </motion.div>
    </div>
  );
}
