import * as Transformers from "./lib/transformers.js";
import { groupTabsBySemanticRules } from "./worker/grouping.js";

const pipelineFactory =
  Transformers.pipeline ||
  (Transformers.default && Transformers.default.pipeline) ||
  globalThis.transformers?.pipeline;
const env =
  Transformers.env ||
  (Transformers.default && Transformers.default.env) ||
  globalThis.transformers?.env;

if (env?.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    "ort-wasm.wasm": chrome.runtime.getURL("lib/ort-wasm.wasm"),
    "ort-wasm-simd.wasm": chrome.runtime.getURL("lib/ort-wasm-simd.wasm"),
  };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  env.allowLocalModels = false;
}

let embeddingPipeline = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    if (!pipelineFactory) {
      throw new Error("Transformers pipeline is unavailable.");
    }

    embeddingPipeline = await pipelineFactory(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
  }

  return embeddingPipeline;
}

function toEmbeddingArrays(output) {
  if (output.data && output.dims) {
    const [rows, dimensions] = output.dims;
    const embeddings = [];
    for (let row = 0; row < rows; row += 1) {
      embeddings.push(
        Array.from(output.data.subarray(row * dimensions, (row + 1) * dimensions)),
      );
    }
    return embeddings;
  }

  if (typeof output.tolist === "function") {
    return output.tolist();
  }

  return Array.isArray(output) ? output : [];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "OFFSCREEN_GROUP_TABS") {
    return undefined;
  }

  (async () => {
    if (!Array.isArray(message.tabs) || message.tabs.length < 2) {
      return { ok: true, groups: [] };
    }

    const pipeline = await getEmbeddingPipeline();
    const contexts = message.tabs.map((tab) => tab.context || "");
    const output = await pipeline(contexts, {
      pooling: "mean",
      normalize: true,
    });
    const embeddings = toEmbeddingArrays(output);
    const groups = groupTabsBySemanticRules(message.tabs, embeddings);
    return { ok: true, groups };
  })()
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error("Offscreen grouping failed", error);
      sendResponse({ ok: false, error: error.message || "Offscreen grouping failed." });
    });

  return true;
});
