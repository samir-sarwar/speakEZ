import { useMutation } from "@tanstack/react-query";
import { Loader2, Play, Trash2, Video, X } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PracticeSession } from "@speakez/shared";
import { api } from "../lib/api";
import { formatSeconds, titleCase } from "../lib/format";
import { buttonMotion, cardVariants, listItemVariants, listVariants, popVariants, quickSpring } from "../lib/motion";
import { ParrotCoach } from "./ParrotCoach";

type Props = {
  sessions: PracticeSession[];
  onDelete: (id: string) => void;
};

export function HistoryPanel({ sessions, onDelete }: Props) {
  const [preview, setPreview] = useState<PracticeSession | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);
  const openSession = useMutation({
    mutationFn: api.session,
    onMutate: (id) => {
      setOpeningId(id);
      setOpenError("");
      setFailedSessionId(null);
    },
    onSuccess: (session) => {
      setVideoError("");
      setPreview(session);
    },
    onError: (error, id) => {
      setOpenError(error instanceof Error ? error.message : "Could not open recording.");
      setFailedSessionId(id);
    },
    onSettled: () => setOpeningId(null)
  });

  return (
    <motion.section className="rounded-lg border-2 border-ink bg-white p-5 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-ink">History</h2>
        <span className="text-sm font-black text-ink/50">Metadata first, videos on demand</span>
      </div>
      {openError && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border-2 border-ink bg-coral/15 p-3 text-sm font-bold text-coral max-md:flex-col max-md:items-stretch">
          <p>{openError}</p>
          {failedSessionId && (
            <motion.button
              className="rounded-lg border-2 border-ink bg-white px-3 py-2 font-black text-ink transition hover:bg-mint"
              onClick={() => openSession.mutate(failedSessionId)}
              disabled={openSession.isPending}
              {...buttonMotion}
            >
              Try again
            </motion.button>
          )}
        </div>
      )}
      <motion.div className="mt-5 space-y-3" variants={listVariants} initial="initial" animate="animate">
        {sessions.length === 0 && (
          <ParrotCoach mood="sleepy" message="Your first recording will land here. Start a practice rep and this perch wakes up." />
        )}
        {sessions.map((session) => {
          const isOpening = openingId === session.id;
          return (
            <motion.article
              key={session.id}
              className="flex items-center justify-between gap-4 rounded-lg border-2 border-ink bg-[#fffaf0] p-4 max-md:flex-col max-md:items-stretch"
              variants={listItemVariants}
              whileHover={{ y: -3, boxShadow: "5px 5px 0 #15131a" }}
              transition={quickSpring}
            >
              <div className="flex items-center gap-4">
                <motion.div className="rounded-lg border-2 border-ink bg-aqua p-3" whileHover={{ rotate: -6, scale: 1.04 }} transition={quickSpring}>
                  <Video size={20} />
                </motion.div>
                <div>
                  <p className="line-clamp-1 font-black text-ink">{session.promptText || "Freestyle practice"}</p>
                  <p className="mt-1 text-sm font-bold text-ink/60">
                    {titleCase(session.contentType)} · {titleCase(session.sessionStyle)} · {formatSeconds(session.durationSeconds)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(session.status === "uploaded" || session.status === "complete") && (
                  <motion.button
                    className="rounded-lg border-2 border-ink bg-white p-2 transition hover:bg-mint disabled:opacity-60"
                    aria-label={isOpening ? "Opening recording" : "Play recording"}
                    onClick={() => openSession.mutate(session.id)}
                    disabled={isOpening}
                    {...buttonMotion}
                  >
                    {isOpening ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                  </motion.button>
                )}
                <motion.button
                  className="rounded-lg border-2 border-ink bg-white p-2 transition hover:bg-coral hover:text-white"
                  aria-label="Delete session"
                  onClick={() => onDelete(session.id)}
                  {...buttonMotion}
                >
                  <Trash2 size={18} />
                </motion.button>
              </div>
            </motion.article>
          );
        })}
      </motion.div>
      <AnimatePresence>
        {preview && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="w-full max-w-5xl rounded-lg border-2 border-ink bg-white p-4 shadow-[10px_10px_0_#15131a]" variants={popVariants} initial="initial" animate="animate" exit="exit">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="line-clamp-1 font-black text-ink">{preview.promptText || "Freestyle practice"}</p>
              <motion.button
                className="rounded-lg border-2 border-ink bg-white p-2"
                aria-label="Close preview"
                onClick={() => {
                  setVideoError("");
                  setPreview(null);
                }}
                {...buttonMotion}
              >
                <X size={18} />
              </motion.button>
            </div>
            {preview.playbackUrl && !videoError ? (
              <video
                src={preview.playbackUrl}
                controls
                className="recorder-frame w-full rounded-lg border-2 border-ink bg-ink object-cover"
                onError={() => setVideoError("Recording loaded, but the browser could not play the video URL. Try again in a moment.")}
              />
            ) : (
              <ParrotCoach mood="sleepy" message={videoError || "Recording is not available."} />
            )}
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
