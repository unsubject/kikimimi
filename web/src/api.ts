import type {
  TodayResponse,
  Item,
  UserSettings,
  TtsVoice,
  ReviewQueueResponse,
  SrsRating,
  OnyomiRule,
  ShadowGrade,
  OpenerResponse,
  TalkResponse,
  TalkTurn,
  Gloss,
  GlossResponse,
  ProgressResponse,
  Deliverable,
  GauntletItem,
  GauntletResult,
  PushSubscriptionJSON,
} from "@kikimimi/shared";

/**
 * Single-user API client. The app token is stored in localStorage (spec §2:
 * one long-lived token, no auth flows) and sent as a Bearer header.
 */
const TOKEN_KEY = "kikimimi_token";

export const getToken = (): string => localStorage.getItem(TOKEN_KEY) ?? "";
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t.trim());
export const hasToken = (): boolean => getToken().length > 0;

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getToken()}`,
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) throw new ApiError("Unauthorized — check your access token.", 401);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

/** POST multipart/form-data with the bearer header (the audio/voice routes).
 * Mirrors `req` but leaves the browser to set the multipart content-type. */
async function reqForm<T>(path: string, form: FormData, failMsg: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? failMsg, res.status);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// --- Signed audio token -----------------------------------------------------
// Audio elements can't send an Authorization header, so /audio is reached with a
// `?t=` token. We use a SHORT-LIVED signed token (minted by /audio-token), never
// the master bearer token, so the master credential never lands in a URL (and
// thus not in CDN logs, history, or Cache Storage). Cached in localStorage and
// refreshed in the background before expiry.
const AUDIO_TOK_KEY = "kikimimi_audio_tok";
let audioTok: { token: string; exp: number } | null = loadAudioTok();
let audioTokInflight: Promise<void> | null = null;

function loadAudioTok(): { token: string; exp: number } | null {
  try {
    const raw = localStorage.getItem(AUDIO_TOK_KEY);
    return raw ? (JSON.parse(raw) as { token: string; exp: number }) : null;
  } catch {
    return null;
  }
}

/** Ensure a fresh audio token is cached (fetches one if missing/near expiry). */
export async function ensureAudioToken(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (audioTok && audioTok.exp - now > 3600) return; // still >1h of life
  if (!audioTokInflight) {
    audioTokInflight = req<{ token: string; exp: number }>("/audio-token")
      .then((t) => {
        audioTok = t;
        try {
          localStorage.setItem(AUDIO_TOK_KEY, JSON.stringify(t));
        } catch {
          /* ignore quota / private mode */
        }
      })
      .catch(() => {
        /* keep any old token; audio may 401 until the next attempt */
      })
      .finally(() => {
        audioTokInflight = null;
      });
  }
  return audioTokInflight;
}

/** True for http(s) URLs only — guard server-supplied links before using them as
 * an href/src (defence-in-depth vs a javascript: value). */
export function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

export const api = {
  config: () => req<{ vapidPublicKey: string; voices: TtsVoice[] }>("/config"),
  today: () => req<TodayResponse>("/today"),
  items: (offset = 0) => req<{ items: Item[] }>(`/items?offset=${offset}`),
  more: () => req<{ item: Item }>("/more", { method: "POST" }),
  explainBack: (itemId: string, text: string) =>
    req<{
      grade: { score: number; feedback: string; missed_points: string[] };
      transition: { action: string; toStage: number } | null;
      cost: TodayResponse["cost"];
    }>("/explain-back", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, text }),
    }),
  tts: (text: string) =>
    req<{ key: string }>("/tts", { method: "POST", body: JSON.stringify({ text }) }),
  onyomi: () => req<{ rules: OnyomiRule[] }>("/onyomi"),
  seedOnyomi: () => req<{ added: number }>("/onyomi/seed", { method: "POST" }),
  shadow: (targetText: string, audio: Blob) => {
    const form = new FormData();
    form.append("target_text", targetText);
    form.append("audio", audio, "shadow.webm");
    return reqForm<{ grade: ShadowGrade; transcript: string }>("/shadow", form, "shadow failed");
  },
  // POST: the opener has a paid, non-idempotent side effect (Sonnet on a cache miss).
  talkOpener: (itemId: string) =>
    req<OpenerResponse>(`/talk/opener?item_id=${encodeURIComponent(itemId)}`, { method: "POST" }),
  talk: (itemId: string, audio: Blob, history: TalkTurn[]) => {
    const form = new FormData();
    form.append("item_id", itemId);
    form.append("history", JSON.stringify(history));
    form.append("audio", audio, "talk.webm");
    return reqForm<TalkResponse>("/talk", form, "talk failed");
  },
  gloss: (word: string, context: string) =>
    req<GlossResponse>("/gloss", { method: "POST", body: JSON.stringify({ word, context }) }),
  saveGloss: (g: Gloss) =>
    req<{ added: number }>("/gloss/save", { method: "POST", body: JSON.stringify(g) }),
  review: () => req<ReviewQueueResponse>("/review"),
  gradeCard: (id: string, rating: SrsRating) =>
    req<{ interval_days: number; due_at: string }>(`/review/${id}`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    }),
  explainBackVoice: (itemId: string, audio: Blob) => {
    const form = new FormData();
    form.append("item_id", itemId);
    form.append("audio", audio, "voice.webm");
    return reqForm<{
      grade: { score: number; feedback: string; missed_points: string[] };
      transcript: string;
      transition: { action: string; toStage: number } | null;
      cost: TodayResponse["cost"];
    }>("/explain-back/voice", form, "voice failed");
  },
  settings: () => req<{ settings: UserSettings }>("/settings"),
  saveSettings: (s: Partial<UserSettings>) =>
    req<{ ok: boolean }>("/settings", { method: "PUT", body: JSON.stringify(s) }),
  reset: () => req<{ ok: boolean }>("/reset", { method: "POST" }),
  subscribePush: (sub: PushSubscriptionJSON) =>
    req<{ ok: boolean }>("/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  testPush: () => req<{ sent: number }>("/push/test", { method: "POST" }),
  progress: () => req<ProgressResponse>("/progress"),
  deliverables: () => req<{ deliverables: Deliverable[] }>("/deliverables"),
  updateDeliverable: (id: string, links: { artifact_url?: string | null; notion_url?: string | null }) =>
    req<{ ok: boolean }>(`/deliverables/${id}`, { method: "PUT", body: JSON.stringify(links) }),
  // GET returns the blind item (404 when nothing has audio yet).
  gauntlet: () => req<GauntletItem>("/gauntlet"),
  gradeGauntlet: (itemId: string, text: string) =>
    req<GauntletResult>("/gauntlet/grade", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, text }),
    }),
};

/** Build an audio URL carrying the short-lived signed audio token. */
export function audioUrl(key: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (!audioTok || audioTok.exp - now <= 60) void ensureAudioToken(); // refresh in background
  return `/audio/${key}?t=${encodeURIComponent(audioTok?.token ?? "")}`;
}

// Warm the audio token as early as possible so the first audio render has it
// (also refreshed on app mount and after the token is set — see App/TokenGate).
if (hasToken()) void ensureAudioToken();
