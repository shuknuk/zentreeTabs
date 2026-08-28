#!/usr/bin/env python3
"""Flatten public tab triplets into the exact text ZenTree embeds."""

from __future__ import annotations

import argparse
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--train-output", type=Path, default=OUTPUTS["train"])
    parser.add_argument("--test-output", type=Path, default=OUTPUTS["test"])
    args = parser.parse_args()
    outputs = {"train": args.train_output, "test": args.test_output}

    if not args.source.exists():
        raise FileNotFoundError(f"Source triplets not found: {args.source}")

    handles = {split: path.open("w") for split, path in outputs.items()}
    counts = {split: 0 for split in outputs}
    try:
        for line in args.source.open():
            row = json.loads(line)
            split = row["split"]
            if split not in handles:
                raise ValueError(f"Unsupported split {split!r} in {args.source}")
            flat = {role: embed_input(row[role]) for role in ("anchor", "positive", "negative")}
            handles[split].write(json.dumps(flat) + "\n")
            counts[split] += 1
    finally:
        for handle in handles.values():
            handle.close()

    for split, count in counts.items():
        print(f"Wrote {count:,} {split} triplets to {outputs[split]}")


if __name__ == "__main__":
    main()
