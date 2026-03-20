/**
 * grouping.js - ENHANCED VERSION
 * Advanced Semantic Tab Grouping Engine with Domain-First Logic
 * 
 * Features:
 * - Domain-First Clustering: Adjacent tabs with same domain auto-group
 * - Semantic Clustering: Cookie scenario with 0.8+ similarity
 * - Proximity Weighting: Physical adjacency (70% semantic + 30% proximity)
 * - Smart AI Labeling: Context-aware group naming
 * - Session-based Isolation: Prevents cross-session pollution
 */

export class TabGrouper {
    constructor(config = {}) {
        this.config = {
            // Semantic thresholds
            minSimilarity: 0.65,        // Base threshold for edge creation
            cookieThreshold: 0.8,       // High confidence for "cookie scenario"
            minGroupSize: 2,
            minConfidence: 0.60,

            // Time-based
            sessionGap: 45 * 60 * 1000, // 45 minutes split
            proximityWindow: 10,         // Max tab distance for proximity bonus

            // Weights for scoring
            weights: {
                semantic: 0.7,           // Semantic similarity weight
                proximity: 0.3,          // Physical adjacency weight
                time: 0.2                // Temporal coherence
            },

            // Domain-first settings
            domainGrouping: {
                enabled: true,
                minAdjacentTabs: config.groupingThreshold || 2,      // Min adjacent tabs to form domain group (default: 2)
                maxGap: 2                // Max non-domain tabs between domain tabs
            },

            ...config
        };
    }

    /**
     * Main Entry Point - Enhanced with Domain-First Logic
     * @param {Array} tabs - Array of tab objects {id, title, url, openTime, index}
     * @param {Array<Array<number>>} embeddings - Array of embedding vectors
     * @returns {Object} { groups: [...], ungrouped: [...] }
     */
    group(tabs, embeddings) {
        if (!tabs || tabs.length === 0) return { groups: [], ungrouped: [] };
        if (tabs.length !== embeddings.length) {
            console.error("TabGrouper: Mismatch between tabs and embeddings counts.");
            return { groups: [], ungrouped: tabs.map(t => t.id) };
        }

        // 1. Augment tabs with metadata
        const richTabs = tabs.map((t, i) => ({
            ...t,
            embedding: embeddings[i],
            type: this.detectContentType(t.title, t.url),
            domain: this.getDomain(t.url),
            originalIndex: t.index !== undefined ? t.index : i
        }));

        // Sort by original tab index for proximity calculations
        richTabs.sort((a, b) => a.originalIndex - b.originalIndex);

        const validGroups = [];
        const assignedIds = new Set();

        // 2. PHASE 1: Domain-First Grouping (Priority)
        if (this.config.domainGrouping.enabled) {
            const domainGroups = this.findDomainGroups(richTabs);
            domainGroups.forEach(group => {
                validGroups.push(group);
                group.members.forEach(id => assignedIds.add(id));
            });
        }

        // 3. PHASE 2: Semantic Clustering (for remaining tabs)
        const unassignedTabs = richTabs.filter(t => !assignedIds.has(t.id));

        if (unassignedTabs.length >= this.config.minGroupSize) {
            // Break into sessions
            const sessions = this.breakIntoSessions(unassignedTabs);

            // Process each session
            for (const sessionTabs of sessions) {
                const edges = this.buildSimilarityGraph(sessionTabs);
                const candidates = this.findConnectedComponents(sessionTabs, edges);
                const sessionResult = this.validateAndScore(sessionTabs, candidates);

                sessionResult.groups.forEach(g => {
                    validGroups.push(g);
                    g.members.forEach(id => assignedIds.add(id));
                });
            }
        }

        // PHASE 3: Orphan Rescue — attach stray tabs to existing groups via centroid similarity
        if (validGroups.length > 0) {
            const orphanTabs = richTabs.filter(t => !assignedIds.has(t.id));
            if (orphanTabs.length > 0) {
                // Compute centroids for each existing group
                const groupCentroids = validGroups.map(g => {
                    const members = g.members.map(id => richTabs.find(t => t.id === id)).filter(Boolean);
                    const centroid = new Array(members[0].embedding.length).fill(0);
                    members.forEach(m => {
                        for (let k = 0; k < centroid.length; k++) {
                            centroid[k] += m.embedding[k];
                        }
                    });
                    for (let k = 0; k < centroid.length; k++) {
                        centroid[k] /= members.length;
                    }
                    return { group: g, centroid };
                });

                // For each orphan, find best centroid match
                for (const orphan of orphanTabs) {
                    let bestScore = -1;
                    let bestGroup = null;
                    for (const { group, centroid } of groupCentroids) {
                        const score = this.cosineSimilarity(orphan.embedding, centroid);
                        if (score > bestScore) {
                            bestScore = score;
                            bestGroup = group;
                        }
                    }
                    if (bestScore > 0.55) {
                        bestGroup.members.push(orphan.id);
                        bestGroup.confidence = Math.min(1.0, bestGroup.confidence + 0.02);
                        assignedIds.add(orphan.id);
                    }
                }
            }
        }

        const ungrouped = richTabs.filter(t => !assignedIds.has(t.id)).map(t => t.id);
        return { groups: validGroups, ungrouped };
    }

