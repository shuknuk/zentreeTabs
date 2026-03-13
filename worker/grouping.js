const MIN_SIMILARITY = 0.75;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "among",
  "and",
  "back",
  "because",
  "being",
  "between",
  "could",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "only",
  "over",
  "same",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "through",
  "under",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
]);

function cosineSimilarity(left, right) {
  if (!left || !right || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftMagnitude += left[i] * left[i];
    rightMagnitude += right[i] * right[i];
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text, rootDomain) {
  const domainTokens = new Set(
    (rootDomain || "")
      .split(".")
      .flatMap((part) => part.split("-"))
      .filter(Boolean),
  );

  return normalizeText(text)
    .split(" ")
    .filter((token) => {
      return token.length > 2 && !STOP_WORDS.has(token) && !domainTokens.has(token);
    });
}

function titleCase(parts) {
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCompoundSuffix(parts) {
  const compoundRoots = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
  return parts.length >= 3 && parts[parts.length - 1].length === 2 && compoundRoots.has(parts[parts.length - 2]);
}

function getDomainLabel(rootDomain) {
  const parts = (rootDomain || "").split(".").filter(Boolean);
  if (parts.length === 0) {
    return "Domain";
  }

  if (isCompoundSuffix(parts) && parts.length >= 3) {
    return parts[parts.length - 3];
  }

  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

function buildSemanticGroupName(members) {
  const tokenSets = [];
  const bigramSets = [];
  const tokenScores = new Map();
  const bigramScores = new Map();

  members.forEach((member) => {
    const tokens = tokenize(member.context, member.rootDomain);
    const uniqueTokens = [...new Set(tokens)];
    tokenSets.push(new Set(uniqueTokens));

    uniqueTokens.forEach((token) => {
      tokenScores.set(token, (tokenScores.get(token) || 0) + 1);
    });

    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      bigrams.push(bigram);
    }
    const uniqueBigrams = [...new Set(bigrams)];
    bigramSets.push(new Set(uniqueBigrams));
    uniqueBigrams.forEach((bigram) => {
      bigramScores.set(bigram, (bigramScores.get(bigram) || 0) + 1);
    });
  });

  const commonBigrams = [...bigramScores.entries()]
    .filter(([, count]) => count === members.length)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length);
  if (commonBigrams.length > 0) {
    return titleCase(commonBigrams[0][0].split(" "));
  }

  const commonTokens = [...tokenScores.entries()]
    .filter(([, count]) => count === members.length)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 2)
    .map(([token]) => token);
  if (commonTokens.length > 0) {
    return titleCase(commonTokens);
  }

  const fallbackTokens = [...tokenScores.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 2)
    .map(([token]) => token);
  if (fallbackTokens.length > 0) {
    return titleCase(fallbackTokens);
  }

  return "Shared Topic";
}

function buildSimilarityMatrix(tabs, embeddings) {
  const matrix = new Map();
  tabs.forEach((tab, index) => {
    const row = new Map();
    tabs.forEach((otherTab, otherIndex) => {
      if (index === otherIndex) {
        row.set(otherTab.id, 1);
        return;
      }
      row.set(otherTab.id, cosineSimilarity(embeddings[index], embeddings[otherIndex]));
    });
    matrix.set(tab.id, row);
  });
  return matrix;
}

export function groupTabsBySemanticRules(tabs, embeddings) {
  if (!tabs.length || tabs.length !== embeddings.length) {
    return [];
  }

  const orderedTabs = tabs
    .map((tab, index) => ({ ...tab, embedding: embeddings[index] }))
    .sort((left, right) => left.index - right.index);

  const matrix = buildSimilarityMatrix(
    orderedTabs,
    orderedTabs.map((tab) => tab.embedding),
  );
  const assignedIds = new Set();
  const semanticCandidates = orderedTabs.filter((tab) => tab.context.trim().length > 0);
  const seedOrder = semanticCandidates
    .map((tab) => {
      const neighborCount = semanticCandidates.filter((other) => {
        return other.id !== tab.id && matrix.get(tab.id).get(other.id) > MIN_SIMILARITY;
      }).length;
      return { tab, neighborCount };
    })
    .sort((left, right) => right.neighborCount - left.neighborCount || left.tab.index - right.tab.index);

  const groups = [];

  seedOrder.forEach(({ tab: seed }) => {
    if (assignedIds.has(seed.id)) {
      return;
    }

    const members = [seed];
    const candidates = semanticCandidates
      .filter((candidate) => candidate.id !== seed.id && !assignedIds.has(candidate.id))
      .sort((left, right) => {
        return matrix.get(seed.id).get(right.id) - matrix.get(seed.id).get(left.id);
      });

    candidates.forEach((candidate) => {
      const passesAllMembers = members.every((member) => {
        return matrix.get(member.id).get(candidate.id) > MIN_SIMILARITY;
      });
      if (passesAllMembers) {
        members.push(candidate);
      }
    });

    if (members.length < 2) {
      return;
    }

    members.forEach((member) => assignedIds.add(member.id));
    groups.push({
      name: buildSemanticGroupName(members),
      tabIds: members.map((member) => member.id),
      type: "semantic",
    });
  });

  const fallbackBuckets = new Map();
  orderedTabs.forEach((tab) => {
    if (assignedIds.has(tab.id) || tab.hasUsableDescription || !tab.rootDomain) {
      return;
    }

    if (!fallbackBuckets.has(tab.rootDomain)) {
      fallbackBuckets.set(tab.rootDomain, []);
    }
    fallbackBuckets.get(tab.rootDomain).push(tab);
  });

  fallbackBuckets.forEach((bucket, rootDomain) => {
    if (bucket.length < 3) {
      return;
    }

    bucket.forEach((tab) => assignedIds.add(tab.id));
    groups.push({
      name: titleCase([getDomainLabel(rootDomain)]),
      tabIds: bucket.map((tab) => tab.id),
      type: "fallback",
    });
  });

  return groups;
}
