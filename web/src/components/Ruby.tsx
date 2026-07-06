import type { FuriganaSegment, ScaffoldStage } from "@kikimimi/shared";

/**
 * Render the body with furigana. At stage 1 furigana shows by default; a
 * per-item toggle (`furiOff`) hides the readings (spec §1.2 furigana toggle).
 * At stage 3 the text itself is hidden behind tap-to-reveal (handled by the
 * caller), so this component only renders when text is meant to be visible.
 */
export function RubyBody({
  segments,
  furiOff,
}: {
  segments: FuriganaSegment[];
  furiOff: boolean;
}) {
  return (
    <p className={`jp-body${furiOff ? " furi-hidden" : ""}`}>
      {segments.map((seg, i) =>
        seg.ruby ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.ruby}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
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
