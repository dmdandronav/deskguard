import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

/**
 * EXERCISES — change this to match your hackathon idea.
 *
 * Each entry defines 3 landmark indices (a-b-c) and the angle is measured
 * AT joint b. BlazePose landmark indices you'll commonly use:
 *   11/12 = shoulders, 13/14 = elbows, 15/16 = wrists,
 *   23/24 = hips, 25/26 = knees, 27/28 = ankles
 *
 * Ideas: swap this for a HandLandmarker to build a sign-language /
 * gesture-control project instead of a fitness one — same overall structure.
 */
const EXERCISES = {
  squat: { label: "Squat (knee angle)", points: [23, 25, 27] }, // hip-knee-ankle
  bicepCurl: { label: "Bicep curl (elbow angle)", points: [11, 13, 15] }, // shoulder-elbow-wrist
};

function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (!magAB || !magCB) return null;
  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

const PoseTracker = forwardRef(function PoseTracker({ exercise = "squat" }, ref) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const historyRef = useRef([]); // rolling buffer of { t, angle }
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [liveAngle, setLiveAngle] = useState(null);

  // Expose a snapshot of recent angle data to the parent for the
  // "Get AI Feedback" call.
  useImperativeHandle(ref, () => ({
    getSummary() {
      const angles = historyRef.current.map((p) => p.angle).filter((a) => a != null);
      if (angles.length === 0) return null;
      return {
        exercise,
        samples: angles.length,
        min: Math.min(...angles),
        max: Math.max(...angles),
        avg: angles.reduce((s, a) => s + a, 0) / angles.length,
      };
    },
  }));

  useEffect(() => {
    let stream;
    let rafId;

    async function setup() {
      try {
        // 1. Load the pose model (lite version — fast enough for live demo)
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
        );
        landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        // 2. Start the webcam
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setStatus("ready");
        rafId = requestAnimationFrame(loop);
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    }

    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (video && canvas && landmarker && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        const result = landmarker.detectForVideo(video, performance.now());

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (result.landmarks?.length) {
          const lm = result.landmarks[0];
          const drawing = new DrawingUtils(ctx);
          drawing.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
            color: "#7CFFB2",
            lineWidth: 3,
          });
          drawing.drawLandmarks(lm, { color: "#FF6B5C", radius: 3 });

          const [ia, ib, ic] = EXERCISES[exercise].points;
          const angle = angleBetween(lm[ia], lm[ib], lm[ic]);
          setLiveAngle(angle);

          const now = performance.now();
          historyRef.current.push({ t: now, angle });
          // keep last ~5 seconds
          historyRef.current = historyRef.current.filter((p) => now - p.t < 5000);
        }
        ctx.restore();
      }
      rafId = requestAnimationFrame(loop);
    }

    setup();
    return () => {
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close?.();
    };
  }, [exercise]);

  return (
    <div className="relative w-full max-w-xl mx-auto rounded-2xl overflow-hidden border border-[var(--color-line)] bg-[var(--color-panel)]">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="w-full h-auto block scale-x-[-1]" />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-text)]/70">
          <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] pulse-soft mr-2" />
          loading pose model…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-warn)] px-6 text-center">
          Couldn't access the camera. Check browser permissions and reload.
        </div>
      )}

      {liveAngle != null && (
        <div className="absolute top-3 left-3 bg-black/50 rounded-lg px-3 py-1 text-xs font-[var(--font-display)]">
          {EXERCISES[exercise].label}: {liveAngle.toFixed(0)}°
        </div>
      )}
    </div>
  );
});

export default PoseTracker;
export { EXERCISES };
