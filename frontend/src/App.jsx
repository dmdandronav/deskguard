import React, { useRef, useState, useEffect, useCallback } from "react";
import PoseTracker from "./PoseTracker.jsx";

const SLOUCH_THRESHOLD = 155; // degrees — below this is a slouch
const CHECK_INTERVAL_MS = 5000; // check every 5 seconds
const TOAST_DURATION_MS = 8000; // auto-dismiss after 8 seconds

export default function App() {
  const [ambientMode, setAmbientMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [feedback, setFeedback] = useState(
    "Sit in front of your webcam, then hit \"Get Feedback\" to check your posture."
  );
  const [loading, setLoading] = useState(false);
  const trackerRef = useRef(null);
  const consecutiveSlouch = useRef(0);
  const toastTimerRef = useRef(null);

  const callBackend = useCallback(async () => {
    const summary = trackerRef.current?.getSummary();
    if (!summary) return null;
    try {
      const res = await fetch("/api/analyze-pose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summary),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.feedback;
    } catch {
      return null;
    }
  }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  // Ambient mode: poll every 5 seconds, fire AI nudge on two consecutive slouch detections
  useEffect(() => {
    if (!ambientMode) {
      consecutiveSlouch.current = 0;
      return;
    }

    const intervalId = setInterval(async () => {
      const summary = trackerRef.current?.getSummary();
      if (!summary) return;

      const currentAngle = summary.avg;
      if (currentAngle < SLOUCH_THRESHOLD) {
        consecutiveSlouch.current += 1;
        if (consecutiveSlouch.current >= 2) {
          consecutiveSlouch.current = 0; // reset so it doesn't fire every tick
          const nudge = await callBackend();
          if (nudge) showToast(nudge);
        }
      } else {
        consecutiveSlouch.current = 0;
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [ambientMode, callBackend, showToast]);

  // Clean up toast timer on unmount
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  async function getFeedback() {
    const summary = trackerRef.current?.getSummary();
    if (!summary) {
      setFeedback("Not enough data yet — make sure your upper body is visible in the camera.");
      return;
    }
    setLoading(true);
    try {
      const result = await callBackend();
      setFeedback(result ?? "Couldn't reach the backend. Make sure the Flask server is running on port 5000 and your API key is set.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 gap-6 bg-[var(--color-surface)] text-[var(--color-ink)]">

      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm w-full bg-[var(--color-ink)] text-[var(--color-surface)] rounded-2xl px-5 py-4 shadow-xl text-sm leading-relaxed"
          style={{ animation: "slideIn 0.25s ease-out" }}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <p>{toast}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="absolute top-3 right-3 text-[var(--color-surface)]/50 hover:text-[var(--color-surface)] text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      <header className="text-center max-w-xl">
        <h1 className="font-[var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--color-ink)]">
          DeskGuard
        </h1>
        <p className="text-sm text-[var(--color-ink)]/50 mt-1">
          Sit well. Work well. No wearables.
        </p>
      </header>

      {/* Webcam + pose overlay — shrinks in ambient mode */}
      <div className={ambientMode ? "w-48 opacity-60 transition-all duration-500" : "w-full max-w-xl transition-all duration-500"}>
        <PoseTracker ref={trackerRef} exercise="posture" />
      </div>

      {/* Ambient mode indicator */}
      {ambientMode && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink)]/70">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          Monitoring posture…
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => setAmbientMode((v) => !v)}
          className={`rounded-xl font-medium px-6 py-2 text-sm transition ${
            ambientMode
              ? "bg-[var(--color-muted)] text-[var(--color-ink)] border border-[var(--color-line)]"
              : "bg-[var(--color-accent)] text-white"
          }`}
        >
          {ambientMode ? "Stop Monitoring" : "Start Monitoring"}
        </button>

        {!ambientMode && (
          <button
            onClick={getFeedback}
            disabled={loading}
            className="rounded-xl bg-[var(--color-ink)] text-[var(--color-surface)] font-medium px-6 py-2 text-sm disabled:opacity-50 transition"
          >
            {loading ? "Analyzing…" : "Get Feedback"}
          </button>
        )}
      </div>

      {/* Manual feedback panel — only shown outside ambient mode */}
      {!ambientMode && (
        <div className="max-w-xl w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-muted)] px-5 py-4 text-sm leading-relaxed text-[var(--color-ink)]/80">
          {feedback}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}
