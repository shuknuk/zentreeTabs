# MiniLM Tab-Grouping Training Record

This document records the work completed to prepare a fine-tuning dataset for
ZenTree Tabs' local sentence embedder.

## Goal

Make related Chrome tabs embed closer together, so the existing grouping engine
can create better semantic groups without sending browsing data to a server.

The model is not responsible for every decision. It supplies content
similarity; the existing rules still handle tab position, same-domain grouping,
and naming.

## Current ZenTree pipeline

1. [worker/ai-worker.js](../worker/ai-worker.js) converts each tab's title and
   URL into short text. Search URLs use their query; other URLs use a cleaned
   pathname plus the title.
2. The browser loads `Xenova/all-MiniLM-L6-v2` with Transformers.js and
   produces normalized 384-dimensional embeddings locally.
3. [worker/grouping.js](../worker/grouping.js) combines cosine similarity with
   tab proximity, session logic, domain-first grouping, and the content roles
   `EXPLORATION`, `REFERENCE`, and `GENERAL`.

Fine-tuning should improve Step 2, not replace Steps 1 or 3.

## Why raw webpage records are not enough

A sentence embedder needs relationships, not isolated pages. The training row
must say:

```text
anchor tab  -> should group with -> positive tab
anchor tab  -> should not group with -> negative tab
```

The earlier Unsloth Studio configuration selected the `docs` subset of a
browser-history dataset. Those rows contained individual pages but did not say
which pages belonged in the same task. In addition, 30 steps at an effective
batch of 8 would have processed only about 240 rows. That setup could not
meaningfully teach tab grouping.

## Existing ZenTree terms

The project already detects these useful roles:

- `EXPLORATION`: search/discovery tabs.
- `REFERENCE`: documentation, guides, and APIs.
- `GENERAL`: everything else.

They are metadata, not group labels. Two reference tabs can be unrelated, so
the training examples must still prove topical connection:

```text
React useState search       -> React useState API docs       = positive
React useState search       -> Python pathlib API docs       = negative
```

## Initial local experiment

Before creating a session dataset, a short local MiniLM experiment used the
synthetic `frankjc2022/semantic-history-search` dataset. It trained on 1,500
query-to-page pairs for one epoch on an Apple M2, then compared the base and
fine-tuned model.

| Evaluation | Base MiniLM | Fine-tuned MiniLM | Result |
| --- | ---: | ---: | --- |
| Easy random negatives, 100 queries | 99.0% top-1 | 99.0% top-1 | saturated; inconclusive |
| Baseline-mined hard negatives, 100 queries | 94.0% top-1, 0.9607 MRR | 96.0% top-1, 0.9737 MRR | small positive signal |

This was not deployment evidence: the history data is synthetic and its labels
describe search relevance, not Chrome tab groups. The Hugging Face GPU attempt
did not start because the account returned `402 Payment Required`; no cloud
model was trained or saved.

## Public-data decision

The dataset must be a bootstrap, not a claim that we have real ZenTree user
data. We selected the two sources below because they preserve actual search
task/session relationships.

