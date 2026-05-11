import { motion, useReducedMotion } from "framer-motion";
import { popVariants } from "../lib/motion";

export type ParrotMood = "ready" | "celebrate" | "thinking" | "recording" | "sleepy";
type ParrotSize = "brand" | "sm" | "md";

type Props = {
  mood?: ParrotMood;
  message: string;
  title?: string;
  compact?: boolean;
  className?: string;
};

type MascotProps = {
  mood?: ParrotMood;
  size?: ParrotSize;
  className?: string;
};

const moodCopy: Record<ParrotMood, string> = {
  ready: "Coach note",
  celebrate: "Nice lift",
  thinking: "Coach is thinking",
  recording: "On air",
  sleepy: "Quiet perch"
};

const moodAccent: Record<ParrotMood, string> = {
  ready: "bg-aqua",
  celebrate: "bg-mango",
  thinking: "bg-lilac",
  recording: "bg-coral",
  sleepy: "bg-mint"
};

export function ParrotCoach({ mood = "ready", message, title, compact = false, className = "" }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`relative overflow-hidden rounded-lg border-2 border-ink bg-white shadow-[8px_8px_0_#15131a] ${compact ? "p-3" : "p-4"} ${className}`}
      variants={popVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={reduceMotion ? undefined : { y: -2, rotate: -0.15 }}
    >
      <div className="relative z-10 flex items-center gap-4">
        <ParrotMascot mood={mood} size={compact ? "sm" : "md"} />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-coral">{title || moodCopy[mood]}</p>
          <p className={`${compact ? "text-sm leading-5" : "text-sm leading-6"} mt-1 font-semibold text-ink`}>{message}</p>
        </div>
      </div>
      <motion.div
        className={`absolute -right-6 -top-6 h-16 w-16 rounded-full border-2 border-ink ${moodAccent[mood]} opacity-25`}
        animate={reduceMotion ? {} : { scale: [1, 1.16, 1], rotate: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2.1 }}
      />
    </motion.div>
  );
}

export function ParrotMascot({ mood = "ready", size = "md", className = "" }: MascotProps) {
  const reduceMotion = useReducedMotion();
  const isSleepy = mood === "sleepy";
  const isRecording = mood === "recording";
  const isCelebrate = mood === "celebrate";
  const bodyLoop = reduceMotion
    ? {}
    : isRecording
      ? { scale: [1, 1.04, 1], rotate: [-1, 1, -1] }
      : isSleepy
        ? { y: [0, 1, 0] }
        : { y: [0, -6, 0], rotate: [-1, 1.5, -1] };
  const frameClass = size === "brand" ? "h-12 w-12" : size === "sm" ? "h-16 w-16" : "h-20 w-20";
  const scaleClass = size === "brand" ? "scale-[0.58]" : size === "sm" ? "scale-[0.8]" : "scale-100";

  return (
    <motion.div
      className={`${frameClass} relative shrink-0 overflow-visible ${className}`}
      animate={bodyLoop}
      transition={{ repeat: Infinity, duration: isRecording ? 0.75 : isSleepy ? 3 : 1.65, ease: "easeInOut" }}
      aria-hidden="true"
    >
      <div className={`relative h-20 w-20 origin-top-left ${scaleClass}`}>
          {isCelebrate && <MascotSparkles reduceMotion={Boolean(reduceMotion)} />}
          {isRecording && <div className="absolute left-1 top-1 h-3 w-3 animate-ping rounded-full bg-coral" />}
          <motion.div
            className="absolute left-1 top-7 h-9 w-12 origin-right rounded-full border-2 border-ink bg-aqua"
            animate={reduceMotion ? {} : { rotate: mood === "thinking" ? [-8, -18, -8] : [-12, -32, -12], x: [0, -2, 0] }}
            transition={{ repeat: Infinity, duration: isSleepy ? 2.8 : 0.95, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute left-8 top-7 h-10 w-9 origin-left rounded-full border-2 border-ink bg-mango"
            animate={reduceMotion ? {} : { rotate: mood === "thinking" ? [5, 11, 5] : [8, 24, 8], x: [0, 2, 0] }}
            transition={{ repeat: Infinity, duration: isSleepy ? 2.8 : 1.05, ease: "easeInOut" }}
          />
          <div className="absolute left-5 top-3 h-14 w-12 rounded-[42%] border-2 border-ink bg-mint" />
          <motion.div
            className="absolute left-8 top-0 h-6 w-2 origin-bottom rotate-[-28deg] rounded-full border-2 border-ink bg-lilac"
            animate={reduceMotion ? {} : { rotate: [-28, -44, -28] }}
            transition={{ repeat: Infinity, duration: mood === "thinking" ? 0.7 : 1.25 }}
          />
          <motion.div
            className="absolute left-11 top-0 h-6 w-2 origin-bottom rotate-[26deg] rounded-full border-2 border-ink bg-coral"
            animate={reduceMotion ? {} : { rotate: [26, 43, 26] }}
            transition={{ repeat: Infinity, duration: mood === "thinking" ? 0.72 : 1.3 }}
          />
          <div className="absolute left-12 top-8 h-7 w-8 rounded-full border-2 border-ink bg-mango" />
          <motion.div
            className="absolute left-[58px] top-[39px] h-3 w-6 rounded-r-full border-2 border-ink bg-coral"
            animate={reduceMotion ? {} : isRecording ? { scaleX: [1, 1.35, 0.85, 1] } : { scaleX: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: isRecording ? 0.38 : 1.6 }}
          />
          <div className="absolute left-[46px] top-[26px] h-4 w-4 rounded-full border-2 border-ink bg-white" />
          <motion.div
            className="absolute left-[51px] top-[31px] h-1.5 w-1.5 rounded-full bg-ink"
            animate={reduceMotion ? {} : { scaleY: isSleepy ? [0.25, 0.25, 0.25] : [1, 1, 0.12, 1] }}
            transition={{ repeat: Infinity, duration: isSleepy ? 3 : 2.8, times: [0, 0.9, 0.94, 1] }}
          />
          <div className="absolute bottom-1 left-8 h-4 w-7 rounded-b-full border-2 border-ink bg-coral" />
      </div>
    </motion.div>
  );
}

function MascotSparkles({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="absolute h-2 w-2 rounded-full border border-ink bg-mango"
          style={{ left: [4, 54, 66][index], top: [10, 2, 58][index] }}
          animate={reduceMotion ? {} : { scale: [0.6, 1.3, 0.6], y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 1.1 + index * 0.14, delay: index * 0.12 }}
        />
      ))}
    </>
  );
}
