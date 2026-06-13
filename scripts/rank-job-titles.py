#!/usr/bin/env python3
"""Rank the candidate job-title corpus by US search volume and emit the top-N seed.

Inputs
------
* ``data/job-titles/candidates.txt`` — the curated, deduped, sector-balanced
  candidate corpus (one bare role title per line, lowercase). Shipped by L3.1a.
* A ``corgi-keywords --metric keyword_overview`` JSON dump for those candidates.

Why this script does not fetch its own data
-------------------------------------------
The ``corgi-keywords`` build installed on the routine laptop is a *stub*:
``corgi.ahrefs.dispatcher.fetch_keyword_overview`` returns ``{"metric": ...,
**kwargs}`` and makes no API call (verified L3.1, $0.00 corgi spend, no
DataForSEO request issued). So the volume-ranked refinement is split out as
L3.1b — a corgi-deferred leaf that runs once a non-stub ``corgi-keywords``
(or DataForSEO-backed equivalent) is available:

    corgi-keywords --metric keyword_overview \\
        --batch data/job-titles/candidates.txt --locale us \\
        --budget 0.40 > data/job-titles/keyword_overview.json
    python3 scripts/rank-job-titles.py \\
        --overview data/job-titles/keyword_overview.json --top 200

Output shape is intentionally tolerant of the exact corgi/Ahrefs JSON
normalisation (rows may be a top-level list, or under ``rows`` / ``results`` /
``data``; the volume field may be ``volume`` / ``search_volume`` / ``vol`` /
``avg_monthly_searches``). Unmatched candidates keep volume 0 so the corpus
is never silently truncated by a partial API response.

Outputs
-------
* ``data/job-titles/top-{N}.json`` — ordered list of
  ``{rank, title, slug, volume, difficulty, cpc}`` plus a ``meta`` block.
* ``data/job-titles/top-{N}.csv`` — same rows, spreadsheet-friendly.
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CANDIDATES = REPO / "data" / "job-titles" / "candidates.txt"

_VOLUME_KEYS = ("volume", "search_volume", "vol", "avg_monthly_searches")
_DIFF_KEYS = ("difficulty", "kd", "keyword_difficulty")
_CPC_KEYS = ("cpc", "cost_per_click", "cpc_usd")
_KW_KEYS = ("keyword", "kw", "term", "query")


def slugify(title: str) -> str:
    """Match lib/scoring slugify: lowercase, non-alnum -> single hyphen."""
    s = re.sub(r"[^a-z0-9]+", "-", title.strip().lower())
    return s.strip("-")


def _first(d: dict, keys: tuple[str, ...], default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _rows(payload) -> list[dict]:
    """Pull the list of keyword rows out of whatever the dump nests them in."""
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if isinstance(payload, dict):
        for key in ("rows", "results", "data", "keywords", "items"):
            v = payload.get(key)
            if isinstance(v, list):
                return [r for r in v if isinstance(r, dict)]
        # Stub shape: {"metric": "keyword_overview", "batch": ..., ...}
        if payload.get("metric") and not any(
            isinstance(payload.get(k), list)
            for k in ("rows", "results", "data")
        ):
            return []
    return []


def _num(v) -> float:
    try:
        return float(str(v).replace(",", "").replace("$", "") or 0)
    except (TypeError, ValueError):
        return 0.0


def load_candidates(path: Path = CANDIDATES) -> list[str]:
    if not path.exists():
        sys.exit(f"missing corpus: {path} (L3.1a ships this)")
    seen, out = set(), []
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.strip().lower()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--overview",
        help="Path to corgi-keywords keyword_overview JSON. "
        "Omit to emit the curated-interim ordering (volume unknown).",
    )
    ap.add_argument("--top", type=int, default=200)
    ap.add_argument(
        "--candidates",
        help="Path to the candidate corpus (one title per line). "
        f"Default: {CANDIDATES} (L3.1a ships this). Override for tests.",
    )
    ap.add_argument(
        "--out-dir",
        help="Directory to write top-{N}.json / .csv into. "
        "Default: data/job-titles/. Override for tests.",
    )
    args = ap.parse_args()

    candidates_path = Path(args.candidates) if args.candidates else CANDIDATES
    candidates = load_candidates(candidates_path)

    vol_by_kw: dict[str, dict] = {}
    volume_source = "curated-interim"
    if args.overview:
        payload = json.loads(Path(args.overview).read_text(encoding="utf-8"))
        rows = _rows(payload)
        if not rows:
            sys.exit(
                "no keyword rows in --overview dump. If corgi-keywords only "
                "echoed its params, the installed build is the L3.1 stub — "
                "this is the L3.1b blocker, not a usage error."
            )
        for r in rows:
            kw = str(_first(r, _KW_KEYS, "")).strip().lower()
            if kw:
                vol_by_kw[kw] = r
        volume_source = "corgi-keywords/keyword_overview (US)"

    enriched = []
    for title in candidates:
        r = vol_by_kw.get(title, {})
        enriched.append(
            {
                "title": title,
                "slug": slugify(title),
                "volume": int(_num(_first(r, _VOLUME_KEYS, 0))),
                "difficulty": _num(_first(r, _DIFF_KEYS, 0)) or None,
                "cpc": _num(_first(r, _CPC_KEYS, 0)) or None,
            }
        )

    # Volume desc; stable alpha tiebreak so the interim ordering is deterministic.
    enriched.sort(key=lambda e: (-e["volume"], e["title"]))
    top = enriched[: args.top]
    for i, e in enumerate(top, 1):
        e["rank"] = i

    out_dir = Path(args.out_dir) if args.out_dir else REPO / "data" / "job-titles"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "generated": _dt.date.today().isoformat(),
        "candidate_count": len(candidates),
        "top_n": len(top),
        "volume_source": volume_source,
        "note": (
            "Ordering is alphabetical-stable only; real volume ranking is "
            "L3.1b (blocked on a non-stub corgi-keywords)."
            if volume_source == "curated-interim"
            else "Ordered by US monthly search volume."
        ),
    }
    (out_dir / f"top-{args.top}.json").write_text(
        json.dumps({"meta": meta, "roles": top}, indent=2) + "\n",
        encoding="utf-8",
    )
    with (out_dir / f"top-{args.top}.csv").open(
        "w", newline="", encoding="utf-8"
    ) as fh:
        w = csv.writer(fh)
        w.writerow(["rank", "title", "slug", "volume", "difficulty", "cpc"])
        for e in top:
            w.writerow(
                [e["rank"], e["title"], e["slug"], e["volume"],
                 e["difficulty"] or "", e["cpc"] or ""]
            )

    print(
        f"wrote top-{args.top}.json / .csv "
        f"({len(top)} of {len(candidates)} candidates, "
        f"volume_source={volume_source})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
