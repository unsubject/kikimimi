import { useRef, useState, useCallback, useEffect } from "react";

/**
 * MediaRecorder wrapper for voice explain-backs (spec §2 voice input). Returns
 * a webm/opus Blob. Kept tiny and dependency-free.
 */
export interface Recorder {
  recording: boolean;
  supported: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
}

export function useRecorder(): Recorder {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined";

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError("この端末は録音に対応していません。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
    } catch {
      setError("マイクへのアクセスが許可されませんでした。");
    }
  }, [supported]);

  // On unmount (e.g. switching tabs mid-recording), tear down the recorder and
  // stop the mic tracks so the microphone doesn't stay live until page reload.
  useEffect(() => {
    return () => {
      try {
        if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
      } catch {
        /* already stopped */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRef.current = null;
    };
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const rec = mediaRef.current;
    if (!rec) return null;
    return new Promise<Blob | null>((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRef.current = null;
        setRecording(false);
        resolve(blob.size > 0 ? blob : null);
      };
      rec.stop();
    });
  }, []);

  return { recording, supported, error, start, stop };
}
