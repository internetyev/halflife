#!/usr/bin/env python3
"""Tests for scripts/rank-job-titles.py (L3.1) — the candidate-corpus ranker.

The Python parallel of the node:test suites L5.39/L5.40/L5.41 cover for the
three `.mjs` scripts: this is the one routine-shipped data-transform script
written in Python, so it gets the matching stdlib test treatment. Two layers,
mirroring the validator/producer suites:

* **Unit** — the pure normalisation helpers (`slugify`, `_num`, `_rows`,
  `_first`, `_VOLUME_KEYS` lookup) are loaded directly via importlib (the
  source filename has hyphens, so it cannot be `import`ed by name) and asserted
  in isolation. These encode the script's whole reason to exist: tolerating the
  shifting corgi/Ahrefs JSON shapes documented in the module docstring.
* **Integration** — the script is spawned as a child process (`subprocess.run`
  so a non-zero exit is assertable, not raised) against a fresh corpus + output
  dir under `tempfile.mkdtemp()`, exercising the `--candidates`/`--out-dir`
  overrides L5.42 added. Asserts both the exit code AND the written JSON/CSV:
  the curated-interim path, the `--overview` volume-ranked path, the stub-dump
  blocker, the missing-corpus guard, dedup, and `--top` slicing. The suite never
  reads or writes the repo's real `data/` tree.

Pure Python stdlib (`unittest`, `subprocess`, `tempfile`, `importlib`, `json`,
`csv`, `pathlib`) — no pip install, so it runs identically on the routine
laptop and the GitHub CI runner (which ships python3 by default). Discovered by
`python3 -m unittest discover -s scripts/__tests__ -p 'test_*.py'` (the CI
`python tests` step); the `test_*.py` pattern does not collide with the node
runner's `*.test.mjs` glob in the same directory.
"""

from __future__ import annotations

import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "rank-job-titles.py"


