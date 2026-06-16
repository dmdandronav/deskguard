"""
DeskGuard — Flask backend
--------------------------
Pose tracking happens entirely in the BROWSER (MediaPipe Tasks Vision, see
frontend/src/PoseTracker.jsx) — no video is ever sent to this server, which
keeps things fast and privacy-friendly.

All this backend does is take a small JSON summary of neck-shoulder-hip
angle data (min / max / avg over the last few seconds) and turn it into
plain-English posture coaching via an LLM.
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
    base_url=os.environ.get("BASE_URL") or None,
)
MODEL = os.environ.get("MODEL", "gpt-4o-mini")
SYSTEM_PROMPT = os.environ.get(
    "SYSTEM_PROMPT",
    (
        "You are a posture wellness coach. Given neck-shoulder-hip alignment angle data "
        "from a webcam tracker, give one gentle encouraging sentence about posture quality "
        'and one specific micro-adjustment to try right now (e.g. "roll shoulders back", '
        '"tuck chin slightly", "sit back in your chair"). Keep it brief and positive.'
    ),
)

REFERENCE_RANGES = {
    "posture": {
        "good_min": 160,
        "good_max": 180,
        "note": "good upright posture keeps the ear-shoulder-hip line close to straight (160-180°); slouching brings it below 160°",
    },
}


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "model": MODEL})


@app.route("/api/analyze-pose", methods=["POST"])
def analyze_pose():
    """
    Body: { "exercise": "posture", "samples": 42, "min": 148.2, "max": 172.4, "avg": 158.3 }
    Returns: { "feedback": "..." }
    """
    data = request.get_json(force=True)
    exercise = data.get("exercise", "posture")
    ref = REFERENCE_RANGES.get(exercise, REFERENCE_RANGES["posture"])

    prompt = (
        f"A user's neck-shoulder-hip alignment was tracked via webcam pose estimation. "
        f"Over {data.get('samples')} samples, their posture angle ranged from "
        f"{data.get('min'):.1f}° to {data.get('max'):.1f}° (average {data.get('avg'):.1f}°). "
        f"Reference: {ref.get('note', 'no reference available')}. "
        "Give one gentle encouraging sentence about posture quality and one specific "
        "micro-adjustment to try right now. Keep it brief and positive."
    )

    completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.6,
    )

    return jsonify({"feedback": completion.choices[0].message.content})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