| Source | Included data | How it becomes a triplet | Decision |
| --- | --- | --- | --- |
| [TREC 2012 Session Track](https://trec.nist.gov/data/session/12/sessiontrack2012.txt) | Human search sessions with query, result title/URL/snippet, clicks, time, and task ID | Query tab -> clicked result tab is positive; clicked result from another task is negative | Included |
| [UMass Task-Aware Query Recommendation](https://ciir.cs.umass.edu/downloads/task-aware-query-recommendation/) | 212 TREC sessions with same-task and off-task query markers | Reference query -> same-task query is positive; explicitly off-task query is negative | Included |
| [Mozilla History Search Retrieval](https://huggingface.co/datasets/Mozilla/history-search-retrieval) | Browser-shaped URL/title records and query relevance | Synthetic, not real browsing sessions | Not included in the session bootstrap |
| [Microsoft MIND](https://msnews.github.io/) | Anonymized news click behavior and article text | A recommendation click is not a reliable “same Chrome task” label; research-only license also limits redistribution | Not included |

## Created dataset

Run this command from the repository root:

```sh
python3 scripts/build_public_session_triplets.py
```

It creates the ignored local file:

```text
data/public_session_triplets.jsonl
```

The dataset is ignored intentionally. Upstream terms should be verified before
sharing any derived rows publicly.

### Row format

```json
{
  "source": "task_aware_query_recommendation",
  "label_type": "annotated_same_task_vs_off_task",
  "session_id": "task-aware-2010-1064",
  "topic_id": "64",
  "task_id": "task-aware-2010-topic-64",
  "anchor": {"title": "Google Search: hosting pampered chef", "url": "https://www.google.com/search?q=hosting+pampered+chef"},
  "positive": {"title": "Google Search: pampered chef", "url": "https://www.google.com/search?q=pampered+chef"},
  "negative": {"title": "Google Search: soralfun", "url": "https://www.google.com/search?q=soralfun"},
  "split": "train"
}
```

### Builder behavior

- Converts queries to Google-search-shaped tabs so they flow through ZenTree's
  existing URL-query extraction.
- Preserves `source`, `session_id`, `topic_id`, a year-aware `task_id`, and
  `label_type` on every row.
- Splits by task ID, not by row: a task cannot appear in both train and test.
- Excludes contradictory rows where an off-task query has exactly the same text
  as the anchor or positive.
- Repairs only malformed literal ampersands in TREC's legacy XML before parsing.

### Build and validation results

The first validated build created **20,827 triplets**:

| Source | Train | Test |
| --- | ---: | ---: |
| UMass Task-Aware | 16,036 | 4,532 |
| TREC 2012 clicked results | 188 | 71 |

The structural validation confirmed every row has non-empty anchor, positive,
and negative tabs; no two roles are identical; and no task ID occurs in both
splits.

### Human review result

A ten-row stratified review is recorded in
[data/session_triplet_review.md](../data/session_triplet_review.md). Nine rows
matched ZenTree's grouping definition. One Task-Aware row (“Chanel top
fragrance” -> “Chanel president”) was dropped as too broad. We will keep the
sources separate in the baseline report rather than invent an unreliable
one-example filter.

## Current-model baseline

Run the repeatable baseline with:

```sh
uv run --python 3.12 --with sentence-transformers --with torch --with numpy \
  python scripts/evaluate_minilm_baseline.py --batch-size 256
```

The evaluator mirrors ZenTree's current `extractEmbedInput` logic, embeds the
held-out rows with `sentence-transformers/all-MiniLM-L6-v2`, and measures
whether the positive tab has a higher cosine similarity to the anchor than the
negative tab. It also reports the average similarity gap (positive minus
negative).

| Held-out source | Rows | Positive beats negative | Mean similarity gap |
| --- | ---: | ---: | ---: |
| UMass Task-Aware | 4,532 | 99.07% | 0.6357 |
| TREC 2012 clicked results | 71 | 95.77% | 0.5569 |
| Combined | 4,603 | 99.02% | 0.6344 |

This does **not** prove that ZenTree is already good at grouping real tab
sets. The public negatives are usually obviously unrelated, so the test is
easy. It does prove that training on this exact data cannot show a meaningful
improvement unless we add harder, realistic distractor tabs.

## Hard-test candidates awaiting review

`scripts/mine_hard_negatives.py` uses the frozen test split only. For each
anchor, it selects the current model's most similar positive tab from a
different source task. It created the ignored
`data/public_hard_triplets.jsonl` file with 4,603 candidate triplets.

| Held-out source | Positive beats mined negative | Mean similarity gap |
| --- | ---: | ---: |
| UMass Task-Aware | 93.71% | 0.4002 |
| TREC 2012 clicked results | 92.96% | 0.4046 |

This is harder than the easy public test, but a mechanically chosen
different-task tab can still be a valid ZenTree group member. The required
second human review is in [data/hard_triplet_review.md](../data/hard_triplet_review.md).
The completed review kept 6 of 10 rows and dropped 4. Because three dropped
rows came from Task-Aware and clearly belonged in the anchor's group, this
public hard set is rejected as the final benchmark.

## Next chores

1. Review a stratified sample of generated rows. Remove sources or patterns
   that violate ZenTree's “same browsing task” definition.
2. **Completed:** run the current MiniLM against the held-out session split.
3. **Completed:** reject the public mined hard set as a final benchmark. Public
   task IDs are too coarse for ZenTree's intended grouping behavior.
4. Create a small, manually labelled hard test from real ZenTree sessions.
   This must stay separate from the future training set.
5. Fine-tune using the sentence-embedding/contrastive workflow. Unsloth can
   accelerate this on the A100, but the training loss must be embedding loss,
   not generic chat SFT.
6. Compare the fine-tuned model to the baseline on the same held-out sessions.
7. Only if it wins, merge/export to ONNX and test the model inside the Chrome
   extension.

### Real-test worksheet

[data/real_tab_test_worksheet.md](../data/real_tab_test_worksheet.md) now
contains a 30-row synthetic prototype requested in place of unavailable real
browser data. It illustrates the intended hard-negative behavior but is not a
real-user benchmark and must be replaced with sanitized real sessions before a
deployment decision. Real test rows must never be used during fine-tuning.
