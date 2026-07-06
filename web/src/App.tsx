import { useEffect, useState } from "react";
import { hasToken, setToken } from "./api.js";
import { Today } from "./views/Today.js";
import { Practice } from "./views/Practice.js";
import { Review } from "./views/Review.js";
import { Talk } from "./views/Talk.js";
import { Library } from "./views/Library.js";
import { Progress } from "./views/Progress.js";
import { Settings } from "./views/Settings.js";
import { registerServiceWorker } from "./push.js";

type Tab = "today" | "review" | "talk" | "library" | "practice" | "progress" | "settings";

export function App() {
  const [ready, setReady] = useState(hasToken());
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  if (!ready) return <TokenGate onSaved={() => setReady(true)} />;

  return (
    <div>
      <header className="app-header">
        <h1>聞き耳</h1>
        <span className="sub">Kikimimi — the listening ear</span>
      </header>

      {tab === "today" && <Today />}
      {tab === "review" && <Review />}
      {tab === "talk" && <Talk />}
      {tab === "library" && <Library />}
      {tab === "practice" && <Practice />}
      {tab === "progress" && <Progress />}
      {tab === "settings" && <Settings />}

      <nav className="tabbar">
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}>
          <span className="ico">🎧</span>今日
        </button>
        <button className={tab === "review" ? "on" : ""} onClick={() => setTab("review")}>
          <span className="ico">🔁</span>復習
        </button>
        <button className={tab === "talk" ? "on" : ""} onClick={() => setTab("talk")}>
          <span className="ico">💬</span>会話
        </button>
        <button className={tab === "library" ? "on" : ""} onClick={() => setTab("library")}>
          <span className="ico">📖</span>文庫
        </button>
        <button className={tab === "practice" ? "on" : ""} onClick={() => setTab("practice")}>
          <span className="ico">あ</span>練習
        </button>
        <button className={tab === "progress" ? "on" : ""} onClick={() => setTab("progress")}>
          <span className="ico">📊</span>進捗
        </button>
        <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>
          <span className="ico">⚙</span>設定
        </button>
      </nav>
    </div>
  );
}

function TokenGate({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="setup">
      <h1>聞き耳 Kikimimi</h1>
      <p className="muted">アクセストークンを入力してください。</p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="APP_TOKEN"
      />
      <button
        className="primary"
        disabled={!value.trim()}
        onClick={() => {
          setToken(value);
          onSaved();
        }}
      >
        はじめる
      </button>
      <p className="muted" style={{ fontSize: 12, marginTop: 20 }}>
        通知には、まずこのアプリをホーム画面に追加してください。
      </p>
    </div>
  );
}
