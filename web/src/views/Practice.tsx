import { useState } from "react";
import { Drills } from "./Drills.js";
import { Shadow } from "./Shadow.js";
import { OnyomiSheet } from "./OnyomiSheet.js";

type Mode = "kana" | "shadow" | "onyomi";

/** Practice hub (Sprint 1–3 drills): kana automaticity, shadowing, on'yomi. */
export function Practice() {
  const [mode, setMode] = useState<Mode>("kana");
  return (
    <div>
      <div className="row-inline" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <button className={mode === "kana" ? "primary" : ""} onClick={() => setMode("kana")}>
          かな
        </button>
        <button className={mode === "shadow" ? "primary" : ""} onClick={() => setMode("shadow")}>
          シャドー
        </button>
        <button className={mode === "onyomi" ? "primary" : ""} onClick={() => setMode("onyomi")}>
          音読み
        </button>
      </div>
      {mode === "kana" && <Drills />}
      {mode === "shadow" && <Shadow />}
      {mode === "onyomi" && <OnyomiSheet />}
    </div>
  );
}
