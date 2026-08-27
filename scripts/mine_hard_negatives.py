#!/usr/bin/env python3
"""Create held-out triplets with MiniLM's most confusing wrong tab."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

from evaluate_minilm_baseline import DEFAULT_DATASET, embed_input


DEFAULT_OUTPUT = Path("data/public_hard_triplets.jsonl")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=256)
    args = parser.parse_args()

    rows = [json.loads(line) for line in args.dataset.open() if json.loads(line)["split"] == "test"]
    if not rows:
        raise ValueError("No test rows found")

    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    mined = []
    by_source = defaultdict(list)
    for row in rows:
        by_source[row["source"]].append(row)

    for source, source_rows in sorted(by_source.items()):
        anchors = model.encode([embed_input(row["anchor"]) for row in source_rows], batch_size=args.batch_size, normalize_embeddings=True, show_progress_bar=True)
        candidates = model.encode([embed_input(row["positive"]) for row in source_rows], batch_size=args.batch_size, normalize_embeddings=True, show_progress_bar=True)
        similarities = anchors @ candidates.T
        for index, row in enumerate(source_rows):
            allowed = np.array([candidate["task_id"] != row["task_id"] for candidate in source_rows])
            hard_index = int(np.where(allowed, similarities[index], -np.inf).argmax())
            hard_negative = source_rows[hard_index]
            positive_score = float(similarities[index, index])
            negative_score = float(similarities[index, hard_index])
            mined.append({
                **row,
                "negative": hard_negative["positive"],
                "hard_negative_task_id": hard_negative["task_id"],
                "positive_similarity": round(positive_score, 6),
                "negative_similarity": round(negative_score, 6),
                "margin": round(positive_score - negative_score, 6),
            })

    args.output.parent.mkdir(exist_ok=True)
    with args.output.open("w") as output:
        for row in mined:
            output.write(json.dumps(row) + "\n")
    print(f"Wrote {len(mined):,} hard triplets to {args.output}")


if __name__ == "__main__":
    main()
