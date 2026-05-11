import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mic, RefreshCcw, Save, Square, Timer, Video, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ContentType, MeResponse, PracticeSession, SessionStyle } from "@speakez/shared";
import {
  contentTypes,
  freestyleUploadLimitSeconds,
  prepPresets,
  quickFireCountdownSeconds,
  responsePresets
} from "@speakez/shared";
import { api } from "../lib/api";
import { exportComposedMp4 } from "../lib/exportVideo";
import { formatSeconds, titleCase } from "../lib/format";
import { buttonMotion, cardVariants, listItemVariants, listVariants, panelSwapVariants, popVariants, quickSpring } from "../lib/motion";
import { useSessionStore } from "../lib/sessionStore";
import { AiPanel } from "./AiPanel";
import { ParrotCoach } from "./ParrotCoach";

type Props = {
  me: MeResponse;
};

export function PracticeStudio({ me }: Props) {
  const store = useSessionStore();
  const setPrompt = useSessionStore((state) => state.setPrompt);
  const queryClient = useQueryClient();
  const [savedSession, setSavedSession] = useState<PracticeSession | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const promptQuery = useQuery({
    queryKey: ["prompt", store.contentType],
    queryFn: () => api.randomPrompt(store.contentType),
    enabled: store.sessionStyle !== "freestyle"
  });

  useEffect(() => {
    if (promptQuery.data) setPrompt(promptQuery.data);
  }, [promptQuery.data, setPrompt]);

  const createSession = useMutation({ mutationFn: api.createSession });

  const completeSession = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.completeSession>[1] }) => api.completeSession(id, body),
    onSuccess: (session) => {
      setSavedSession(session);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  async function saveRecording() {
    if (!store.recordingBlob) return;
    const localOnly = store.localOnly || store.durationSeconds > freestyleUploadLimitSeconds;
    let created = savedSession;
    if (!created) {
      const response = await createSession.mutateAsync({
          contentType: store.contentType,
          sessionStyle: store.sessionStyle,
          promptId: store.prompt?.id,
          promptText: store.prompt?.text || "Freestyle practice",
          prepSeconds: store.sessionStyle === "prep_mode" ? store.prepSeconds : 0,
          responseSeconds: store.sessionStyle === "freestyle" ? null : store.responseSeconds,
          expectedMimeType: store.recordingBlob.type || "video/webm",
          localOnly
      });
      created = response.session;
      if (!localOnly) await api.uploadRecording(response.upload, store.recordingBlob);
    }

    await completeSession.mutateAsync({
      id: created.id,
      body: {
        durationSeconds: store.durationSeconds,
        storagePath: localOnly ? null : created.storagePath,
        analyze: false,
        localOnly
      }
    });
  }

  async function exportVideo() {
    if (!store.recordingBlob && !store.recordingUrl) return;
    setExporting(true);
    setExportError("");
    setExportNotice("");
    try {
      const result = await exportComposedMp4({
        recordingBlob: store.recordingBlob,
        videoUrl: store.recordingUrl || undefined,
        prompt: store.prompt?.text || "Freestyle practice",
        contentType: store.contentType,
        durationSeconds: store.durationSeconds
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `speakez-${Date.now()}.${result.extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (result.notice) setExportNotice(result.notice);
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "MP4 export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <motion.section className="grid grid-cols-[1fr_360px] gap-4 max-2xl:grid-cols-1" variants={listVariants}>
      <motion.div className="rounded-lg border-2 border-ink bg-white p-5 shadow-[8px_8px_0_#15131a]" variants={cardVariants}>
        <ModePicker />
        <div className="mt-5">
          <AnimatePresence mode="wait">
            {store.step === "setup" && <SetupCard key="setup" />}
            {store.step !== "setup" && store.step !== "review" && <RecorderCard key="record" />}
            {store.step === "review" && (
              <ReviewCard
                key="review"
                saving={createSession.isPending || completeSession.isPending}
                saved={Boolean(savedSession)}
                exporting={exporting}
                exportError={exportError}
                exportNotice={exportNotice}
                onSave={saveRecording}
                onExport={exportVideo}
                onRetry={() => {
                  setSavedSession(null);
                  setExportNotice("");
                  store.resetRecording();
                  promptQuery.refetch();
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      <AiPanel sessionId={savedSession?.id ?? null} me={me} />
    </motion.section>
  );
}

function ModePicker() {
  const store = useSessionStore();
  const styles: SessionStyle[] = ["quick_fire", "prep_mode", "freestyle"];
  return (
    <motion.div className="grid grid-cols-[1.2fr_0.8fr] gap-4 max-lg:grid-cols-1" variants={listVariants} initial="initial" animate="animate">
      <div>
        <p className="mb-2 text-sm font-black uppercase text-ink/55">Content</p>
        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-2">
          {contentTypes.map((type) => (
            <motion.button
              key={type}
              className={`rounded-lg border-2 border-ink px-3 py-2 text-sm font-black transition ${
                store.contentType === type ? "bg-mango shadow-[4px_4px_0_#15131a]" : "bg-[#fffaf0]"
              }`}
              onClick={() => store.setMode(type as ContentType, store.sessionStyle)}
              variants={listItemVariants}
              {...buttonMotion}
            >
              {titleCase(type)}
            </motion.button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-black uppercase text-ink/55">Style</p>
        <div className="grid grid-cols-3 gap-2">
          {styles.map((style) => (
            <motion.button
              key={style}
              className={`rounded-lg border-2 border-ink px-3 py-2 text-sm font-black transition ${
                store.sessionStyle === style ? "bg-mint shadow-[4px_4px_0_#15131a]" : "bg-[#fffaf0]"
              }`}
              onClick={() => store.setMode(store.contentType, style)}
              variants={listItemVariants}
              {...buttonMotion}
            >
              {titleCase(style)}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function SetupCard() {
  const store = useSessionStore();
  return (
    <motion.div
      className="rounded-lg border-2 border-ink bg-[#fffaf0] p-6"
      variants={panelSwapVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="grid grid-cols-[1fr_320px] gap-6 max-lg:grid-cols-1">
        <div>
          <p className="text-sm font-black uppercase text-coral">{titleCase(store.sessionStyle)}</p>
          <h2 className="mt-2 text-4xl font-black text-ink">
            {store.sessionStyle === "freestyle" ? "Freestyle practice" : `${titleCase(store.contentType)} locked`}
          </h2>
          <p className="mt-4 max-w-2xl font-semibold leading-7 text-ink/65">
            Camera and microphone permission will be requested when you start. One take, no pause, clean rep.
          </p>
        </div>
        <div className="space-y-4">
          <ParrotCoach
            compact
            mood={store.sessionStyle === "prep_mode" ? "thinking" : store.sessionStyle === "freestyle" ? "ready" : "celebrate"}
            message={store.sessionStyle === "prep_mode" ? "Take the prep, then land the ending." : "Pick the mode, hit start, and let the rep do its job."}
          />
          {store.sessionStyle === "prep_mode" && (
            <Picker label="Prep" values={[...prepPresets]} value={store.prepSeconds} onChange={store.setPrepSeconds} />
          )}
          {store.sessionStyle !== "freestyle" && (
            <Picker label="Response" values={[...responsePresets]} value={store.responseSeconds} onChange={store.setResponseSeconds} />
          )}
          <motion.button
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-coral px-5 py-3 font-black text-white shadow-[5px_5px_0_#15131a]"
            onClick={() => store.setStep("permission")}
            {...buttonMotion}
          >
            <Video size={18} />
            Start session
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function Picker({ label, values, value, onChange }: { label: string; values: number[]; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-black uppercase text-ink/55">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        {values.map((seconds) => (
          <motion.button
            key={seconds}
            className={`rounded-lg border-2 border-ink px-3 py-2 text-sm font-black ${value === seconds ? "bg-aqua" : "bg-white"}`}
            onClick={() => onChange(seconds)}
            {...buttonMotion}
          >
            {formatSeconds(seconds)}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function RecorderCard() {
  const store = useSessionStore();
  const step = store.step;
  const sessionStyle = store.sessionStyle;
  const responseSeconds = store.responseSeconds;
  const setStep = store.setStep;
  const setRecording = store.setRecording;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const initialStepRef = useRef(step);
  const initialStyleRef = useRef(sessionStyle);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [prepLeft, setPrepLeft] = useState(store.prepSeconds);
  const [countdown, setCountdown] = useState(quickFireCountdownSeconds);
  const [elapsed, setElapsed] = useState(0);
  const [permissionError, setPermissionError] = useState("");

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setPermissionError("This browser does not support in-browser recording.");
      return;
    }
    let activeStream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
      .then((nextStream) => {
        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        activeStream = nextStream;
        setStream(nextStream);
        if (videoRef.current) videoRef.current.srcObject = nextStream;
        if (initialStepRef.current === "permission") {
          setStep(initialStyleRef.current === "prep_mode" ? "prep" : "countdown");
        }
      })
      .catch(() => setPermissionError("Camera or microphone permission was blocked."));
    return () => {
      cancelled = true;
      activeStream?.getTracks().forEach((track) => track.stop());
    };
  }, [setStep]);

  useEffect(() => {
    if (step !== "prep" || !stream || permissionError) return;
    if (prepLeft <= 0) {
      setStep("countdown");
      return;
    }
    const id = window.setTimeout(() => setPrepLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [prepLeft, step, stream, permissionError, setStep]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const startRecording = useCallback(() => {
    if (!stream || recorderRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const duration = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      stream.getTracks().forEach((track) => track.stop());
      setRecording(blob, duration, sessionStyle === "freestyle" && duration > freestyleUploadLimitSeconds);
    };
    startedAtRef.current = Date.now();
    recorder.start();
    setStep("recording");
  }, [stream, setRecording, sessionStyle, setStep]);

  useEffect(() => {
    if (step !== "countdown" || !stream || permissionError) return;
    if (countdown <= 0) {
      startRecording();
      return;
    }
    const id = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [countdown, step, stream, permissionError, startRecording]);

  useEffect(() => {
    if (step !== "recording") return;
    const id = window.setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(nextElapsed);
      if (sessionStyle !== "freestyle" && nextElapsed >= responseSeconds) stopRecording();
    }, 250);
    return () => window.clearInterval(id);
  }, [step, sessionStyle, responseSeconds, stopRecording]);

  const timeLeft = store.sessionStyle === "freestyle" ? elapsed : Math.max(0, store.responseSeconds - elapsed);
  const promptText = store.prompt?.text || "Freestyle practice";
  const countdownHelper =
    store.sessionStyle === "quick_fire"
      ? "Prompt appears when recording starts."
      : store.sessionStyle === "freestyle"
        ? "Start talking when the timer lands."
        : promptText;
  return (
    <motion.div variants={panelSwapVariants} initial="initial" animate="animate" exit="exit">
      <div className="recorder-frame relative overflow-hidden rounded-lg border-2 border-ink bg-ink">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        {permissionError && <div className="absolute inset-0 grid place-items-center bg-ink p-8 text-center text-xl font-black text-white">{permissionError}</div>}
        {!permissionError && (store.step === "permission" || !stream) && (
          <Overlay label="Camera check" value="..." helper="Approve camera and microphone access to reveal the session." />
        )}
        {store.step === "prep" && (
          <Overlay label="Prep time" value={formatSeconds(prepLeft)} helper={promptText} />
        )}
        {store.step === "countdown" && <Overlay label="Recording starts in" value={String(countdown)} helper={countdownHelper} />}
        {store.step === "recording" && (
          <motion.div
            className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 bg-ink/75 p-4 text-white"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={quickSpring}
          >
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-coral" />
              <span className="font-black">Recording</span>
              <span className="font-semibold text-white/70">{promptText}</span>
            </div>
            <div className="flex items-center gap-2 font-black">
              <Timer size={18} />
              {formatSeconds(timeLeft)}
            </div>
          </motion.div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4 max-md:grid-cols-1">
        <div className="flex items-center gap-3 text-sm font-black text-ink/60">
          <span className="flex items-center gap-1"><Mic size={16} /> Mic</span>
          <span className="flex items-center gap-1"><Video size={16} /> Camera</span>
        </div>
        {store.step === "recording" && (
          <motion.button className="flex items-center justify-center gap-2 rounded-lg border-2 border-ink bg-coral px-5 py-3 font-black text-white shadow-[4px_4px_0_#15131a]" onClick={stopRecording} {...buttonMotion}>
            <Square size={16} />
            Stop
          </motion.button>
        )}
      </div>
      {store.step === "recording" && (
        <div className="mt-4">
          <ParrotCoach compact mood="recording" message="Keep going. Short sentences, clear ending, eyes up." />
        </div>
      )}
    </motion.div>
  );
}

function Overlay({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <motion.div className="absolute inset-0 grid place-items-center bg-ink/70 p-10 text-center text-white" variants={popVariants} initial="initial" animate="animate" exit="exit">
      <motion.div animate={{ scale: value.length <= 2 ? [1, 1.05, 1] : 1 }} transition={{ repeat: Infinity, duration: 1.1 }}>
        <p className="text-sm font-black uppercase text-mango">{label}</p>
        <p className="mt-3 text-8xl font-black">{value}</p>
        <p className="mx-auto mt-5 max-w-3xl text-xl font-semibold leading-8 text-white/85">{helper}</p>
      </motion.div>
    </motion.div>
  );
}

function ReviewCard({
  saving,
  saved,
  exporting,
  exportError,
  exportNotice,
  onSave,
  onExport,
  onRetry
}: {
  saving: boolean;
  saved: boolean;
  exporting: boolean;
  exportError: string;
  exportNotice: string;
  onSave: () => void;
  onExport: () => void;
  onRetry: () => void;
}) {
  const store = useSessionStore();
  return (
    <motion.div className="grid grid-cols-[1fr_320px] gap-5 max-xl:grid-cols-1" variants={panelSwapVariants} initial="initial" animate="animate" exit="exit">
      <div>
        <video src={store.recordingUrl || undefined} controls className="recorder-frame w-full rounded-lg border-2 border-ink bg-ink object-cover" />
      </div>
      <div className="space-y-3">
        <ParrotCoach compact mood="celebrate" message="Good rep. Save it, export it, or take another swing while it is fresh." />
        <div className="rounded-lg bg-[#fffaf0] p-4">
          <p className="text-xs font-black uppercase text-ink/50">Prompt</p>
          <p className="mt-1 font-black text-ink">{store.prompt?.text || "Freestyle practice"}</p>
          <p className="mt-3 text-sm font-bold text-ink/60">Duration {formatSeconds(store.durationSeconds)}</p>
          {store.localOnly && <p className="mt-3 text-sm font-black text-coral">Long freestyle recording: local export only.</p>}
        </div>
        <motion.button className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-mint px-4 py-3 font-black shadow-[4px_4px_0_#15131a]" onClick={onSave} disabled={saving || saved || store.localOnly} {...buttonMotion}>
          <Save size={18} />
          {saved ? "Saved" : saving ? "Saving..." : "Save recording"}
        </motion.button>
        <motion.button className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-mango px-4 py-3 font-black shadow-[4px_4px_0_#15131a]" onClick={onExport} disabled={exporting} {...buttonMotion}>
          <Download size={18} />
          {exporting ? "Exporting..." : "Export video"}
        </motion.button>
        {exportNotice && <p className="rounded-lg bg-mint/20 p-3 text-sm font-bold text-ink">{exportNotice}</p>}
        {exportError && <p className="rounded-lg bg-coral/15 p-3 text-sm font-bold text-coral">{exportError}</p>}
        <motion.button className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-white px-4 py-3 font-black" onClick={onRetry} {...buttonMotion}>
          <RefreshCcw size={18} />
          New prompt
        </motion.button>
        <div className="rounded-lg border-2 border-ink bg-white p-4">
          <div className="flex items-center gap-2 font-black text-ink">
            <Wand2 size={18} />
            Export overlay
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">Landscape video includes your prompt, timer, and SpeakEZ watermark.</p>
        </div>
      </div>
    </motion.div>
  );
}
