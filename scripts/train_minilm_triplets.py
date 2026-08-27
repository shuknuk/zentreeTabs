#!/usr/bin/env python3
"""Full-fine-tune MiniLM as a tab-grouping sentence embedder."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import load_dataset
from sentence_transformers import (
    SentenceTransformer,
    SentenceTransformerTrainer,
    SentenceTransformerTrainingArguments,
    losses,
)
from sentence_transformers.evaluation import TripletEvaluator
from sentence_transformers.training_args import BatchSamplers


def triplet_texts(path: Path) -> dict[str, list[str]]:
    rows = [json.loads(line) for line in path.open()]
    if not rows or any(set(row) != {"anchor", "positive", "negative"} for row in rows):
        raise ValueError(f"{path} must contain non-empty anchor/positive/negative JSONL rows")
    return {field: [row[field] for row in rows] for field in ("anchor", "positive", "negative")}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-file", type=Path, default=Path("data/minilm_tab_triplets_train.jsonl"))
    parser.add_argument("--eval-file", type=Path, default=Path("data/minilm_tab_triplets_test.jsonl"))
    parser.add_argument("--model", default="sentence-transformers/all-MiniLM-L6-v2")
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/minilm-tab-grouping-full-ft"))
    parser.add_argument("--epochs", type=float, default=1)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    args = parser.parse_args()

    train = load_dataset("json", data_files=str(args.train_file), split="train")
    eval_texts = triplet_texts(args.eval_file)
    model = SentenceTransformer(args.model)
    model.max_seq_length = 128

    training_args = SentenceTransformerTrainingArguments(
        output_dir=str(args.output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        warmup_ratio=0.1,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=torch.cuda.is_available() and not torch.cuda.is_bf16_supported(),
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        logging_steps=10,
        batch_sampler=BatchSamplers.NO_DUPLICATES,
        report_to="none",
    )
    evaluator = TripletEvaluator(name="tab_grouping_test", **eval_texts)
    trainer = SentenceTransformerTrainer(
        model=model,
        args=training_args,
        train_dataset=train,
        loss=losses.CachedMultipleNegativesRankingLoss(model, mini_batch_size=32),
        evaluator=evaluator,
    )
    trainer.train()
    trainer.save_model(str(args.output_dir))
    print(f"Saved full-fine-tuned model to {args.output_dir}")


if __name__ == "__main__":
    main()
