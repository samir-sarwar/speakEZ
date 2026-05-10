export const contentTypes = [
  "prompt",
  "word",
  "interview",
  "storytelling",
  "debate",
  "sales_pitch",
  "elevator_pitch",
  "timed_response",
  "daily_challenge"
] as const;

export const sessionStyles = ["quick_fire", "prep_mode", "freestyle"] as const;

export type ContentType = (typeof contentTypes)[number];
export type SessionStyle = (typeof sessionStyles)[number];

export type Prompt = {
  id: string;
  type: ContentType;
  text: string;
};

export type PracticeSession = {
  id: string;
  contentType: ContentType;
  sessionStyle: SessionStyle;
  promptText: string;
  prepSeconds: number;
  responseSeconds: number | null;
  durationSeconds: number;
  storagePath: string | null;
  playbackUrl?: string | null;
  status: "draft" | "uploaded" | "local_only" | "analyzing" | "complete" | "failed";
  createdAt: string;
};

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  dailyGoalMinutes: number;
  isPremium: boolean;
  xp: number;
  level: number;
};

export type ProfilePatch = {
  displayName?: string;
  timezone?: string;
  dailyGoalMinutes?: number;
};

export type StreakSummary = {
  currentStreak: number;
  longestStreak: number;
  practicedToday: boolean;
  weeklyMinutes: number[];
};

export type UsageLimits = {
  lifetimeFreeAnalysesUsed: number;
  lifetimeFreeAnalysesAllowed: number;
  canUseAi: boolean;
};

export type MeResponse = {
  profile: Profile;
  usage: UsageLimits;
  streak: StreakSummary;
  badges: Badge[];
};

export type Badge = {
  id: string;
  label: string;
  description: string;
  unlockedAt: string;
};

export type AnalysisCategoryScores = {
  clarity: number;
  structure: number;
  pacing: number;
  confidence: number;
  concision: number;
};

export type AiAnalysis = {
  id: string;
  sessionId: string;
  status: "queued" | "transcribing" | "analyzing" | "complete" | "failed";
  transcript: string;
  overallScore: number;
  categoryScores: AnalysisCategoryScores;
  fillerWords: string[];
  pacingWpm: number;
  strengths: string[];
  improvements: string[];
  encouragement: string;
  createdAt: string;
};

export type CreateSessionRequest = {
  contentType: ContentType;
  sessionStyle: SessionStyle;
  promptId?: string;
  promptText: string;
  prepSeconds: number;
  responseSeconds: number | null;
  expectedMimeType: string;
  localOnly: boolean;
};

export type CreateSessionResponse = {
  session: PracticeSession;
  upload?: {
    path: string;
    token: string;
    signedUrl: string;
  };
};

export type CompleteSessionRequest = {
  durationSeconds: number;
  storagePath: string | null;
  analyze: boolean;
  localOnly: boolean;
};

export const prepPresets = [15, 30, 60, 120] as const;
export const responsePresets = [30, 60, 120, 180, 300] as const;
export const quickFireCountdownSeconds = 3;
export const freestyleUploadLimitSeconds = 600;
