#!/usr/bin/env python3
"""Build local tab triplets from Mozilla's synthetic history-search dataset."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote_plus

from datasets import load_dataset


DATASET = "Mozilla/history-search-retrieval"
OUTPUT = Path("data/mozilla_history_triplets.jsonl")


def split_for(query_id: str) -> str:
    return "test" if int(hashlib.sha256(query_id.encode()).hexdigest(), 16) % 5 == 0 else "train"


def tab(doc: dict) -> dict[str, str]:
    return {"title": doc["title"][:200], "url": doc["url"][:500]}


def search_tab(query: str) -> dict[str, str]:
    return {
        "title": f"Google Search: {query}"[:200],
        "url": f"https://www.google.com/search?q={quote_plus(query)}",
    }


def negative_for(query_id: str, positive_id: str, doc_ids: list[str], relevant_ids: set[str]) -> str:
    start = int(hashlib.sha256(f"{query_id}:{positive_id}".encode()).hexdigest(), 16) % len(doc_ids)
    for offset in range(len(doc_ids)):
        candidate = doc_ids[(start + offset) % len(doc_ids)]
        if candidate not in relevant_ids:
            return candidate
    raise ValueError(f"No negative document available for query {query_id}")


def main() -> None:
    docs = load_dataset(DATASET, "docs", split="train")
    queries = load_dataset(DATASET, "queries", split="train")
    qrels = load_dataset(DATASET, "qrels", split="train")

    docs_by_id = {doc["doc_id"]: doc for doc in docs}
    doc_ids_by_profile: dict[str, list[str]] = defaultdict(list)
    for doc in docs:
        doc_ids_by_profile[doc["profile_id"]].append(doc["doc_id"])

    relevant_by_query: dict[str, set[str]] = defaultdict(set)
    for qrel in qrels:
        if qrel["relevance"] > 0 and qrel["doc_id"] in docs_by_id:
            relevant_by_query[qrel["query_id"]].add(qrel["doc_id"])

    rows = []
    for query in queries:
        query_id = query["query_id"]
        relevant_ids = relevant_by_query[query_id]
        profile_doc_ids = doc_ids_by_profile[query["profile_id"]]
        for positive_id in sorted(relevant_ids):
            negative_id = negative_for(query_id, positive_id, profile_doc_ids, relevant_ids)
            rows.append(
                {
                    "source": "mozilla_history_search_retrieval",
                    "label_type": "synthetic_history_search_relevance",
                    "session_id": f"mozilla-profile-{query['profile_id']}",
                    "task_id": f"mozilla-query-{query_id}",
                    "anchor": search_tab(query["search_query"]),
                    "positive": tab(docs_by_id[positive_id]),
                    "negative": tab(docs_by_id[negative_id]),
                    "split": split_for(query_id),
                }
            )

    with OUTPUT.open("w") as output:
        for row in rows:
            output.write(json.dumps(row) + "\n")
    print(f"Wrote {len(rows):,} synthetic-history triplets to {OUTPUT}")


if __name__ == "__main__":
    main()
