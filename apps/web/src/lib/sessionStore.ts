import { create } from "zustand";
import type { ContentType, Prompt, SessionStyle } from "@speakez/shared";

type RecorderStep = "setup" | "permission" | "prep" | "countdown" | "recording" | "review";

type SessionState = {
  contentType: ContentType;
  sessionStyle: SessionStyle;
  prepSeconds: number;
  responseSeconds: number;
  prompt: Prompt | null;
  step: RecorderStep;
  recordingBlob: Blob | null;
  recordingUrl: string | null;
  durationSeconds: number;
  localOnly: boolean;
  setMode: (contentType: ContentType, sessionStyle: SessionStyle) => void;
  setPrepSeconds: (seconds: number) => void;
  setResponseSeconds: (seconds: number) => void;
  setPrompt: (prompt: Prompt | null) => void;
  setStep: (step: RecorderStep) => void;
  setRecording: (blob: Blob, durationSeconds: number, localOnly: boolean) => void;
  resetRecording: () => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  contentType: "prompt",
  sessionStyle: "quick_fire",
  prepSeconds: 60,
  responseSeconds: 120,
  prompt: null,
  step: "setup",
  recordingBlob: null,
  recordingUrl: null,
  durationSeconds: 0,
  localOnly: false,
  setMode: (contentType, sessionStyle) =>
    set({
      contentType,
      sessionStyle,
      prompt: sessionStyle === "freestyle" ? null : get().prompt
    }),
  setPrepSeconds: (prepSeconds) => set({ prepSeconds }),
  setResponseSeconds: (responseSeconds) => set({ responseSeconds }),
  setPrompt: (prompt) => set({ prompt }),
  setStep: (step) => set({ step }),
  setRecording: (blob, durationSeconds, localOnly) => {
    const previousUrl = get().recordingUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    set({ recordingBlob: blob, recordingUrl: URL.createObjectURL(blob), durationSeconds, localOnly, step: "review" });
  },
  resetRecording: () => {
    const previousUrl = get().recordingUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    set({ recordingBlob: null, recordingUrl: null, durationSeconds: 0, localOnly: false, step: "setup" });
  }
}));
