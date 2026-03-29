#!/usr/bin/env python3
"""
TruckingLanes trigger service — add this route to the copy deployed at /root/scripts/tl-trigger.py
or run standalone (see bottom).

Environment:
  TL_TRIGGER_KEY        Shared secret (must match extension header)
  SUPABASE_URL          https://vjgakkomhphvdbwjjwiv.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   Service role key (never expose to clients)
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

try:
    from flask import Flask, jsonify, request
except ImportError:
    print("Install Flask: pip install flask requests", file=sys.stderr)
    raise

import requests

app = Flask(__name__)

TL_TRIGGER_KEY = os.environ.get("TL_TRIGGER_KEY", "tl-trigger-7b747d391801b8e5f55b4542")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vjgakkomhphvdbwjjwiv.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def require_trigger_key() -> tuple[bool, tuple]:
    got = request.headers.get("X-TL-Trigger-Key") or request.headers.get("tl-trigger-key")
    if not TL_TRIGGER_KEY or got != TL_TRIGGER_KEY:
        return False, (jsonify({"error": "Unauthorized"}), 401)
    if not SERVICE_KEY:
        return False, (jsonify({"error": "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY"}), 500)
    return True, ()


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/mark-aljex-submitted")
def mark_aljex_submitted():
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    load_id = body.get("load_id")
    spot = body.get("aljex_spot_number")
    if not load_id or spot is None or str(spot).strip() == "":
        return jsonify({"error": "load_id and aljex_spot_number required"}), 400

    spot_str = str(spot).strip()
    now_iso = datetime.now(timezone.utc).isoformat()

    url = f"{SUPABASE_URL}/rest/v1/loads?id=eq.{load_id}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {
        "aljex_submitted": True,
        "aljex_submitted_at": now_iso,
        "aljex_spot_number": spot_str,
    }

    r = requests.patch(url, json=payload, headers=headers, timeout=30)
    if r.status_code not in (200, 204):
        return jsonify({"error": r.text or r.reason, "status": r.status_code}), 502

    return jsonify({"success": True})


def main():
    port = int(os.environ.get("TL_TRIGGER_PORT", "3098"))
    app.run(host="0.0.0.0", port=port, threaded=True)


if __name__ == "__main__":
    main()
