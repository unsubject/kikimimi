import type { HTMLAttributes } from "react";
import type { FuriganaSegment, ScaffoldStage } from "@kikimimi/shared";

/** Make a run a keyboard-accessible tap target for the Library gloss (P5/P8):
 * Enter/Space fire the tap like a real button. */
function tapAttrs(onTap: (word: string) => void, text: string): HTMLAttributes<HTMLElement> {
  return {
    className: "tap-word",
    role: "button",
    tabIndex: 0,
    onClick: () => onTap(text),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onTap(text);
      }
    },
  };
}

/**
 * Render the body with furigana. At stage 1 furigana shows by default; a
 * per-item toggle (`furiOff`) hides the readings (spec §1.2 furigana toggle).
 * At stage 3 the text itself is hidden behind tap-to-reveal (handled by the
 * caller), so this component only renders when text is meant to be visible.
 * When `onTap` is given, each run becomes a tappable word for the Library
 * long-read pop-up gloss (spec §5); without it, renders exactly as before.
 */
export function RubyBody({
  segments,
  furiOff,
  onTap,
}: {
  segments: FuriganaSegment[];
  furiOff: boolean;
  onTap?: (word: string) => void;
}) {
  return (
    <p className={`jp-body${onTap ? " long-read" : ""}${furiOff ? " furi-hidden" : ""}`}>
      {segments.map((seg, i) => {
        const attrs = onTap ? tapAttrs(onTap, seg.text) : undefined;
        return seg.ruby ? (
          <ruby key={i} {...attrs}>
            {seg.text}
            <rt>{seg.ruby}</rt>
          </ruby>
        ) : (
          <span key={i} {...attrs}>
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}

export function stageLabel(stage: ScaffoldStage): string {
  return stage === 1
    ? "S1 · 音声＋文＋中文タップ"
    : stage === 2
      ? "S2 · 音声＋文"
      : "S3 · 音声のみ";
}