def _load_module():
    """Import the hyphen-named script as a module for unit-level access."""
    spec = importlib.util.spec_from_file_location("rank_job_titles", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rank = _load_module()


class SlugifyTest(unittest.TestCase):
    def test_matches_scoring_slugify(self):
        self.assertEqual(rank.slugify("Truck Driver"), "truck-driver")
        self.assertEqual(rank.slugify("  Data  Scientist  "), "data-scientist")
        self.assertEqual(rank.slugify("C++ Developer"), "c-developer")
        self.assertEqual(rank.slugify("Nurse (RN)"), "nurse-rn")
        self.assertEqual(rank.slugify("---edge---"), "edge")
        self.assertEqual(rank.slugify("UX/UI Designer"), "ux-ui-designer")


class NumTest(unittest.TestCase):
    def test_coerces_dirty_numeric_strings(self):
        self.assertEqual(rank._num("1,200"), 1200.0)
        self.assertEqual(rank._num("$3.50"), 3.5)
        self.assertEqual(rank._num("12,345.67"), 12345.67)
        self.assertEqual(rank._num(42), 42.0)

    def test_bad_input_is_zero_not_crash(self):
        self.assertEqual(rank._num(None), 0.0)
        self.assertEqual(rank._num("n/a"), 0.0)
        self.assertEqual(rank._num(""), 0.0)


class FirstTest(unittest.TestCase):
    def test_returns_first_present_non_null_key(self):
        d = {"vol": None, "search_volume": 900, "volume": None}
        self.assertEqual(rank._first(d, rank._VOLUME_KEYS), 900)

    def test_default_when_all_missing(self):
        self.assertEqual(rank._first({}, rank._VOLUME_KEYS, 0), 0)


class RowsTest(unittest.TestCase):
    def test_top_level_list(self):
        rows = rank._rows([{"keyword": "a"}, "skip", {"keyword": "b"}])
        self.assertEqual(rows, [{"keyword": "a"}, {"keyword": "b"}])

    def test_nested_under_known_keys(self):
        for key in ("rows", "results", "data", "keywords", "items"):
            with self.subTest(key=key):
                self.assertEqual(
                    rank._rows({key: [{"keyword": "x"}]}), [{"keyword": "x"}]
                )

    def test_stub_shape_returns_empty(self):
        # The L3.1 stub echoes its params: {"metric": ..., "batch": ...}.
        self.assertEqual(
            rank._rows({"metric": "keyword_overview", "batch": "f.txt"}), []
        )

    def test_unrecognised_shape_returns_empty(self):
        self.assertEqual(rank._rows(42), [])
        self.assertEqual(rank._rows({"foo": "bar"}), [])


class IntegrationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="rjt-"))
        self.corpus = self.tmp / "candidates.txt"
        self.out = self.tmp / "out"

    def tearDown(self):
        for p in sorted(self.tmp.rglob("*"), reverse=True):
            p.unlink() if p.is_file() else p.rmdir()
        self.tmp.rmdir()

    def _run(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            capture_output=True,
            text=True,
        )

    def _read_json(self, top):
        return json.loads((self.out / f"top-{top}.json").read_text("utf-8"))

    def test_curated_interim_orders_alpha_and_writes_both_files(self):
        self.corpus.write_text("truck driver\ndata scientist\nnurse\n", "utf-8")
        r = self._run(
            "--candidates", str(self.corpus),
            "--out-dir", str(self.out), "--top", "3",
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = self._read_json(3)
        self.assertEqual(doc["meta"]["volume_source"], "curated-interim")
        self.assertEqual(doc["meta"]["candidate_count"], 3)
        self.assertEqual(doc["meta"]["top_n"], 3)
        # No volume data => stable alphabetical order, contiguous 1..N ranks.
        titles = [r_["title"] for r_ in doc["roles"]]
        self.assertEqual(titles, ["data scientist", "nurse", "truck driver"])
        self.assertEqual([r_["rank"] for r_ in doc["roles"]], [1, 2, 3])
        self.assertEqual(doc["roles"][0]["slug"], "data-scientist")
        # CSV companion written with the documented header.
        with (self.out / "top-3.csv").open(encoding="utf-8") as fh:
            rows = list(csv.reader(fh))
        self.assertEqual(
            rows[0], ["rank", "title", "slug", "volume", "difficulty", "cpc"]
        )
        self.assertEqual(len(rows), 4)  # header + 3

    def test_dedup_and_lowercase_from_corpus(self):
        self.corpus.write_text(
            "Truck Driver\ntruck driver\nNURSE\nnurse\n", "utf-8"
        )
        r = self._run(
            "--candidates", str(self.corpus), "--out-dir", str(self.out)
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = self._read_json(200)
        titles = [r_["title"] for r_ in doc["roles"]]
        self.assertEqual(titles, ["nurse", "truck driver"])
        self.assertEqual(doc["meta"]["candidate_count"], 2)

    def test_overview_ranks_by_volume_desc(self):
        self.corpus.write_text("truck driver\ndata scientist\nnurse\n", "utf-8")
        overview = self.tmp / "ov.json"
        overview.write_text(
            json.dumps(
                {
                    "rows": [
                        {"keyword": "nurse", "volume": 5000, "kd": 40},
                        {"keyword": "truck driver", "search_volume": "9,000"},
                        {"keyword": "data scientist", "vol": 1000, "cpc": "$3"},
                    ]
                }
            ),
            "utf-8",
        )
        r = self._run(
            "--candidates", str(self.corpus),
            "--out-dir", str(self.out),
            "--overview", str(overview),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = self._read_json(200)
        self.assertEqual(
            doc["meta"]["volume_source"], "corgi-keywords/keyword_overview (US)"
        )
        titles = [r_["title"] for r_ in doc["roles"]]
        self.assertEqual(titles, ["truck driver", "nurse", "data scientist"])
        self.assertEqual(doc["roles"][0]["volume"], 9000)
        self.assertEqual(doc["roles"][1]["difficulty"], 40)

    def test_unmatched_candidate_keeps_zero_volume_not_dropped(self):
        self.corpus.write_text("nurse\nwelder\n", "utf-8")
        overview = self.tmp / "ov.json"
        overview.write_text(
            json.dumps({"rows": [{"keyword": "nurse", "volume": 800}]}), "utf-8"
        )
        r = self._run(
            "--candidates", str(self.corpus),
            "--out-dir", str(self.out),
            "--overview", str(overview),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = self._read_json(200)
        self.assertEqual(len(doc["roles"]), 2)
        welder = next(x for x in doc["roles"] if x["title"] == "welder")
        self.assertEqual(welder["volume"], 0)

    def test_top_slices_but_meta_keeps_full_candidate_count(self):
        self.corpus.write_text("a\nb\nc\nd\ne\n", "utf-8")
        r = self._run(
            "--candidates", str(self.corpus),
            "--out-dir", str(self.out), "--top", "2",
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = self._read_json(2)
        self.assertEqual(doc["meta"]["candidate_count"], 5)
        self.assertEqual(doc["meta"]["top_n"], 2)
        self.assertEqual(len(doc["roles"]), 2)

    def test_stub_overview_dump_exits_nonzero(self):
        self.corpus.write_text("nurse\n", "utf-8")
        stub = self.tmp / "stub.json"
        stub.write_text(
            json.dumps({"metric": "keyword_overview", "batch": "x"}), "utf-8"
        )
        r = self._run(
            "--candidates", str(self.corpus),
            "--out-dir", str(self.out),
            "--overview", str(stub),
        )
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("L3.1b", r.stderr)

    def test_missing_corpus_exits_nonzero_with_pointer(self):
        r = self._run(
            "--candidates", str(self.tmp / "nope.txt"),
            "--out-dir", str(self.out),
        )
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("missing corpus", r.stderr)

    def test_unknown_flag_exits_2(self):
        r = self._run("--bogus")
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
