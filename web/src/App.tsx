import { useEffect, useState } from "react";
import { hasToken, setToken } from "./api.js";
import { Today } from "./views/Today.js";
import { Drills } from "./views/Drills.js";
import { Review } from "./views/Review.js";
import { Settings } from "./views/Settings.js";
import { registerServiceWorker } from "./push.js";

type Tab = "today" | "review" | "drills" | "settings";

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
      {tab === "drills" && <Drills />}
      {tab === "settings" && <Settings />}

      <nav className="tabbar">
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}>
          <span className="ico">🎧</span>今日
        </button>
        <button className={tab === "review" ? "on" : ""} onClick={() => setTab("review")}>
          <span className="ico">🔁</span>復習
        </button>
        <button className={tab === "drills" ? "on" : ""} onClick={() => setTab("drills")}>
          <span className="ico">あ</span>かな
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
