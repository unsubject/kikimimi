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

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const api = {
  config: () => req<{ vapidPublicKey: string; voices: TtsVoice[] }>("/config"),
  today: () => req<TodayResponse>("/today"),
  items: () => req<{ items: Item[] }>("/items"),
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
  shadow: async (targetText: string, audio: Blob) => {
    const form = new FormData();
    form.append("target_text", targetText);
    form.append("audio", audio, "shadow.webm");
    const res = await fetch("/api/shadow", {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(body.error ?? "shadow failed", res.status);
    }
    return res.json() as Promise<{ grade: ShadowGrade; transcript: string }>;
  },
  // POST: the opener has a paid, non-idempotent side effect (Sonnet on a cache miss).
  talkOpener: (itemId: string) =>
    req<OpenerResponse>(`/talk/opener?item_id=${encodeURIComponent(itemId)}`, { method: "POST" }),
  talk: async (itemId: string, audio: Blob, history: TalkTurn[]) => {
    const form = new FormData();
    form.append("item_id", itemId);
    form.append("history", JSON.stringify(history));
    form.append("audio", audio, "talk.webm");
    const res = await fetch("/api/talk", {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(body.error ?? "talk failed", res.status);
    }
    return res.json() as Promise<TalkResponse>;
  },
  review: () => req<ReviewQueueResponse>("/review"),
  gradeCard: (id: string, rating: SrsRating) =>
    req<{ interval_days: number; due_at: string }>(`/review/${id}`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    }),
  explainBackVoice: async (itemId: string, audio: Blob) => {
    const form = new FormData();
    form.append("item_id", itemId);
    form.append("audio", audio, "voice.webm");
    const res = await fetch("/api/explain-back/voice", {
      method: "POST",
      headers: { authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(body.error ?? "voice failed", res.status);
    }
    return res.json() as Promise<{
      grade: { score: number; feedback: string; missed_points: string[] };
      transcript: string;
      transition: { action: string; toStage: number } | null;
      cost: TodayResponse["cost"];
    }>;
  },
  settings: () => req<{ settings: UserSettings }>("/settings"),
  saveSettings: (s: Partial<UserSettings>) =>
    req<{ ok: boolean }>("/settings", { method: "PUT", body: JSON.stringify(s) }),
  reset: () => req<{ ok: boolean }>("/reset", { method: "POST" }),
  subscribePush: (sub: PushSubscriptionJSON) =>
    req<{ ok: boolean }>("/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  testPush: () => req<{ sent: number }>("/push/test", { method: "POST" }),
};

/** Build an audio URL that carries the token (audio elements can't set headers). */
export function audioUrl(key: string): string {
  return `/audio/${key}?t=${encodeURIComponent(getToken())}`;
}
