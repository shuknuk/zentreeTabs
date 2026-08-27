#!/usr/bin/env python3
"""Build local MiniLM triplets from public task-oriented search sessions."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import random
import re
import urllib.parse
from collections import defaultdict
from pathlib import Path

import defusedxml.ElementTree as ET
import requests


TREC_2012_URL = "https://trec.nist.gov/data/session/12/sessiontrack2012.txt"
TASK_AWARE_ON_URL = "https://ciir.cs.umass.edu/downloads/task-aware-query-recommendation/on-task-contexts.json.gz"
TASK_AWARE_OFF_URL = "https://ciir.cs.umass.edu/downloads/task-aware-query-recommendation/off-task-contexts.json.gz"
OUTPUT = Path("data/public_session_triplets.jsonl")
RANDOM = random.Random(42)


def fetch(url: str) -> bytes:
    if urllib.parse.urlparse(url).scheme != "https":
        raise ValueError(f"Refusing to fetch non-https URL: {url}")
    response = requests.get(url, headers={"User-Agent": "ZenTreeTabs dataset builder"}, timeout=60)
    response.raise_for_status()
    return response.content


def split_for(task_id: str) -> str:
    return "test" if int(hashlib.sha256(task_id.encode()).hexdigest(), 16) % 5 == 0 else "train"


def tab(title: str, url: str) -> dict[str, str]:
    return {"title": " ".join(title.split())[:200], "url": url[:500]}


def search_tab(query: str) -> dict[str, str]:
    encoded = urllib.parse.quote_plus(query)
    return tab(f"Google Search: {query}", f"https://www.google.com/search?q={encoded}")


def trec_rows() -> list[dict]:
    xml = fetch(TREC_2012_URL).decode()
    # The public 2012 export contains literal ampersands in legacy titles/topics.
    xml = re.sub(r"&(?!amp;|lt;|gt;|quot;|apos;|#\\d+;|#x[0-9a-fA-F]+;)", "&amp;", xml)
    root = ET.fromstring(xml)
    rows = []
    for session in root.findall("session"):
        session_id = f"trec-2012-{session.attrib['num']}"
        topic_id = session.find("topic").attrib["num"]
        for interaction in session.findall("interaction"):
            query = interaction.findtext("query", default="").strip()
            results = interaction.findall("results/result")
            clicked = {int(click.findtext("rank")) for click in interaction.findall("clicked/click")}
            for result in results:
                if int(result.attrib["rank"]) not in clicked:
                    continue
                title = result.findtext("title", default="").strip()
                url = result.findtext("url", default="").strip()
                if query and title and url:
                    rows.append({
                        "source": "trec_session_2012",
                        "label_type": "observed_click_same_task",
                        "session_id": session_id,
                        "topic_id": topic_id,
                        "task_id": f"trec-2012-topic-{topic_id}",
                        "anchor": search_tab(query),
                        "positive": tab(title, url),
                    })

    positives = list(rows)
    RANDOM.shuffle(positives)
    for index, row in enumerate(rows):
        negative = next(candidate for candidate in positives[index:] + positives[:index] if candidate["topic_id"] != row["topic_id"])
        row["negative"] = negative["positive"]
        row["split"] = split_for(row["task_id"])
    return rows


def gz_json_lines(url: str):
    content = gzip.GzipFile(fileobj=io.BytesIO(fetch(url))).read().decode()
    return (json.loads(line) for line in content.splitlines() if line)


def task_aware_rows() -> list[dict]:
    positives = defaultdict(list)
    for record in gz_json_lines(TASK_AWARE_ON_URL):
        context = record["context"]
        anchor = context[-1]["query"]
        key = (record["trecSessionYear"], record["sessionID"], anchor)
        positives[key].extend(item["query"] for item in context[:-1] if item["onTask"] and item["query"] != anchor)

    rows, seen = [], set()
    for record in gz_json_lines(TASK_AWARE_OFF_URL):
        context = record["context"]
        anchor = context[-1]["query"]
        key = (record["trecSessionYear"], record["sessionID"], anchor)
        if not positives[key]:
            continue
        session_id = f"task-aware-{key[0]}-{key[1]}"
        for negative in (item["query"] for item in context[:-1] if not item["onTask"]):
            positive = RANDOM.choice(positives[key])
            if negative == anchor or negative == positive:
                continue
            pair_key = (session_id, anchor, negative)
            if pair_key in seen:
                continue
            seen.add(pair_key)
            rows.append({
                "source": "task_aware_query_recommendation",
                "label_type": "annotated_same_task_vs_off_task",
                "session_id": session_id,
                "topic_id": record["trecSessionTopicID"],
                "task_id": f"task-aware-{key[0]}-topic-{record['trecSessionTopicID']}",
                "anchor": search_tab(anchor),
                "positive": search_tab(positive),
                "negative": search_tab(negative),
                "split": split_for(f"task-aware-{key[0]}-topic-{record['trecSessionTopicID']}"),
            })
    return rows


def main():
    rows = trec_rows() + task_aware_rows()
    task_splits = defaultdict(set)
    for row in rows:
        task_splits[(row["source"], row["task_id"])].add(row["split"])
    if any(len(splits) > 1 for splits in task_splits.values()):
        raise ValueError("A task appeared in both train and test")
    RANDOM.shuffle(rows)
    OUTPUT.parent.mkdir(exist_ok=True)
    with OUTPUT.open("w") as output:
        for row in rows:
            output.write(json.dumps(row) + "\n")
    counts = defaultdict(int)
    for row in rows:
        counts[f"{row['source']}:{row['split']}"] += 1
    print(f"Wrote {len(rows):,} triplets to {OUTPUT}")
    for name, count in sorted(counts.items()):
        print(f"{name}: {count:,}")


if __name__ == "__main__":
    main()
