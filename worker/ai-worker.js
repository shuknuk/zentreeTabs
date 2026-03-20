// ai-worker.js - Handles AI inference for tab grouping
import * as Transformers from '/lib/transformers.js';
import { TabGrouper } from './grouping.js';

console.log('AI Worker: Initializing...');

// --- Transformers Pipeline Setup ---
// Try to get pipeline from various possible export locations
const pipeline = Transformers.pipeline || (Transformers.default && Transformers.default.pipeline) || (self.transformers && self.transformers.pipeline);
const env = Transformers.env || (Transformers.default && Transformers.default.env) || (self.transformers && self.transformers.env);

// Suppress specific transformers.js warning
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Unable to determine content-length')) {
    return;
  }
  originalWarn.apply(console, args);
};

// Configure environment for local WASM
if (env && env.backends && env.backends.onnx) {
  env.backends.onnx.wasm.wasmPaths = {
    'ort-wasm.wasm': self.location.origin + '/lib/ort-wasm.wasm',
    'ort-wasm-simd.wasm': self.location.origin + '/lib/ort-wasm-simd.wasm'
  };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  env.allowLocalModels = false;
}

let pipe = null;

// --- Main Message Listener ---
self.addEventListener('message', async (event) => {
  const { type, tabs } = event.data;

  // Initialize pipeline on first run or explicit request
  if (!pipe && (type === 'SORT_TABS' || type === 'INIT')) {
    try {
      if (!pipeline) throw new Error('Transformers lib not found');

      // Use all-MiniLM-L6-v2: Faster and lighter than L12-v2
      // 384-dim embeddings vs 384-dim (L12 has same dims but more layers)
      // L6 is 2x faster with minimal accuracy loss for tab grouping
      pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (data) => {
          if (data.status === 'progress') {
            self.postMessage({
              type: 'MODEL_DOWNLOAD_PROGRESS',
              data: { ...data }
            });
          }
        }
      });
    } catch (err) {
      console.error("Failed to load model:", err);
      self.postMessage({ type: 'ERROR', error: "Failed to load AI model: " + err.message });
      return;
    }
  }

  if (type === 'SORT_TABS') {
    let step = 'init';
    try {
      step = 'preprocessing';

      // URL content extractor — extracts search queries and clean pathnames to avoid domain dominance
      function extractEmbedInput(tab) {
          let cleanedURL = "";
          try {
              const url = new URL(tab.url);
              const path = url.pathname;
              const searchParams = url.searchParams;

              // 1. Extract search query if present
              const searchQuery =
                  searchParams.get("q") ||
                  searchParams.get("query") ||
                  searchParams.get("search");

              if (searchQuery) {
                  cleanedURL = searchQuery;
              } else if (path && path !== "/" && path !== "") {
                  // 2. Clean pathname: strip extensions, replace separators with spaces, remove numeric IDs
                  cleanedURL = path
                      .replace(/\.[^./]+$/, "")          // Strip file extensions (.html, .php, etc.)
                      .replace(/[_\-./]/g, " ")          // Replace separators with spaces
                      .replace(/\b\d+\b/g, "")           // Remove numeric IDs
                      .replace(/\s+/g, " ")              // Normalize spaces
                      .trim();
              }
          } catch (e) {
              // Invalid URL, fall through
          }

          // 3. Combine: URL content (weighted toward) + title
          const title = tab.title
              .replace(/\b(Google|GitHub|YouTube|Amazon|Stack Overflow|Reddit|Search)\b/gi, '')
              .trim()
              .substring(0, 100);

          if (!cleanedURL) {
              return title || tab.title.substring(0, 100);
          }
          if (!title) {
              return cleanedURL.substring(0, 100);
          }
          // Weight URL content slightly higher to dominate domain
          return (cleanedURL + " " + title).substring(0, 100);
      }

      // Prepare inputs for embedding
      const inputs = tabs.map(t => extractEmbedInput(t));

      step = 'inference';
      // Run inference with all-MiniLM-L6-v2 (faster, lighter model)
      const output = await pipe(inputs, { pooling: 'mean', normalize: true });

      step = 'formatting';
      // Convert Tensor to clean Arrays
      let embeddings = [];
      if (output.data && output.dims) {
        // Flat Float32Array
        const [numInputs, dim] = output.dims;
        for (let i = 0; i < numInputs; i++) {
          embeddings.push(Array.from(output.data.subarray(i * dim, (i + 1) * dim)));
        }
      } else if (Array.isArray(output)) {
        embeddings = output; // Fallback
      } else {
        embeddings = output.tolist();
      }

      step = 'grouping';
      // Use the Enhanced Deterministic Grouper with proximity weighting
      // Grouping threshold is passed from the main thread (default is 2)
      const groupingThreshold = Number.isFinite(event.data.groupingThreshold)
        ? event.data.groupingThreshold
        : 2;
      const grouper = new TabGrouper({
        domainGrouping: {
          enabled: true,
          minAdjacentTabs: groupingThreshold
        }
      });
      const result = grouper.group(tabs, embeddings);

      // Send results back
      self.postMessage({
        type: 'GROUPS_GENERATED',
        groups: formatGroupsForExtension(result.groups),
        ungrouped: result.ungrouped,
        debug: {
          totalGroups: result.groups.length,
          totalUngrouped: result.ungrouped.length,
          groupDetails: result.groups.map(g => ({
            title: g.title,
            size: g.members.length,
            confidence: g.confidence,
            type: g.type,
            debug: g.debug
          }))
        }
      });

    } catch (err) {
      console.error(`AI Worker Error at ${step}:`, err);
      self.postMessage({ type: 'ERROR', error: `(${step}) ${err.message}` });
    }
  }
});

// Helper to convert internal group structure to what the extension expects (map format)
function formatGroupsForExtension(internalGroups) {
  const groupMap = {};
  internalGroups.forEach(g => {
    // The extension expects key = groupName, value = [tabIds]
    // If names collide, we might append ID, but TabGrouper handles logic well.
    // For now, let's trust the title is unique-ish or just overwrite (visual grouping usually merges same-named groups)

    // We append a suffix if it already exists to be safe
    let finalName = g.title;
    let counter = 2;
    while (groupMap[finalName]) {
      finalName = `${g.title} (${counter++})`;
    }

    groupMap[finalName] = g.members;
  });
  return groupMap;
}
