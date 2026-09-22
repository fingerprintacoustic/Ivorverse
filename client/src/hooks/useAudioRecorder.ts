import { useCallback, useEffect, useRef, useState } from "react";

/** Microphone recording via MediaRecorder. stop() resolves with the recorded Blob. */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  // Release the microphone if the component unmounts mid-recording
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Audio recording is not supported in this browser");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;

    setElapsedSeconds(0);
    timerRef.current = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    setIsRecording(true);
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve, reject) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          reject(new Error("Not recording"));
          return;
        }
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          cleanup();
          resolve(blob);
        };
        recorder.stop();
      }),
    [cleanup]
  );

  return { isRecording, elapsedSeconds, start, stop };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
