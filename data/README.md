# Public session bootstrap data

Run `python3 scripts/build_public_session_triplets.py` to create the ignored
`data/public_session_triplets.jsonl` file.

The builder downloads two public research sources at runtime rather than
committing their contents here:

- [TREC 2012 Session Track](https://trec.nist.gov/data/session/12/sessiontrack2012.txt):
  real human search sessions with queries, result titles/URLs, and clicked
  results. A clicked result is the `positive`; a clicked result from another
  task is the `negative`.
- [UMass Task-Aware Query Recommendation](https://ciir.cs.umass.edu/downloads/task-aware-query-recommendation/):
  TREC-session query contexts with explicit same-task and off-task markers.
  Its off-task query is the `negative`.

Each row is an `anchor`, `positive`, `negative` triplet. The positive is
within the same research task; the negative is from a distinct task or is
explicitly marked off-task. `source`, `session_id`, `task_id`, and `split`
preserve provenance and prevent task leakage during evaluation.

Run `python3 scripts/prepare_minilm_triplets.py` after building the source
data. It creates two ignored Studio-ready JSONL files with only plain-text
`anchor`, `positive`, and `negative` fields:

- `data/minilm_tab_triplets_train.jsonl` — use for training.
- `data/minilm_tab_triplets_test.jsonl` — keep separate for evaluation.

The text is transformed with the same URL/title cleanup that ZenTree uses at
runtime, so the model learns from the inputs it will actually see.

To run the actual embedding trainer on the A100, install torch,
sentence-transformers, and datasets there, then run
python3 scripts/train_minilm_triplets.py.

This is deliberately not the Studio chat-training page: it uses
CachedMultipleNegativesRankingLoss, which consumes all three columns as an
embedding triplet. It evaluates against the held-out test file after the epoch
and saves the resulting model under outputs/.

This is a local research bootstrap, not a publishable ZenTree dataset. Verify
each upstream source's terms before sharing derived rows.

## Mozilla history-search experiment

`python3 scripts/build_mozilla_history_triplets.py` builds a separate ignored
source file at `data/mozilla_history_triplets.jsonl` from Mozilla's synthetic
history-search dataset. Its anchor is a search tab, its positive is a relevant
history page, and its negative is another page from the same synthetic profile.

Keep this separate from the public-session bootstrap data. These are useful
weak labels for a controlled experiment in history/search relevance; they are
not labels saying that two real Chrome tabs belonged in the same tab group.

Prepare it for the embedding trainer with:

    python3 scripts/prepare_minilm_triplets.py --source data/mozilla_history_triplets.jsonl --train-output data/mozilla_history_triplets_train.jsonl --test-output data/mozilla_history_triplets_test.jsonl
