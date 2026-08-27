#!/usr/bin/env python3
"""Score the deployed MiniLM input format on public tab-grouping triplets."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
from sentence_transformers import SentenceTransformer


DEFAULT_DATASET = Path("data/public_session_triplets.jsonl")


def embed_input(tab: dict[str, str]) -> str:
    """Mirror extractEmbedInput in worker/ai-worker.js."""
    parsed = urlparse(tab["url"])
    params = parse_qs(parsed.query)
    cleaned_url = next((params[key][0] for key in ("q", "query", "search") if params.get(key)), "")
    if not cleaned_url and parsed.path not in ("", "/"):
        cleaned_url = re.sub(r"\.[^./]+$", "", parsed.path)
        cleaned_url = re.sub(r"[_\-./]", " ", cleaned_url)
        cleaned_url = re.sub(r"\b\d+\b", "", cleaned_url)
        cleaned_url = " ".join(cleaned_url.split())

    title = re.sub(r"\b(Google|GitHub|YouTube|Amazon|Stack Overflow|Reddit|Search)\b", "", tab["title"], flags=re.I).strip()[:100]
    if not cleaned_url:
        return (title or tab["title"][:100])
    if not title:
        return cleaned_url[:100]
    return f"{cleaned_url} {title}"[:100]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--model", default="sentence-transformers/all-MiniLM-L6-v2")
    args = parser.parse_args()

    rows = [json.loads(line) for line in args.dataset.open() if json.loads(line)["split"] == "test"]
    if not rows:
        raise ValueError("No test rows found")

    texts = [embed_input(row[role]) for row in rows for role in ("anchor", "positive", "negative")]
    model = SentenceTransformer(args.model)
    vectors = model.encode(texts, batch_size=args.batch_size, normalize_embeddings=True, show_progress_bar=True)

    print(f"model: {args.model}")
    scores = defaultdict(list)
    for index, row in enumerate(rows):
        anchor, positive, negative = vectors[index * 3:index * 3 + 3]
        margin = float(np.dot(anchor, positive) - np.dot(anchor, negative))
        scores[row["source"]].append(margin)

    for source, margins in sorted(scores.items()):
        margins = np.array(margins)
        print(f"{source}: rows={len(margins):,} top_1={(margins > 0).mean():.2%} mean_margin={margins.mean():.4f}")
    all_margins = np.concatenate(list(scores.values()))
    print(f"all_sources: rows={len(all_margins):,} top_1={(all_margins > 0).mean():.2%} mean_margin={all_margins.mean():.4f}")


if __name__ == "__main__":
    main()
