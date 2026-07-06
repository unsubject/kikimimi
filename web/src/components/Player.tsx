import { useEffect, useRef, useState } from "react";

const SPEEDS = [0.75, 0.85, 1.0] as const;

/**
 * HTML5 audio player with the three playback rates from spec §2 (0.75 / 0.85 /
 * 1.0). Native rate change — no slow-TTS variant needed.
 */
export function Player({ src }: { src: string | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState<number>(1.0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, src]);

  // A new src resets the <audio> element to paused; keep the toggle label in sync
  // so it doesn't show "⏸ 一時停止" while the freshly-swapped clip is stopped.
  useEffect(() => {
    setPlaying(false);
  }, [src]);

  if (!src) {
    return <p className="muted">音声はまだ生成されていません（後で再試行）。</p>;
  }

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="player">
      <button className="primary" onClick={toggle} aria-label={playing ? "一時停止" : "再生"}>
        {playing ? "⏸ 一時停止" : "▶ 再生"}
      </button>
      <div className="speeds">
        {SPEEDS.map((s) => (
          <button key={s} className={rate === s ? "on" : ""} onClick={() => setRate(s)}>
            {s.toFixed(2)}×
          </button>
        ))}
      </div>
      <audio
        ref={ref}
        src={src}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        preload="auto"
      />
    </div>
  );
}
