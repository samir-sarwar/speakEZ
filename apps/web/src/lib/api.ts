import type {
  AiAnalysis,
  CompleteSessionRequest,
  ContentType,
  CreateSessionRequest,
  CreateSessionResponse,
  MeResponse,
  PracticeSession,
  Profile,
  ProfilePatch,
  Prompt
} from "@speakez/shared";
import { env } from "./env";
import { supabase } from "./supabase";
import { getLocalPrompt } from "./prompts";

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (env.demoMode) return demoRequest<T>(path, init);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader())
  };
  if (init.headers instanceof Headers) {
    init.headers.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(init.headers)) {
    for (const [key, value] of init.headers) headers[key] = value;
  } else if (init.headers) {
    Object.assign(headers, init.headers);
  }
  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(readErrorMessage(message, response.status));
  }
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<MeResponse>("/me"),
  updateMe: (body: ProfilePatch) => request<MeResponse>("/me", { method: "PATCH", body: JSON.stringify(body) }),
  randomPrompt: (type: ContentType) => request<Prompt>(`/prompts/random?type=${type}`),
  createSession: (body: CreateSessionRequest) =>
    request<CreateSessionResponse>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  completeSession: (id: string, body: CompleteSessionRequest) =>
    request<PracticeSession>(`/sessions/${id}/complete`, { method: "PATCH", body: JSON.stringify(body) }),
  sessions: () => request<{ sessions: PracticeSession[] }>("/sessions"),
  session: (id: string) => request<PracticeSession>(`/sessions/${id}`),
  deleteSession: (id: string) => request<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" }),
  analyze: (id: string) => request<AiAnalysis>(`/sessions/${id}/analyze`, { method: "POST" }),
  analysis: (id: string) => request<AiAnalysis>(`/sessions/${id}/analysis`),
  checkout: () => request<{ url: string }>("/billing/checkout", { method: "POST" }),
  portal: () => request<{ url: string }>("/billing/portal", { method: "POST" }),
  uploadRecording: async (upload: CreateSessionResponse["upload"], blob: Blob) => {
    if (!upload) throw new Error("Recording upload was not configured for this session.");
    if (env.demoMode) {
      demoRecordingUrls.set(upload.path, URL.createObjectURL(blob));
      return;
    }
    if (supabase && upload.token && upload.path) {
      const { error } = await supabase.storage
        .from("recordings")
        .uploadToSignedUrl(upload.path, upload.token, blob, { contentType: blob.type || "video/webm" });
      if (error) throw error;
      return;
    }
    if (!upload.signedUrl) throw new Error("Recording upload URL was not returned.");
    const response = await fetch(upload.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": blob.type || "video/webm",
        "x-upsert": "false"
      },
      body: blob
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Upload failed: ${response.status}`);
    }
  }
};

const demoSessions: PracticeSession[] = [];
const demoRecordingUrls = new Map<string, string>();
const demoProfile: Profile = {
  id: "demo-user",
  email: "demo@speakez.local",
  displayName: "Samir",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dailyGoalMinutes: 5,
  isPremium: false,
  xp: 780,
  level: 4
};
let freeAnalysisUsed = false;

async function demoRequest<T>(path: string, init: RequestInit): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  if (path === "/me" && init.method === "PATCH") {
    const body = JSON.parse(String(init.body || "{}")) as ProfilePatch;
    if (typeof body.displayName === "string") demoProfile.displayName = body.displayName;
    if (typeof body.timezone === "string") demoProfile.timezone = body.timezone;
    if (typeof body.dailyGoalMinutes === "number") demoProfile.dailyGoalMinutes = Math.min(120, Math.max(1, body.dailyGoalMinutes));
    return demoMe() as T;
  }
  if (path === "/me") {
    return demoMe() as T;
  }
  if (path.startsWith("/prompts/random")) {
    const url = new URL(`http://local${path}`);
    return getLocalPrompt((url.searchParams.get("type") || "prompt") as ContentType) as T;
  }
  if (path === "/sessions" && init.method === "POST") {
    const body = JSON.parse(String(init.body)) as CreateSessionRequest;
    const session: PracticeSession = {
      id: crypto.randomUUID(),
      contentType: body.contentType,
      sessionStyle: body.sessionStyle,
      promptText: body.promptText,
      prepSeconds: body.prepSeconds,
      responseSeconds: body.responseSeconds,
      durationSeconds: 0,
      storagePath: body.localOnly ? null : `demo/${crypto.randomUUID()}.webm`,
      status: body.localOnly ? "local_only" : "draft",
      createdAt: new Date().toISOString()
    };
    demoSessions.unshift(session);
    const upload = session.storagePath ? { path: session.storagePath, token: "demo", signedUrl: "demo://recording" } : undefined;
    return { session, upload } as T;
  }
  if (path.endsWith("/complete")) {
    const id = path.split("/")[2];
    const body = JSON.parse(String(init.body)) as CompleteSessionRequest;
    const session = demoSessions.find((item) => item.id === id);
    if (!session) throw new Error("Session not found");
    session.durationSeconds = body.durationSeconds;
    session.status = body.localOnly ? "local_only" : body.analyze ? "analyzing" : "uploaded";
    return session as T;
  }
  if (path === "/sessions") {
    return { sessions: demoSessions } as T;
  }
  if (path.startsWith("/sessions/") && init.method === "DELETE") {
    const id = path.split("/")[2];
    const index = demoSessions.findIndex((item) => item.id === id);
    if (index >= 0) {
      const [session] = demoSessions.splice(index, 1);
      if (session.storagePath) {
        const url = demoRecordingUrls.get(session.storagePath);
        if (url) URL.revokeObjectURL(url);
        demoRecordingUrls.delete(session.storagePath);
      }
    }
    return { ok: true } as T;
  }
  if (path.startsWith("/sessions/") && !path.endsWith("/analyze") && !path.endsWith("/analysis") && init.method !== "DELETE") {
    const id = path.split("/")[2];
    const session = demoSessions.find((item) => item.id === id);
    if (!session) throw new Error("Session not found");
    return {
      ...session,
      playbackUrl: session.storagePath ? demoRecordingUrls.get(session.storagePath) || null : null
    } as T;
  }
  if (path.endsWith("/analyze")) {
    throw new Error("Live AI analysis is disabled in demo mode. Set VITE_DEMO_MODE=false and sign in to run real analysis.");
  }
  if (path.endsWith("/analysis")) {
    throw new Error("No live AI analysis exists in demo mode.");
  }
  if (path === "/billing/checkout" || path === "/billing/portal") {
    throw new Error("Billing is disabled in demo mode. Set VITE_DEMO_MODE=false and sign in to open Stripe Checkout.");
  }
  return { ok: true } as T;
}

function demoMe(): MeResponse {
  return {
    profile: { ...demoProfile },
    usage: {
      lifetimeFreeAnalysesUsed: freeAnalysisUsed ? 1 : 0,
      lifetimeFreeAnalysesAllowed: 1,
      canUseAi: !freeAnalysisUsed
    },
    streak: {
      currentStreak: 6,
      longestStreak: 9,
      practicedToday: true,
      weeklyMinutes: [4, 8, 0, 6, 3, 9, 5]
    },
    badges: [
      {
        id: "first-flight",
        label: "First Flight",
        description: "Completed your first recording.",
        unlockedAt: new Date().toISOString()
      }
    ]
  };
}

function readErrorMessage(body: string, status: number) {
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error === "missing bearer token") return "Please log in before opening billing or running AI analysis.";
      if (parsed.error) return parsed.error;
    } catch {
      return body;
    }
  }
  return `Request failed: ${status}`;
}