    /**
     * DOMAIN-FIRST LOGIC
     * Find groups of adjacent tabs with the same root domain
     */
    findDomainGroups(tabs) {
        const groups = [];
        const { minAdjacentTabs, maxGap } = this.config.domainGrouping;

        let i = 0;
        while (i < tabs.length) {
            const currentDomain = tabs[i].domain;
            if (!currentDomain || currentDomain === 'newtab') {
                i++;
                continue;
            }

            // Find all adjacent tabs with same domain (allowing small gaps)
            const cluster = [tabs[i]];
            let gapCount = 0;
            let j = i + 1;

            while (j < tabs.length && gapCount <= maxGap) {
                if (tabs[j].domain === currentDomain) {
                    cluster.push(tabs[j]);
                    gapCount = 0; // Reset gap counter
                } else {
                    gapCount++;
                }
                j++;
            }

            // If we found enough adjacent tabs, create a domain group
            if (cluster.length >= minAdjacentTabs) {
                const memberIds = cluster.map(t => t.id);
                const groupName = this.generateDomainGroupName(cluster);

                groups.push({
                    id: `dom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    title: groupName,
                    members: memberIds,
                    confidence: 0.95, // High confidence for domain groups
                    type: 'domain',
                    debug: {
                        domain: currentDomain,
                        count: cluster.length,
                        reason: 'domain-first'
                    }
                });

                // Skip past this cluster
                i = j;
            } else {
                i++;
            }
        }

        return groups;
    }

    /**
     * Generate smart name for domain groups
     */
    generateDomainGroupName(tabs) {
        const domain = tabs[0].domain;

        // Extract meaningful part of domain
        const parts = domain.split('.');
        let baseName = parts[parts.length - 2] || parts[0];

        // Capitalize
        baseName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

        // Try to add context from titles
        const commonWords = this.extractCommonWords(tabs.map(t => t.title), 2);
        if (commonWords.length > 0) {
            return `${baseName} - ${commonWords.join(' ')}`;
        }

        return `${baseName} (${tabs.length})`;
    }

    /**
     * Extract common words from titles
     */
    extractCommonWords(titles, maxWords = 2) {
        const stopWords = new Set([
            'the', 'and', 'or', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for',
            'with', 'by', 'from', 'new', 'tab', 'page'
        ]);

        const wordCounts = {};
        titles.forEach(title => {
            const words = title.toLowerCase()
                .replace(/[^a-z0-9 ]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !stopWords.has(w));

            words.forEach(w => {
                wordCounts[w] = (wordCounts[w] || 0) + 1;
            });
        });

        const threshold = Math.ceil(titles.length * 0.4); // 40% of tabs
        const common = Object.entries(wordCounts)
            .filter(([_, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxWords)
            .map(([word, _]) => this.capitalize(word));

        return common;
    }

    /**
     * Break tabs into sessions based on time gaps
     */
    breakIntoSessions(tabs) {
        const sorted = [...tabs].sort((a, b) => (a.openTime || 0) - (b.openTime || 0));
        const sessions = [];
        if (sorted.length === 0) return sessions;

        let currentSession = [sorted[0]];
        sessions.push(currentSession);

        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            const gap = (curr.openTime || 0) - (prev.openTime || 0);

            if (gap > this.config.sessionGap) {
                currentSession = [curr];
                sessions.push(currentSession);
            } else {
                currentSession.push(curr);
            }
        }
        return sessions;
    }

    /**
     * Detect content intent: EXPLORATION vs REFERENCE vs GENERAL
     */
    detectContentType(title, url) {
        const t = title.toLowerCase();
        const u = url ? url.toLowerCase() : "";

        // Exploration Signals (Search, Social, Discovery)
        if (
            t.includes("search") ||
            t.includes("reddit") ||
            t.includes("stackoverflow") ||
            u.includes("google.com/search") ||
            u.includes("reddit.com") ||
            u.includes("twitter.com") ||
            u.includes("youtube.com/results")
        ) {
            return "EXPLORATION";
        }

        // Reference Signals (Documentation, Guides)
        if (
            t.includes("documentation") ||
            t.includes("docs") ||
            t.includes("api reference") ||
            t.includes("guide") ||
            t.includes("mdn") ||
            u.includes("developer.mozilla.org") ||
            u.includes("react.dev") ||
            u.includes("docs.") ||
            u.includes("/documentation")
        ) {
            return "REFERENCE";
        }

        return "GENERAL";
    }

    /**
     * Cosine Similarity calculation
     */
    cosineSimilarity(vecA, vecB) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] ** 2;
            normB += vecB[i] ** 2;
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }

    /**
     * Extract domain from URL
     */
    getDomain(urlStr) {
        try {
            const url = new URL(urlStr);
            return url.hostname;
        } catch (e) {
            return "";
        }
    }

    /**
     * Calculate proximity score based on tab index distance
     */
    calculateProximityScore(indexA, indexB) {
        const distance = Math.abs(indexA - indexB);
        if (distance === 0) return 1.0;
        if (distance > this.config.proximityWindow) return 0.0;

        // Exponential decay: closer tabs get higher scores
        return Math.exp(-distance / 3);
    }

    /**
     * Build similarity graph with PROXIMITY WEIGHTING
     * Formula: Total Score = (Semantic * 0.7) + (Proximity * 0.3)
     */
    buildSimilarityGraph(tabs) {
        const edges = [];
        const count = tabs.length;

        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const a = tabs[i];
                const b = tabs[j];

                // 1. Semantic Similarity
                const semanticSim = this.cosineSimilarity(a.embedding, b.embedding);

                if (semanticSim < 0.3) continue; // Early exit for very dissimilar tabs

                // 2. Proximity Score (physical adjacency)
                const proximitySim = this.calculateProximityScore(
                    a.originalIndex,
                    b.originalIndex
                );

                // 3. Combined Score with weighting
                let totalScore =
                    (semanticSim * this.config.weights.semantic) +
                    (proximitySim * this.config.weights.proximity);

                // 4. Affinity Boost: Exploration <-> Reference
                const isAffinityPair =
                    (a.type === "EXPLORATION" && b.type === "REFERENCE") ||
                    (b.type === "EXPLORATION" && a.type === "REFERENCE");

                if (isAffinityPair && semanticSim > 0.55) {
                    totalScore += 0.1; // Boost for workflow pairs
                }

                // 5. Cookie Scenario: High semantic similarity + close proximity
                const isCookieScenario =
                    semanticSim >= this.config.cookieThreshold &&
                    proximitySim > 0.5;

                if (isCookieScenario) {
                    totalScore += 0.05; // Extra boost for "cookie research" scenarios
                }

                // 6. Time-based adjustments
                const timeDiff = Math.abs((a.openTime || 0) - (b.openTime || 0));

                // Deduplication Penalty: Same title but far apart in time
                if (a.title === b.title && timeDiff > 30 * 60 * 1000) {
                    totalScore -= 0.2;
                }

                // 7. Domain penalty (prefer cross-domain semantic groups)
                const sameDomain = a.domain === b.domain;
                if (sameDomain) {
                    totalScore *= 0.95; // Slight penalty (domain groups handled separately)
                }

                // 8. Create edge if score meets threshold
                if (totalScore >= this.config.minSimilarity) {
                    edges.push({
                        source: a.id,
                        target: b.id,
                        weight: totalScore,
                        debug: {
                            semantic: semanticSim.toFixed(2),
                            proximity: proximitySim.toFixed(2),
                            combined: totalScore.toFixed(2)
                        }
                    });
                }
            }
        }
        return edges;
    }

    /**
     * Find connected components using DFS
     */
    findConnectedComponents(tabs, edges) {
        const adj = new Map();
        tabs.forEach(t => adj.set(t.id, []));
        edges.forEach(e => {
            adj.get(e.source).push(e.target);
            adj.get(e.target).push(e.source);
        });

        const visited = new Set();
        const components = [];

        for (const tab of tabs) {
            if (!visited.has(tab.id)) {
                const component = [];
                const stack = [tab.id];
                while (stack.length > 0) {
                    const curr = stack.pop();
                    if (visited.has(curr)) continue;
                    visited.add(curr);
                    component.push(curr);
                    const neighbors = adj.get(curr) || [];
                    for (const n of neighbors) {
                        if (!visited.has(n)) stack.push(n);
                    }
                }
                if (component.length > 0) {
                    components.push(component);
                }
            }
        }
        return components;
    }

    /**
     * Validate and score candidate groups
     */
    validateAndScore(sessionTabs, candidates) {
        const validGroups = [];
        const assignedIds = new Set();
        const tabsMap = new Map(sessionTabs.map(t => [t.id, t]));

        for (const memberIds of candidates) {
            if (memberIds.length < this.config.minGroupSize) continue;

            const groupTabs = memberIds.map(id => tabsMap.get(id));
            let totalSim = 0;
            let pairs = 0;
            let minTime = Infinity;
            let maxTime = -Infinity;
            let minIndex = Infinity;
            let maxIndex = -Infinity;

            let hasReference = false;
            let hasExploration = false;

            for (let i = 0; i < groupTabs.length; i++) {
                const t = groupTabs[i];
                const time = t.openTime || 0;
                const idx = t.originalIndex;

                if (time < minTime) minTime = time;
                if (time > maxTime) maxTime = time;
                if (idx < minIndex) minIndex = idx;
                if (idx > maxIndex) maxIndex = idx;

                if (t.type === "REFERENCE") hasReference = true;
                if (t.type === "EXPLORATION") hasExploration = true;

                for (let j = i + 1; j < groupTabs.length; j++) {
                    totalSim += this.cosineSimilarity(groupTabs[i].embedding, groupTabs[j].embedding);
                    pairs++;
                }
            }

            const avgSim = pairs > 0 ? totalSim / pairs : 1.0;
            const spanMinutes = (maxTime - minTime) / (1000 * 60);
            const indexSpan = maxIndex - minIndex;

            // Time coherence: groups within 2 hours get higher scores
            const timeCoherence = Math.max(0.5, 1.0 - (spanMinutes / 120));

            // Proximity coherence: tabs close together get higher scores
            const proximityCoherence = Math.max(0.5, 1.0 - (indexSpan / 20));

            // Normalized weights that sum to 1.0 (applied only here; buildSimilarityGraph uses config weights)
            const CONFIDENCE_WEIGHT_SEMANTIC = 0.6;
            const CONFIDENCE_WEIGHT_TIME = 0.2;
            const CONFIDENCE_WEIGHT_PROXIMITY = 0.2;

            let confidence =
                (CONFIDENCE_WEIGHT_SEMANTIC * avgSim) +
                (CONFIDENCE_WEIGHT_TIME * timeCoherence) +
                (CONFIDENCE_WEIGHT_PROXIMITY * proximityCoherence);

            // Affinity Bonus for complete workflows (search + docs)
            if (hasReference && hasExploration) {
                confidence += 0.05;
            }

            // Cookie Scenario Bonus: High avg similarity + tight proximity
            if (avgSim >= this.config.cookieThreshold && indexSpan <= 10) {
                confidence += 0.08;
            }

            if (confidence < this.config.minConfidence) continue;

            const name = this.generateGroupName(groupTabs);

            memberIds.forEach(id => assignedIds.add(id));
            validGroups.push({
                id: `grp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                title: name,
                members: memberIds,
                confidence: parseFloat(confidence.toFixed(2)),
                type: 'semantic',
                debug: {
                    avgSim: avgSim.toFixed(2),
                    timeSpan: spanMinutes.toFixed(0) + 'm',
                    indexSpan: indexSpan,
                    proximity: proximityCoherence.toFixed(2)
                }
            });
        }

        const ungrouped = sessionTabs.filter(t => !assignedIds.has(t.id)).map(t => t.id);
        return { groups: validGroups, ungrouped };
    }

    /**
     * Generate smart group name using frequency analysis
     */
    generateGroupName(groupTabs) {
        const stopWords = new Set([
            'the', 'and', 'or', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
            'up', 'about', 'into', 'over', 'after', 'new', 'tab', 'page', 'home', 'index', 'welcome',
            'login', 'signup', 'sign', 'log', 'google', 'search', 'github', 'youtube', 'amazon',
            'stackoverflow', 'reddit', 'facebook', 'twitter', 'linkedin', 'how', 'what', 'when',
            'where', 'why', 'best', 'top', 'get', 'make', 'find'
        ]);

        // Priority: Use Reference Tab title if available (most authoritative)
        const referenceTabs = groupTabs.filter(t => t.type === "REFERENCE");
        if (referenceTabs.length > 0) {
            // Extract key terms from reference docs
            const refTitle = referenceTabs[0].title;
            const words = refTitle.toLowerCase()
                .replace(/[^a-z0-9 ]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !stopWords.has(w))
                .slice(0, 3);

            if (words.length >= 2) {
                return this.capitalize(words.slice(0, 2).join(' '));
            }
        }

        return this.generateNameFromFrequency(groupTabs, stopWords);
    }

    /**
     * Generate name from word/phrase frequency analysis
     */
    generateNameFromFrequency(groupTabs, stopWords) {
        const wordCounts = {};
        const phraseCounts = {};

        groupTabs.forEach(tab => {
            const clean = tab.title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
            const words = clean.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

            words.forEach(w => {
                wordCounts[w] = (wordCounts[w] || 0) + 1;
            });

            // 2-word phrases
            for (let i = 0; i < words.length - 1; i++) {
                const phrase = `${words[i]} ${words[i + 1]}`;
                phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
            }
        });

        // Prefer phrases if they appear in 50%+ of tabs
        const sortedPhrases = Object.entries(phraseCounts).sort((a, b) => b[1] - a[1]);
        if (sortedPhrases.length > 0) {
            const [bestPhrase, count] = sortedPhrases[0];
            if (count >= Math.ceil(groupTabs.length * 0.5)) {
                return this.capitalize(bestPhrase);
            }
        }

        // Fall back to most common word
        const sortedWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]);
        if (sortedWords.length > 0) {
            const topWords = sortedWords.slice(0, 2).map(([word, _]) => word);
            return this.capitalize(topWords.join(' '));
        }

        // Last resort: use domain
        return this.capitalize(this.getDomain(groupTabs[0].url).split('.')[0] || "Group");
    }

    /**
     * Capitalize words
     */
    capitalize(str) {
        return str.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    }
}
