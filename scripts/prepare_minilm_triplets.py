#!/usr/bin/env python3
"""Flatten public tab triplets into the exact text ZenTree embeds."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse


SOURCE = Path("data/public_session_triplets.jsonl")
OUTPUTS = {
    "train": Path("data/minilm_tab_triplets_train.jsonl"),
    "test": Path("data/minilm_tab_triplets_test.jsonl"),
}


def embed_input(tab: dict[str, str]) -> str:
    """Mirror worker/ai-worker.js extractEmbedInput."""
    parsed = urlparse(tab["url"])
    params = parse_qs(parsed.query)
    text = next((params[key][0] for key in ("q", "query", "search") if params.get(key)), "")
    if not text and parsed.path not in ("", "/"):
        text = re.sub(r"\.[^./]+$", "", parsed.path)
        text = re.sub(r"[_\-./]", " ", text)
        text = re.sub(r"\b\d+\b", "", text)
        text = " ".join(text.split())

    title = re.sub(r"\b(Google|GitHub|YouTube|Amazon|Stack Overflow|Reddit|Search)\b", "", tab["title"], flags=re.I).strip()[:100]
    return (f"{text} {title}" if text and title else text or title or tab["title"][:100])[:100]


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Run scripts/build_public_session_triplets.py first: {SOURCE}")

    handles = {split: path.open("w") for split, path in OUTPUTS.items()}
    counts = {split: 0 for split in OUTPUTS}
    try:
        for line in SOURCE.open():
            row = json.loads(line)
            split = row["split"]
            flat = {role: embed_input(row[role]) for role in ("anchor", "positive", "negative")}
            handles[split].write(json.dumps(flat) + "\n")
            counts[split] += 1
    finally:
        for handle in handles.values():
            handle.close()

    for split, count in counts.items():
        print(f"Wrote {count:,} {split} triplets to {OUTPUTS[split]}")


if __name__ == "__main__":
    main()
