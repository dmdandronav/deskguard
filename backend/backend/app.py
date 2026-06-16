"""
CV / Pose App Template — Flask backend
----------------------------------------
Pose tracking happens entirely in the BROWSER (MediaPipe Tasks Vision, see
frontend/src/PoseTracker.jsx) — no video is ever sent to this server, which
keeps things fast and privacy-friendly (this is the same "process it locally,
no cloud video" framing that won a privacy track at HackAI 2025).

All this backend does is take a small JSON summary of joint-angle data
(min / max / avg over the last few seconds) and turn it into plain-English
coaching feedback via an LLM.

Swap the exercise-specific guidance in REFERENCE_RANGES + the prompt below to
repurpose this for: physical therapy rep tracking, sign-language gesture
classification (pair with a HandLandmarker on the frontend), posture
monitoring for desk workers, or sports-form analysis.
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
CORS(app)

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    base_url=os.environ.get("OPENAI_BASE_URL") or None,
)
MODEL = os.environ.get("MODEL_NAME", "gpt-4o-mini")

# Rough "good form" ranges (degrees) — tune these for your real exercise.
# This is intentionally simple; a stronger entry would compare against a
# reference video instead of fixed numbers (see README "leveling up").
REFERENCE_RANGES = {
    "squat": {"good_min": 70, "good_max": 100, "note": "a good squat brings the knee angle down to roughly 70-100°"},
    "bicepCurl": {"good_min": 30, "good_max": 160, "note": "a full curl rep should move the elbow angle from ~160° (extended) to ~30° (flexed)"},
}


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "model": MODEL})


@app.route("/api/analyze-pose", methods=["POST"])
def analyze_pose():
    """
    Body: { "exercise": "squat", "samples": 42, "min": 68.2, "max": 171.4, "avg": 110.3 }
    Returns: { "feedback": "..." }
    """
    data = request.get_json(force=True)
    exercise = data.get("exercise", "squat")
    ref = REFERENCE_RANGES.get(exercise, {})

    prompt = (
        f"A user just performed a '{exercise}' exercise tracked via webcam pose estimation. "
        f"Over {data.get('samples')} samples, their joint angle ranged from "
        f"{data.get('min'):.1f}° to {data.get('max'):.1f}° (average {data.get('avg'):.1f}°). "
        f"Reference: {ref.get('note', 'no reference available')}. "
        "In 2-3 short sentences, give friendly, specific feedback on their form, "
        "and one concrete tip to improve. Avoid being preachy."
    )

    completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are an encouraging movement coach."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.6,
    )

    return jsonify({"feedback": completion.choices[0].message.content})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
