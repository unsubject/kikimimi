import { useEffect, useState } from "react";
import type { UserSettings, InterestWeights, TtsVoice } from "@kikimimi/shared";
import { TTS_VOICES } from "@kikimimi/shared";
import { api, ApiError } from "../api.js";
import { enablePush, isStandalone, pushSupported } from "../push.js";
import { getToken, setToken } from "../api.js";

export function Settings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [status, setStatus] = useState<string>("");
  const [pushStatus, setPushStatus] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    void api
      .settings()
      .then((r) => setSettings(r.settings))
      .catch((e) =>
        setLoadErr(e instanceof ApiError ? e.message : "設定の読み込みに失敗しました。"),
      );
  }, []);

  // A failed load (e.g. a bad token → 401) must NOT strand the user on a spinner:
  // still render the token editor so they can fix the very token that failed.
  if (!settings) {
    return (
      <div>
        {loadErr ? (
          <div className="banner stop">{loadErr}</div>
        ) : (
          <p className="muted">読み込み中…</p>
        )}
        {loadErr && <TokenEditor onStatus={() => window.location.reload()} />}
      </div>
    );
  }

  const update = (patch: Partial<UserSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  const updateWeight = (k: keyof InterestWeights, v: number) =>
    setSettings((s) =>
      s ? { ...s, interest_weights: { ...s.interest_weights, [k]: v } } : s,
    );

  const save = async () => {
    setStatus("保存中…");
    try {
      await api.saveSettings({
        drop_time: settings.drop_time,
        tts_voice: settings.tts_voice,
        srs_daily_cap: settings.srs_daily_cap,
        interest_weights: settings.interest_weights,
      });
      setStatus("保存しました。");
    } catch {
      setStatus("保存に失敗しました。");
    }
  };

  const doEnablePush = async () => {
    setPushStatus("設定中…");
    try {
      const r = await enablePush();
      setPushStatus(r.ok ? "通知を有効にしました。" : (r.reason ?? "失敗しました。"));
    } catch {
      setPushStatus("通知の設定に失敗しました。");
    }
  };

  const doTestPush = () => {
    setPushStatus("送信中…");
    api
      .testPush()
      .then(() => setPushStatus("テスト送信しました。"))
      .catch(() => setPushStatus("テスト送信に失敗しました。"));
  };

  const weights = settings.interest_weights;

  return (
    <div>
      <div className="card">
        <strong>通知（Web Push）</strong>
        {!isStandalone() && (
          <p className="banner warn" style={{ marginTop: 10 }}>
            通知にはホーム画面へのインストールが必要です（共有 → ホーム画面に追加）。
          </p>
        )}
        <div className="row-inline" style={{ marginTop: 10 }}>
          <button className="primary" onClick={doEnablePush} disabled={!pushSupported()}>
            通知を有効にする
          </button>
          <button onClick={doTestPush}>テスト送信</button>
        </div>
        {pushStatus && <p className="muted">{pushStatus}</p>}
      </div>

      <div className="card">
        <strong>音声（TTS）</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          Sprint 1 のボイス選び。3つを試して好きな声を選んでください。
        </p>
        <div className="row-inline">
          {TTS_VOICES.map((v) => (
            <button
              key={v}
              className={settings.tts_voice === v ? "primary" : ""}
              onClick={() => update({ tts_voice: v as TtsVoice })}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <strong>配信</strong>
        <label className="field">
          配信時刻（ローカル）
          <input
            type="time"
            value={settings.drop_time}
            onChange={(e) => update({ drop_time: e.target.value })}
          />
        </label>
        <label className="field">
          1日の復習カード上限
          <input
            type="number"
            min={0}
            max={100}
            value={settings.srs_daily_cap}
            onChange={(e) => update({ srs_daily_cap: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="card">
        <strong>興味の重み</strong>
        {(Object.keys(weights) as (keyof InterestWeights)[]).map((k) => (
          <label className="field" key={k}>
            {k} — {weights[k].toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[k]}
              onChange={(e) => updateWeight(k, Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <button className="primary" onClick={save}>
        設定を保存
      </button>
      {status && <p className="muted">{status}</p>}

      <TokenEditor onStatus={setStatus} />
    </div>
  );
}

/** The access-token editor, extracted so it's reachable even when the settings
 * fetch fails (a bad token otherwise locks the user out of the only fix). */
function TokenEditor({ onStatus }: { onStatus: (msg: string) => void }) {
  const [token, setTokenState] = useState(getToken());
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <strong>アクセストークン</strong>
      <p className="muted" style={{ fontSize: 13 }}>
        単一ユーザー用トークン。端末に保存されます。
      </p>
      <label className="field">
        <input
          type="password"
          value={token}
          onChange={(e) => setTokenState(e.target.value)}
          placeholder="APP_TOKEN"
        />
      </label>
      <button
        onClick={() => {
          setToken(token);
          onStatus("トークンを更新しました。");
        }}
      >
        トークンを保存
      </button>
    </div>
  );
}
