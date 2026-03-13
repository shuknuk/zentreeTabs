/**
 * ZenTree Tabs - Side Panel Logic
 * Handles tab rendering, tree structure, events, and drag-and-drop.
 */

// --- State ---
let tabsMap = new Map(); // tabId -> tab object
let rootTabs = []; // Array of tabIds that are roots

let collapsedState = new Set(); // Set of tabIds whose children are hidden
let parentOverrides = new Map(); // childId -> parentId
let customTitles = new Map(); // tabId -> String
let pendingScrollTabId = null;
let selectedTabs = new Set(); // Set of tabIds that are currently selected
let lastClickedTabId = null; // Anchor tab for shift-select range
let isInitialRender = true;
let pendingRenderAfterDrag = false;

const tabsListEl = document.getElementById("tabs-list");
const searchInput = document.getElementById("tab-search");

// --- Initialization ---

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadCollapsedState();
    await loadParentOverrides();
    await loadCustomTitles();
    await fetchAndRenderTabs();
    if (chrome.bookmarks) {
      await fetchAndRenderBookmarks();
    }
  } catch (err) {
    console.error("ZenTree Init Error:", err);
    document.body.innerHTML = `<div style="padding:20px; color:red;">Error loading ZenTree:<br>${err.message}</div>`;
  }

  // Key Tab Listeners
  chrome.tabs.onCreated.addListener(onTabCreated);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
  chrome.tabs.onActivated.addListener(onTabActivated);
  chrome.tabs.onMoved.addListener(onTabMoved);
  chrome.tabs.onAttached.addListener(onTabAttached);
  chrome.tabs.onDetached.addListener(onTabDetached);

  // UI Listeners
  searchInput.addEventListener("input", handleSearch);
  tabsListEl.addEventListener("dragover", handleDragOver);
  tabsListEl.addEventListener("drop", handleDrop);

  // Settings Modal Logic
  const settingsModal = document.getElementById("settings-modal");
  const settingsBtn = document.getElementById("settings-btn");
  const closeSettingsBtn = document.getElementById("close-settings");
  const settingsVersionEl = document.getElementById("settings-version");

  if (settingsVersionEl) {
    const extensionVersion = chrome?.runtime?.getManifest?.()?.version;
    if (extensionVersion) {
      const versionParts = extensionVersion.split(".");
      while (versionParts.length < 3) versionParts.push("0");
      settingsVersionEl.textContent = `v${versionParts.join(".")}`;
    } else {
      settingsVersionEl.textContent = "";
    }
  }

  // Theme Selector Logic
  const themeSwatches = document.querySelectorAll(".theme-swatch");

  // Helper to update active swatch UI
  const updateActiveSwatch = (activeTheme) => {
    themeSwatches.forEach((swatch) => {
      if (swatch.dataset.theme === activeTheme) {
        swatch.classList.add("active");
      } else {
        swatch.classList.remove("active");
      }
    });
  };

  if (themeSwatches.length > 0) {
    themeSwatches.forEach((swatch) => {
      swatch.addEventListener("click", () => {
        const theme = swatch.dataset.theme;
        updateActiveSwatch(theme);
        updateThemeSettings({ themeColor: theme });
      });
    });
  }

  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener("click", () => {
      // Sync UI state before showing
      chrome.storage.local.get(
        {
          themeSettings: {
            themeColor: "minimal-blue",
            colorScheme: "system",
          },
        },
        (res) => {
          const settings = res.themeSettings;

          // Sync Theme Swatch
          updateActiveSwatch(settings.themeColor);

          // Sync Color Scheme
          const colorSchemeSelect = document.getElementById(
            "color-scheme-select",
          );
          if (colorSchemeSelect)
            colorSchemeSelect.value = settings.colorScheme || "system";

          settingsModal.classList.remove("hidden");
          // Trigger transition
          settingsModal.classList.add("fade-out");
          requestAnimationFrame(() => {
            settingsModal.classList.remove("fade-out");
          });
        },
      );
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", () => {
      settingsModal.classList.add("fade-out");
      setTimeout(() => {
        settingsModal.classList.add("hidden");
        settingsModal.classList.remove("fade-out");
      }, 250); // Matches transition-speed
    });
  }

  // Close on backdrop click
  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.add("fade-out");
        setTimeout(() => {
          settingsModal.classList.add("hidden");
          settingsModal.classList.remove("fade-out");
        }, 250);
      }
    });
  }

  // Color Scheme Listener
  const colorSchemeSelect = document.getElementById("color-scheme-select");
  if (colorSchemeSelect) {
    colorSchemeSelect.addEventListener("change", () => {
      updateThemeSettings({ colorScheme: colorSchemeSelect.value });
    });
  }

  // Theme Logic
  await applyTheme();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.themeSettings) {
      applyTheme();
    }
  });
});

async function updateThemeSettings(partialSettings) {
  const res = await chrome.storage.local.get({
    themeSettings: { themeColor: "minimal-blue", colorScheme: "system" },
  });
  const newSettings = { ...res.themeSettings, ...partialSettings };
  await chrome.storage.local.set({ themeSettings: newSettings });
}

async function applyTheme() {
  const res = await chrome.storage.local.get({
    themeSettings: {
      themeColor: "minimal-blue",
      colorScheme: "system",
    },
  });
  const settings = res.themeSettings;

  // Color Scheme (Light/Dark Mode)
  const colorScheme = settings.colorScheme || "system";
  const root = document.documentElement;

  if (colorScheme === "light") {
    root.classList.add("force-light");
    root.classList.remove("force-dark");
  } else if (colorScheme === "dark") {
    root.classList.add("force-dark");
    root.classList.remove("force-light");
  } else {
    // system - remove both classes to use media query
    root.classList.remove("force-light", "force-dark");
  }

  // Force dark mode for AMOLED theme
  if (settings.themeColor === 'minimal-amoled') {
    root.classList.add('force-dark');
    root.classList.remove('force-light');
  }

  // Always use flat/no-mesh for pastel themes
  document.body.classList.add("no-mesh");
  document.body.classList.add("flat-tabs");

  // Color Theme - Remove all theme classes
  document.body.classList.remove(
    "theme-minimal-blue",
    "theme-minimal-slate",
    "theme-minimal-sage",
    "theme-minimal-rose",
    "theme-minimal-amber",
    "theme-minimal-indigo",
    "theme-minimal-teal",
    "theme-minimal-charcoal",
    "theme-minimal-amoled",
  );

  // Apply the selected theme
  if (settings.themeColor) {
    document.body.classList.add(`theme-${settings.themeColor}`);
  }
}

// --- Core Data Fetching ---

async function fetchAndRenderTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });

  // Fetch all groups in current window
  const groups = await chrome.tabGroups.query({
    windowId: chrome.windows.WINDOW_ID_CURRENT,
  });
  const groupsMap = new Map();
  groups.forEach((g) => groupsMap.set(g.id, g));

  const { groupBuckets } = buildTree(tabs, groupsMap);
  renderTree(groupsMap, groupBuckets);
}

/**
 * Builds the tree structure from a flat list of tabs.
 * Uses openerTabId to determine hierarchy.
 */
/**
 * Builds the tree structure.
 * Structure:
 * - rootTabs (Tabs with no parent AND no group)
 * - groupBuckets (Map<groupId, Array<tabId>>) -> Logic: Group acts as a root, Tree inside Group.
 */
function buildTree(tabs, groupsMap) {
  tabsMap.clear();
  rootTabs = [];
  const groupBuckets = new Map();

  // Initialize buckets for known groups
  for (const groupId of groupsMap.keys()) {
    groupBuckets.set(groupId, []);
  }

  // First pass: Index tabs
  tabs.forEach((tab) => tabsMap.set(tab.id, { ...tab, children: [] }));

  // Second pass: Build parent-child relationships
  // Note: If a child is in a different group than parent, visual hierarchy breaks visually.
  // For specific requirement: "Grouped" tabs show in panel.
  // We will enforce: If in a Group, display in that Group.
  // Inside the group, we try to nesting if standard logic applies AND both are in same group.

  let overridesChanged = false;

  tabs.forEach((tab) => {
    const inGroup = tab.groupId !== -1;

    const effectiveUrl = tab.pendingUrl || tab.url;
    const isNewTab =
      effectiveUrl === "chrome://newtab/" || effectiveUrl === "edge://newtab/";

    // If explicitly root in overrides?
    let parentId = parentOverrides.get(tab.id);

    if (parentId === undefined) {
      // No override.
      // PRIORITY 1: Is it a New Tab? -> Force Root.
      if (isNewTab) {
        parentOverrides.set(tab.id, -1); // Explicit Root
        overridesChanged = true;
        parentId = -1;
      }
      // PRIORITY 2: Has Opener? -> Force Parent.
      else if (tab.openerTabId) {
        // Found an implicit parent! Crystallize it.
        if (tabsMap.has(tab.openerTabId)) {
          parentId = tab.openerTabId;
          parentOverrides.set(tab.id, parentId);
          overridesChanged = true;
        }
      }
    }

    // Normalize -1 to null for logic
    if (parentId === -1) parentId = null;

    let placed = false;

    // Try to nest under a parent
    if (parentId && tabsMap.has(parentId)) {
      const parent = tabsMap.get(parentId);

      // strict allow nesting
      if (parent.groupId === tab.groupId) {
        // Basic cycle prevention
        const parentsParentId =
          parentOverrides.get(parentId) || parent.openerTabId;
        if (parentsParentId !== tab.id) {
          parent.children.push(tab.id);
          placed = true;
        }
      }
    }

    if (!placed) {
      if (inGroup) {
        if (!groupBuckets.has(tab.groupId)) groupBuckets.set(tab.groupId, []); // Should exist from init but just in case
        groupBuckets.get(tab.groupId).push(tab.id);
      } else {
        rootTabs.push(tab.id);
      }
    }
  });

  if (overridesChanged) {
    saveParentOverrides();
  }

  // Sort roots & buckets
  const sortFn = (a, b) => tabsMap.get(a).index - tabsMap.get(b).index;
  rootTabs.sort(sortFn);

  for (const [gid, roots] of groupBuckets) {
    roots.sort(sortFn);
  }

  return { groupBuckets };
}

// --- Rendering ---

// --- Rendering ---

function renderTree(groupsMap, groupBuckets = new Map()) {
  tabsListEl.innerHTML = "";

  // Filtered mode? (If searching)
  const filterText = searchInput ? searchInput.value : "";
  if (filterText) {
    renderFilteredList(filterText);
    return;
  }

  // 1. We need to respect the visual order of items (Groups vs Tabs mixed)
  // Chrome tabs have an 'index'. Groups don't have a single index, but they span a range.
  // For simplicity: We can iterate through 'Root Tabs' and 'Groups' by finding their min-index.

  const elements = [];

  // Add individual Root Tabs
  rootTabs.forEach((tabId) => {
    elements.push({
      type: "tab",
      index: tabsMap.get(tabId).index,
      id: tabId,
    });
  });

  // Add Groups
  if (groupsMap) {
    for (const [groupId, group] of groupsMap) {
      // Use the group's first tab index effectively?
      // Chrome.tabGroups doesn't give 'index'. It relies on tabs.
      // We can assume group connects to its tabs.
      // We take the index of the first tab in the bucket (if any)
      const bucket = groupBuckets.get(groupId);
      if (bucket && bucket.length > 0) {
        const firstTab = tabsMap.get(bucket[0]);
        elements.push({
          type: "group",
          index: firstTab ? firstTab.index : 9999, // Fallback
          id: groupId,
          group: group,
          children: bucket,
        });
      }
    }
  }

  // Sort all by visual index
  elements.sort((a, b) => a.index - b.index);

  // Render
  elements.forEach((el) => {
    if (el.type === "tab") {
      tabsListEl.appendChild(createTabNode(el.id));
    } else {
      tabsListEl.appendChild(createGroupNode(el.group, el.children));
    }
  });

  // Auto-scroll logic
  // Priority: Explicit pending scroll (New Tab)
  if (pendingScrollTabId) {
    const newTabNode = tabsListEl.querySelector(
      `.tab-tree-node[data-tab-id="${pendingScrollTabId}"]`,
    );
    if (newTabNode) {
      const row = newTabNode.querySelector(".tab-item");
      if (row) {
        setTimeout(() => {
          row.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 10);
      }
    }
    pendingScrollTabId = null;
  } else if (isInitialRender) {
    // Only auto-scroll to active tab on pure startup to avoid jumping during browsing
    const activeTabEl = tabsListEl.querySelector(".tab-item.active");
    if (activeTabEl) {
      setTimeout(() => {
        activeTabEl.scrollIntoView({ behavior: "auto", block: "nearest" });
      }, 10);
    }
    isInitialRender = false;
  }
}

function createGroupNode(group, bucketTabIds) {
  const container = document.createElement("div");
  container.className = "group-node";
  let isGroupCollapsed = group.collapsed;

  // Header
  const header = document.createElement("div");
  header.className = "group-header";
  header.style.setProperty("--group-color", mapColor(group.color));

  // Expand Arrow
  const arrow = document.createElement("div");
  arrow.className = `expand-arrow ${group.collapsed ? "" : "rotated"}`; // rotated = expanded
  arrow.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  header.appendChild(arrow);

  // Colors dot or line
  const dot = document.createElement("div");
  dot.className = "group-dot";
  header.appendChild(dot);

  const title = document.createElement("span");
  title.className = "group-title";
  title.textContent = group.title || "Untitled Group";
  header.appendChild(title);

  container.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = `group-body ${isGroupCollapsed ? "collapsed" : ""}`;

  const renderGroupChildren = () => {
    body.innerHTML = "";
    if (isGroupCollapsed) {
      return;
    }

    bucketTabIds.forEach((tabId) => {
      body.appendChild(createTabNode(tabId, 1));
    });
  };

  const syncGroupUI = (collapsed) => {
    isGroupCollapsed = collapsed;
    arrow.classList.toggle("rotated", !collapsed);
    body.classList.toggle("collapsed", collapsed);
    renderGroupChildren();
  };

  // Click to toggle the native group, but update the panel immediately.
  header.addEventListener("click", async () => {
    if (draggedTabId) return;

    const nextCollapsed = !isGroupCollapsed;

    try {
      const updatedGroup = await chrome.tabGroups.update(group.id, {
        collapsed: nextCollapsed,
      });
      syncGroupUI(updatedGroup.collapsed);
      fetchAndRenderTabs();
    } catch (e) {
      console.error("Failed to toggle group", e);
    }
  });

  // Optimization: don't render children for collapsed groups until expanded.
  renderGroupChildren();

  container.appendChild(body);
  return container;
}

function mapColor(chromeColor) {
  const colors = {
    grey: "#bdc1c6",
    blue: "#8ab4f8",
    red: "#f28b82",
    yellow: "#fdd663",
    green: "#81c995",
    pink: "#ff8bcb",
    purple: "#c58af9",
    cyan: "#78d9ec",
    orange: "#fcad70",
  };
  return colors[chromeColor] || "#bdc1c6";
}

function createTabNode(tabId, depth = 0) {
  const tab = tabsMap.get(tabId);
  if (!tab) return document.createElement("div");

  const container = document.createElement("div");
  container.className = "tab-tree-node";
  container.dataset.tabId = tabId;
  container.dataset.depth = depth; // For CSS tree guide lines
  container.draggable = true;

  // 1. Remote Tab Item (The visible row)
  const hasChildren = tab.children && tab.children.length > 0;
  const row = document.createElement("div");
  row.className = `tab-item ${tab.active ? "active" : ""} ${hasChildren ? "group-root" : ""}`;
  row.draggable = false;

  // Indentation Logic - pull parent rows slightly left and step children further right.
  row.style.paddingLeft = hasChildren ? "6px" : "8px";
  row.style.setProperty("--tab-depth", depth);
  if (depth > 0) {
    row.style.marginLeft = `${depth * 36}px`;
  } else if (hasChildren) {
    row.style.marginLeft = "-4px";
  }

  // Drag Events
  container.addEventListener("dragstart", handleDragStart);
  row.addEventListener("dragover", handleDragOver);
  row.addEventListener("drop", handleDrop);
  container.addEventListener("dragend", handleDragEnd);
  row.addEventListener("click", (e) => {
    if (Date.now() < suppressRowClickUntil) {
      suppressRowClickUntil = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Handle multi-select with Ctrl/Cmd+Click
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();

      if (selectedTabs.has(tabId)) {
        selectedTabs.delete(tabId);
        container.classList.remove("selected");
      } else {
        selectedTabs.add(tabId);
        container.classList.add("selected");
      }
      lastClickedTabId = tabId; // Remember for shift-select
      if (window.updateSelectionToolbar) window.updateSelectionToolbar();
      return;
    }

    // Handle shift-click for range selection
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();

      const allVisibleTabs = Array.from(
        tabsListEl.querySelectorAll(".tab-tree-node"),
      )
        .map((node) => Number(node.dataset.tabId))
        .filter((id) => !isNaN(id));

      let lastSelectedId;

      // Use last clicked tab as anchor, or find a sensible default
      if (lastClickedTabId && allVisibleTabs.includes(lastClickedTabId)) {
        lastSelectedId = lastClickedTabId;
      } else if (selectedTabs.size > 0) {
        lastSelectedId = Array.from(selectedTabs).pop();
      } else {
        // No anchor yet - use active tab or first visible tab
        const activeTab = Array.from(tabsMap.values()).find((t) => t.active);
        if (activeTab && allVisibleTabs.includes(activeTab.id)) {
          lastSelectedId = activeTab.id;
          selectedTabs.add(lastSelectedId);
        } else {
          lastSelectedId = allVisibleTabs[0];
        }
      }

      const currentIndex = allVisibleTabs.indexOf(tabId);
      const lastIndex = allVisibleTabs.indexOf(lastSelectedId);

      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);

        for (let i = start; i <= end; i++) {
          const id = allVisibleTabs[i];
          selectedTabs.add(id);
          const node = tabsListEl.querySelector(`[data-tab-id="${id}"]`);
          if (node) node.classList.add("selected");
        }
      }
      if (window.updateSelectionToolbar) window.updateSelectionToolbar();
      return;
    }

    // Normal click - clear selection and activate tab
    selectedTabs.clear();
    lastClickedTabId = tabId; // Remember for future shift-select
    document.querySelectorAll(".tab-tree-node.selected").forEach((el) => {
      el.classList.remove("selected");
    });
    if (window.updateSelectionToolbar) window.updateSelectionToolbar();
    chrome.tabs.update(tabId, { active: true });
  });

  // Middle Click to Close
  // Using mousedown instead of auxclick to prevent browser's autoscroll
  row.addEventListener("mousedown", (e) => {
    if (e.button === 1) {
      // Middle Mouse Button
      e.stopPropagation();
      e.preventDefault();

      // If this tab is selected and there are multiple selections, close all selected tabs
      if (selectedTabs.has(tabId) && selectedTabs.size > 1) {
        chrome.tabs.remove(Array.from(selectedTabs));
        selectedTabs.clear();
        if (window.updateSelectionToolbar) window.updateSelectionToolbar();
      } else {
        chrome.tabs.remove(tabId);
      }
    }
  });

  // 2. Expand/Collapse Arrow
  const arrow = document.createElement("div");
  arrow.className = `expand-arrow ${hasChildren ? "" : "hidden"}`;
  arrow.draggable = false;
  // Initialize rotation based on collapsed state
  const isCollapsed = collapsedState.has(tabId);
  if (!isCollapsed && hasChildren) {
    arrow.classList.add("rotated"); // Rotated means expanded (down)
  }

  arrow.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

  arrow.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCollapse(tabId);
  });
  row.appendChild(arrow);

  // 3. Favicon
  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.draggable = false;
  favicon.src = getFaviconUrl(tab);
  favicon.onerror = () => {
    favicon.src =
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23ccc"><rect width="16" height="16" rx="2"/></svg>';
  };
  row.appendChild(favicon);

  // 4. Title
  const title = document.createElement("span");
  title.className = "tab-title";
  title.draggable = false;
  title.textContent = customTitles.get(tabId) || tab.title;
  title.title = "Double-click to rename"; // Tooltip hint

  // Rename Logic
  title.ondblclick = (e) => {
    e.stopPropagation();
    activateRenameMode(tabId);
  };

  row.appendChild(title);

  if (isSuspendedTab(tab)) {
    const suspendedBadge = document.createElement("span");
    suspendedBadge.className = "suspended-badge";
    suspendedBadge.textContent = "Zzz";
    suspendedBadge.title = tab?.discarded
      ? "Suspended by Chrome Memory Saver"
      : "Suspended by The Marvellous Suspender";
    row.appendChild(suspendedBadge);
  }

  // Context Menu
  row.addEventListener("contextmenu", (e) => {
    showContextMenu(e, tabId);
  });

  // 5. Close Button
  const closeBtn = document.createElement("div");
  closeBtn.className = "close-btn";
  closeBtn.draggable = false;
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent activation

    // If this tab is selected and there are multiple selections, close all selected tabs
    if (selectedTabs.has(tabId) && selectedTabs.size > 1) {
      chrome.tabs.remove(Array.from(selectedTabs));
      selectedTabs.clear();
      if (window.updateSelectionToolbar) window.updateSelectionToolbar();
    } else {
      chrome.tabs.remove(tabId);
    }
  });
  row.appendChild(closeBtn);

  container.appendChild(row);

  // Mark as selected if in selection set
  if (selectedTabs.has(tabId)) {
    container.classList.add("selected");
  }

  // 6. Children Container
  if (hasChildren) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = `tab-children ${isCollapsed ? "collapsed" : ""}`;

    tab.children.forEach((childId) => {
      const childNode = createTabNode(childId, depth + 1);
      childrenContainer.appendChild(childNode);
    });
    container.appendChild(childrenContainer);
  }

  return container;
}

function renderFilteredList(text) {
  const term = text.toLowerCase();
  for (let [id, tab] of tabsMap) {
    if (
      tab.title.toLowerCase().includes(term) ||
      tab.url.toLowerCase().includes(term)
    ) {
      // Render simplified node (no children/indentation for search results)
      // Or render logic to show path. For simplicity, flat list:
      const row = createTabNode(id); // Reusing usage, but children might look weird
      // To properly handle flat search, we might hide children styling
      tabsListEl.appendChild(row);
    }
  }
}

// --- Logic ---

async function toggleCollapse(tabId) {
  if (collapsedState.has(tabId)) {
    collapsedState.delete(tabId);
  } else {
    collapsedState.add(tabId);
  }
  await saveCollapsedState();
  fetchAndRenderTabs(); // Re-render to update UI
}

function handleSearch(e) {
  const val = e.target.value;
  renderTree(val);
}

// --- Event Handlers ---
// For group updates
chrome.tabGroups.onUpdated.addListener(scheduleRender);
chrome.tabGroups.onCreated.addListener(scheduleRender);
chrome.tabGroups.onRemoved.addListener(scheduleRender);
chrome.tabGroups.onMoved.addListener(scheduleRender);

// Debounce rendering to avoid flickering on rapid updates
let renderTimeout;
function scheduleRender() {
  if (draggedTabId) {
    pendingRenderAfterDrag = true;
    return;
  }

  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    renderTimeout = null;
    if (draggedTabId) {
      pendingRenderAfterDrag = true;
      return;
    }
    fetchAndRenderTabs();
  }, 50); // Small buffer
}

function onTabCreated(tab) {
  pendingScrollTabId = tab.id;
  scheduleRender();
}
async function onTabRemoved(tabId, removeInfo) {
  // Orphan Adoption Logic:
  // When a tab is removed, its children should move up to its parent (Grandparent adoption)
  // We use tabsMap because it represents the STATE BEFORE THIS REMOVAL (mostly).

  const node = tabsMap.get(tabId);
  if (node && node.children && node.children.length > 0) {
    // Find Grandparent
    let grandparent = parentOverrides.get(tabId);
    if (grandparent === undefined) grandparent = node.openerTabId; // Fallback if not saved yet
    if (grandparent === -1) grandparent = null; // Was root

    // If grandparent is also bad/missing (e.g. bulk close), we might default to Root (-1)

    const newParentVal =
      grandparent && tabsMap.has(grandparent) ? grandparent : -1;

    for (const childId of node.children) {
      parentOverrides.set(childId, newParentVal);
    }
    await saveParentOverrides();
  }

  scheduleRender();
}
function onTabMoved() {
  scheduleRender();
}

function onTabActivated() {
  scheduleRender();
}

function onTabUpdated() {
  scheduleRender();
}

function onTabAttached() {
  scheduleRender();
}

function onTabDetached() {
  scheduleRender();
}

// --- Persistence ---

async function loadCollapsedState() {
  const res = await chrome.storage.local.get("collapsedState");
  if (res.collapsedState) {
    collapsedState = new Set(res.collapsedState);
  }
}

async function saveCollapsedState() {
  await chrome.storage.local.set({
    collapsedState: Array.from(collapsedState),
  });
}

async function loadCustomTitles() {
  const res = await chrome.storage.local.get("customTitles");
  if (res.customTitles) {
    // Convert object back to map. Keys stored as strings in JSON.
    customTitles = new Map(
      Object.entries(res.customTitles).map(([k, v]) => [Number(k), v]),
    );
  }
}

async function saveCustomTitles() {
  await chrome.storage.local.set({
    customTitles: Object.fromEntries(customTitles),
  });
}

// --- Icon Logic ---

function getMarvelousSuspendersOriginalUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const isMarvelousSuspendersPage =
      parsedUrl.protocol === "chrome-extension:" &&
      parsedUrl.pathname.endsWith("/suspended.html");

    if (!isMarvelousSuspendersPage || !parsedUrl.hash) {
      return null;
    }

    const hashParams = new URLSearchParams(parsedUrl.hash.slice(1));
    const originalUrl = hashParams.get("uri");
    if (!originalUrl) {
      return null;
    }

    return decodeURIComponent(originalUrl);
  } catch (error) {
    return null;
  }
}

function resolveOriginalPageUrl(rawUrl) {
  return getMarvelousSuspendersOriginalUrl(rawUrl) || rawUrl;
}

function isSuspendedTab(tab) {
  if (tab?.discarded) {
    return true;
  }

  const rawUrl = tab?.pendingUrl || tab?.url || "";
  return Boolean(getMarvelousSuspendersOriginalUrl(rawUrl));
}

function getFaviconUrl(tab) {
  const rawUrl = resolveOriginalPageUrl(tab?.pendingUrl || tab?.url || "");
  if (!rawUrl) {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23ccc"><rect width="16" height="16" rx="2"/></svg>';
  }

  // 1. Handle chrome:// and edge:// internal pages
  if (rawUrl.startsWith("chrome://") || rawUrl.startsWith("edge://")) {
    const url = new URL(rawUrl);
    const hostname = url.hostname;

    // Common System Icons (SVG Data URIs)
    const icons = {
      settings:
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%235f6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>', // Gear
      extensions:
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%235f6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 6c-2.6 0-2.7-4-5.8-4s-3.2 4-5.8 4c0 2.6-4 2.7-4 5.8s4 3.2 4 5.8c2.6 0 2.7 4 5.8 4s3.2-4 5.8-4c0-2.6 4-2.7 4-5.8s-4-3.2-4-5.8z"></path></svg>', // Puzzle
      history:
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%235f6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>', // Clock
      downloads:
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%235f6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>', // Arrow Down
      newtab:
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%235f6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>', // Plus (but usually overridden by extension)
    };

    if (icons[hostname]) {
      return icons[hostname];
    }

    // Default Chrome Logo (Simplified Colorful Circle)
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="%235f6368" stroke-width="2"/></svg>';
  }

  // 2. Use Chrome's cached favicon service (Robust for extensions and standard sites)
  // This requires 'favicon' permission in manifest.
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", rawUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

// --- Drag & Drop ---

let draggedTabId = null;
let draggedNode = null;
let draggedRow = null;
let currentDropTarget = null;
let suppressRowClickUntil = 0;
let hoverNestTargetId = null;
let hoverNestTimer = null;
let hoverNestActive = false;

function clearDropIndicator() {
  document.querySelectorAll(".tab-item.drop-above, .tab-item.drop-below, .tab-item.drop-nest").forEach((el) => {
    el.classList.remove("drop-above", "drop-below", "drop-nest");
  });
}

function resetHoverNestState() {
  if (hoverNestTimer) {
    clearTimeout(hoverNestTimer);
    hoverNestTimer = null;
  }

  hoverNestTargetId = null;
  hoverNestActive = false;

  if (currentDropTarget?.type === "nest") {
    currentDropTarget = null;
  }

  document.querySelectorAll(".tab-item.drop-nest").forEach((el) => {
    el.classList.remove("drop-nest");
  });
}

function startHoverNestTimer(targetTabId) {
  hoverNestTargetId = targetTabId;
  hoverNestActive = false;
  hoverNestTimer = setTimeout(() => {
    hoverNestTimer = null;

    if (!draggedTabId || hoverNestTargetId !== targetTabId) {
      return;
    }

    if (!canNestUnderParent(draggedTabId, targetTabId)) {
      resetHoverNestState();
      return;
    }

    const targetRow = document.querySelector(
      `.tab-tree-node[data-tab-id="${targetTabId}"] > .tab-item`,
    );
    if (!targetRow) {
      resetHoverNestState();
      return;
    }

    clearDropIndicator();
    hoverNestActive = true;
    currentDropTarget = { type: "nest", targetTabId };
    targetRow.classList.add("drop-nest");
  }, 500);
}

function canNestUnderParent(childTabId, parentTabId) {
  if (!childTabId || !parentTabId || childTabId === parentTabId) {
    return false;
  }

  const childTab = tabsMap.get(childTabId);
  const parentTab = tabsMap.get(parentTabId);
  if (!childTab || !parentTab) {
    return false;
  }

  if (childTab.groupId !== parentTab.groupId) {
    return false;
  }

  return !wouldCreateCycle(childTabId, parentTabId);
}

function getSubtreeTabIds(rootTabId, excludedTabId = null) {
  const subtreeTabIds = [];

  function visit(tabId) {
    if (tabId === excludedTabId) {
      return;
    }

    subtreeTabIds.push(tabId);
    const tab = tabsMap.get(tabId);
    if (!tab?.children?.length) {
      return;
    }

    tab.children.forEach((childTabId) => visit(childTabId));
  }

  visit(rootTabId);
  return subtreeTabIds;
}

function getNearestDropTarget(clientY) {
  const rows = Array.from(tabsListEl.querySelectorAll(".tab-tree-node .tab-item"));
  let nearest = null;

  rows.forEach((row) => {
    const node = row.closest(".tab-tree-node");
    if (!node) {
      return;
    }

    const tabId = Number(node.dataset.tabId);
    if (tabId === draggedTabId) {
      return;
    }

    const rect = row.getBoundingClientRect();
    const candidates = [
      {
        row,
        node,
        rect,
        position: "before",
        distance: Math.abs(clientY - rect.top),
      },
      {
        row,
        node,
        rect,
        position: "after",
        distance: Math.abs(clientY - rect.bottom),
      },
    ];

    candidates.forEach((candidate) => {
      if (!nearest || candidate.distance < nearest.distance) {
        nearest = candidate;
      }
    });
  });

  return nearest;
}

function getNearestRow(clientY) {
  const rows = Array.from(tabsListEl.querySelectorAll(".tab-tree-node .tab-item"));
  let nearest = null;

  rows.forEach((row) => {
    const node = row.closest(".tab-tree-node");
    if (!node) {
      return;
    }

    const tabId = Number(node.dataset.tabId);
    if (tabId === draggedTabId) {
      return;
    }

    const rect = row.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - centerY);

    if (!nearest || distance < nearest.distance) {
      nearest = { row, node, rect, distance };
    }
  });

  return nearest;
}

function handleDragStart(e) {
  const container = e.currentTarget;
  const row = container.querySelector(".tab-item");
  if (!container) {
    return;
  }

  draggedTabId = Number(container.dataset.tabId);
  draggedNode = container;
  draggedRow = row;
  currentDropTarget = null;
  resetHoverNestState();

  if (draggedNode) {
    draggedNode.classList.add("dragging");
  }
  if (draggedRow) {
    draggedRow.classList.add("dragging");
  }

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(draggedTabId));
    e.dataTransfer.dropEffect = "move";
  }
}

function handleDragOver(e) {
  if (!draggedTabId) {
    return;
  }

  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }

  clearDropIndicator();
  const hoveredRow = e.target.closest(".tab-item");
  const hoveredNode = hoveredRow?.closest(".tab-tree-node");
  const hoveredTargetTabId = hoveredNode ? Number(hoveredNode.dataset.tabId) : null;
  const hoveredIsValidNest =
    hoveredTargetTabId && canNestUnderParent(draggedTabId, hoveredTargetTabId);

  if (!hoveredIsValidNest) {
    resetHoverNestState();
  } else if (hoverNestTargetId !== hoveredTargetTabId) {
    resetHoverNestState();
    startHoverNestTimer(hoveredTargetTabId);
  } else if (hoverNestActive) {
    currentDropTarget = { type: "nest", targetTabId: hoveredTargetTabId };
    hoveredRow.classList.add("drop-nest");
    return;
  }

  const nearestRow = getNearestRow(e.clientY);
  if (!nearestRow) {
    resetHoverNestState();
    currentDropTarget = null;
    return;
  }

  if (hoverNestActive && hoverNestTargetId === hoveredTargetTabId && hoveredRow) {
    currentDropTarget = { type: "nest", targetTabId: hoveredTargetTabId };
    hoveredRow.classList.add("drop-nest");
    return;
  }

  const nearestTarget = getNearestDropTarget(e.clientY);
  if (!nearestTarget) {
    resetHoverNestState();
    currentDropTarget = null;
    return;
  }

  currentDropTarget = {
    type: "reorder",
    targetTabId: Number(nearestTarget.node.dataset.tabId),
    position: nearestTarget.position,
  };
  nearestTarget.row.classList.add(
    nearestTarget.position === "before" ? "drop-above" : "drop-below",
  );
}

function handleDragEnd() {
  resetHoverNestState();
  clearDropIndicator();
  if (draggedNode) {
    draggedNode.classList.remove("dragging");
  }
  if (draggedRow) {
    draggedRow.classList.remove("dragging");
  }
  suppressRowClickUntil = Date.now() + 250;
  draggedTabId = null;
  draggedNode = null;
  draggedRow = null;
  currentDropTarget = null;

  if (pendingRenderAfterDrag) {
    pendingRenderAfterDrag = false;
    scheduleRender();
  }
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const draggedId = draggedTabId || Number(e.dataTransfer?.getData("text/plain"));
  const dropTarget = currentDropTarget;
  if (!draggedId || !dropTarget) {
    handleDragEnd();
    return;
  }

  const { targetTabId } = dropTarget;

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const orderedTabs = tabs.slice().sort((a, b) => a.index - b.index);
    const draggedTab = orderedTabs.find((tab) => tab.id === draggedId);
    const targetTab = orderedTabs.find((tab) => tab.id === targetTabId);

    if (!draggedTab || !targetTab) {
      return;
    }

    if (dropTarget.type === "nest") {
      if (!canNestUnderParent(draggedId, targetTabId)) {
        return;
      }

      parentOverrides.set(draggedId, targetTabId);
      await saveParentOverrides();

      const targetSubtreeTabIds = getSubtreeTabIds(targetTabId, draggedId);
      const lastTargetSubtreeIndex = targetSubtreeTabIds.reduce((maxIndex, tabId) => {
        const tab = orderedTabs.find((candidate) => candidate.id === tabId);
        return tab ? Math.max(maxIndex, tab.index) : maxIndex;
      }, targetTab.index);

      let destinationIndex = lastTargetSubtreeIndex + 1;
      if (draggedTab.index < destinationIndex) {
        destinationIndex -= 1;
      }

      if (destinationIndex !== draggedTab.index) {
        await chrome.tabs.move(draggedId, { index: destinationIndex });
      }
      await fetchAndRenderTabs();
      return;
    }

    let destinationIndex =
      targetTab.index + (dropTarget.position === "after" ? 1 : 0);
    if (draggedTab.index < destinationIndex) {
      destinationIndex -= 1;
    }

    if (destinationIndex !== draggedTab.index) {
      await chrome.tabs.move(draggedId, { index: destinationIndex });
      await fetchAndRenderTabs();
    }
  } catch (err) {
    console.error("Move failed", err);
  } finally {
    handleDragEnd();
  }
}

// Hierarchy Override for Drag & Drop

async function loadParentOverrides() {
  const res = await chrome.storage.local.get("parentOverrides");
  if (res.parentOverrides) {
    parentOverrides = new Map(
      Object.entries(res.parentOverrides).map(([k, v]) => [Number(k), v]),
    );
  }
}

async function saveParentOverrides() {
  await chrome.storage.local.set({
    parentOverrides: Object.fromEntries(parentOverrides),
  });
}

function getTabParentId(tabId) {
  const overrideParentId = parentOverrides.get(tabId);
  if (overrideParentId !== undefined) {
    return overrideParentId === -1 ? null : overrideParentId;
  }

  const tab = tabsMap.get(tabId);
  return tab?.openerTabId && tabsMap.has(tab.openerTabId) ? tab.openerTabId : null;
}

function wouldCreateCycle(childId, nextParentId) {
  let currentParentId = nextParentId;

  while (currentParentId) {
    if (currentParentId === childId) {
      return true;
    }
    currentParentId = getTabParentId(currentParentId);
  }

  return false;
}

function getNestingCandidates(parentTabId) {
  const parentTab = tabsMap.get(parentTabId);
  if (!parentTab) {
    return [];
  }

  return Array.from(selectedTabs).filter((childTabId) => {
    if (childTabId === parentTabId) {
      return false;
    }

    const childTab = tabsMap.get(childTabId);
    if (!childTab) {
      return false;
    }

    if (childTab.groupId !== parentTab.groupId) {
      return false;
    }

    return !wouldCreateCycle(childTabId, parentTabId);
  });
}

async function nestTabsUnderParent(parentTabId, childTabIds) {
  if (!childTabIds.length) {
    return;
  }

  childTabIds.forEach((childTabId) => {
    parentOverrides.set(childTabId, parentTabId);
  });

  await saveParentOverrides();
  selectedTabs.clear();
  if (window.updateSelectionToolbar) {
    window.updateSelectionToolbar();
  }
  await fetchAndRenderTabs();
}

// --- Bookmarks Logic ---

async function fetchAndRenderBookmarks() {
  const listEl = document.getElementById("bookmarks-list");
  if (!listEl) return;
  listEl.innerHTML = ""; // Clear

  try {
    const tree = await chrome.bookmarks.getTree();
    // tree[0] is the root which contains "Bookmarks Bar", "Other Bookmarks", etc.
    // We usually want to render the children of the root directly to avoid "Root" folder.
    if (tree[0].children) {
      tree[0].children.forEach((node) => {
        listEl.appendChild(createBookmarkNode(node));
      });
    }
  } catch (err) {
    console.error("Failed to load bookmarks", err);
    listEl.innerHTML = `<div style="padding:10px; color:var(--text-secondary);">Error loading bookmarks.</div>`;
  }
}

function createBookmarkNode(node) {
  const isFolder = !node.url;
  const container = document.createElement("div");
  container.className = "bookmark-node";

  const item = document.createElement("div");
  item.className = `bookmark-item ${isFolder ? "bookmark-folder" : ""}`;

  // Icon / Arrow
  if (isFolder) {
    const arrow = document.createElement("div");
    arrow.className = "folder-arrow";
    arrow.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    item.appendChild(arrow);

    const icon = document.createElement("div");
    icon.className = "folder-icon";
    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    item.appendChild(icon);
  } else {
    const favicon = document.createElement("img");
    favicon.className = "bookmark-favicon";
    favicon.src = getFaviconUrl({ url: node.url }); // Reuse existing helper
    favicon.onerror = () => {
      favicon.src =
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="%23ccc"><circle cx="7" cy="7" r="7"/></svg>';
    };
    item.appendChild(favicon);
  }

  const title = document.createElement("span");
  title.className = "bookmark-title";
  title.textContent = node.title || (isFolder ? "Untitled Folder" : "Untitled");
  title.style.overflow = "hidden";
  item.appendChild(title);

  container.appendChild(item);

  // Children
  if (isFolder) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "bookmark-children";
    // Check if we want to expand by default? Maybe only "Bookmarks Bar"?
    // For now start collapsed unless we save state (out of scope for quick task, but better UX).

    // Render children
    if (node.children) {
      node.children.forEach((child) => {
        childrenContainer.appendChild(createBookmarkNode(child));
      });
    }

    container.appendChild(childrenContainer);

    // Events
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const isExpanded = childrenContainer.classList.contains("expanded");
      if (isExpanded) {
        childrenContainer.classList.remove("expanded");
        item.querySelector(".folder-arrow").classList.remove("rotated");
      } else {
        childrenContainer.classList.add("expanded");
        item.querySelector(".folder-arrow").classList.add("rotated");
      }
    });
  } else {
    // Link Event
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const active = e.ctrlKey || e.metaKey ? false : true; // Ctrl+Click = background
      chrome.tabs.create({ url: node.url, active: active });
    });

    item.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        // Middle click bookmarks to open in background
        e.stopPropagation();
        e.preventDefault();
        chrome.tabs.create({ url: node.url, active: false });
      }
    });
  }

  return container;
}

// Refresh Button Listener
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("refresh-bookmarks");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", fetchAndRenderBookmarks);
  }
  // Also listen to bookmark events to auto-update?
  // chrome.bookmarks.onCreated.addListener(fetchAndRenderBookmarks);
  // chrome.bookmarks.onRemoved.addListener(fetchAndRenderBookmarks);
  // chrome.bookmarks.onChanged.addListener(fetchAndRenderBookmarks);
  // chrome.bookmarks.onMoved.addListener(fetchAndRenderBookmarks);
  // For now, static load on init is fine, but adding listeners is strictly better.
  if (chrome.bookmarks) {
    chrome.bookmarks.onCreated.addListener(() => fetchAndRenderBookmarks());
    chrome.bookmarks.onRemoved.addListener(() => fetchAndRenderBookmarks());
    chrome.bookmarks.onChanged.addListener(() => fetchAndRenderBookmarks());
    chrome.bookmarks.onMoved.addListener(() => fetchAndRenderBookmarks());
  }

  // Toggle Bookmarks/Downloads/Groups Logic
  const toggleBookmarksBtn = document.getElementById("toggle-bookmarks-btn");
  const toggleDownloadsBtn = document.getElementById("toggle-downloads-btn");
  const toggleGroupsBtn = document.getElementById("toggle-groups-btn");

  const bookmarksSection = document.getElementById("bookmarks-section");
  const downloadsSection = document.getElementById("downloads-section");
  const groupsSection = document.getElementById("groups-section");
  const divider = document.querySelector(".section-divider");

  // Default to hidden
  if (bookmarksSection) bookmarksSection.classList.add("hidden");
  if (downloadsSection) downloadsSection.classList.add("hidden");
  if (groupsSection) groupsSection.classList.add("hidden");
  if (divider) divider.classList.add("hidden");

  function toggleSection(sectionName) {
    const sections = {
      bookmarks: {
        section: bookmarksSection,
        btn: toggleBookmarksBtn,
        fetch: fetchAndRenderBookmarks,
      },
      downloads: {
        section: downloadsSection,
        btn: toggleDownloadsBtn,
        fetch: fetchAndRenderDownloads,
      },
      groups: {
        section: groupsSection,
        btn: toggleGroupsBtn,
        fetch: fetchAndRenderGroups,
      },
    };

    const target = sections[sectionName];
    if (!target || !target.section) return;

    const isCurrentlyHidden = target.section.classList.contains("hidden");

    if (isCurrentlyHidden) {
      // Hide all other sections (immediately for now to avoid layout mess, or with fade)
      Object.values(sections).forEach((s) => {
        if (s.section && !s.section.classList.contains("hidden")) {
          s.section.classList.add("hidden");
        }
        if (s.btn) s.btn.style.color = "";
      });

      // Show target section
      target.section.classList.remove("hidden");
      target.section.classList.add("fade-out");
      if (divider) divider.classList.remove("hidden");
      target.btn.style.color = "var(--accent-color)";

      // Trigger transition
      requestAnimationFrame(() => {
        target.section.classList.remove("fade-out");
      });

      // Load data
      target.fetch();
    } else {
      // Already open -> close it
      target.section.classList.add("fade-out");
      target.btn.style.color = "";
      setTimeout(() => {
        target.section.classList.add("hidden");
        target.section.classList.remove("fade-out");

        // If no sections are visible, hide divider
        const anyVisible = Object.values(sections).some(s => s.section && !s.section.classList.contains("hidden"));
        if (!anyVisible && divider) divider.classList.add("hidden");
      }, 250);
    }
  }

  if (toggleBookmarksBtn)
    toggleBookmarksBtn.addEventListener("click", () =>
      toggleSection("bookmarks"),
    );
  if (toggleDownloadsBtn)
    toggleDownloadsBtn.addEventListener("click", () =>
      toggleSection("downloads"),
    );
  if (toggleGroupsBtn)
    toggleGroupsBtn.addEventListener("click", () => toggleSection("groups"));

  // Close button event listeners
  const closeBookmarksBtn = document.getElementById("close-bookmarks");
  const closeDownloadsBtn = document.getElementById("close-downloads");
  const closeGroupsBtn = document.getElementById("close-groups");

  if (closeBookmarksBtn) {
    closeBookmarksBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSection("bookmarks");
    });
  }

  if (closeDownloadsBtn) {
    closeDownloadsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSection("downloads");
    });
  }

  if (closeGroupsBtn) {
    closeGroupsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSection("groups");
    });
  }

  // Refresh listener for downloads
  const refreshDlBtn = document.getElementById("refresh-downloads");
  if (refreshDlBtn)
    refreshDlBtn.addEventListener("click", fetchAndRenderDownloads);

  // Refresh listener for groups
  const refreshGroupsBtn = document.getElementById("refresh-groups");
  if (refreshGroupsBtn)
    refreshGroupsBtn.addEventListener("click", fetchAndRenderGroups);

  // Downloads event listeners
  if (chrome.downloads) {
    // Update badge on init
    updateDownloadsBadge();

    // Listen for download changes
    chrome.downloads.onChanged.addListener(handleDownloadChange);
    chrome.downloads.onCreated.addListener(() => {
      updateDownloadsBadge();
      // Refresh downloads list if visible
      if (downloadsSection && !downloadsSection.classList.contains("hidden")) {
        fetchAndRenderDownloads();
      }
    });
  }

  // Search logic for downloads
  const dlSearchInput = document.getElementById("downloads-search");
  if (dlSearchInput) {
    dlSearchInput.addEventListener("input", (e) => {
      fetchAndRenderDownloads(e.target.value);
    });
  }
});

// --- Downloads Logic ---

async function fetchAndRenderDownloads(query = "") {
  // If query is an Event (from click), or not a string, use the search box value
  if (typeof query !== "string") {
    const searchInput = document.getElementById("downloads-search");
    query = searchInput ? searchInput.value : "";
  }

  const listEl = document.getElementById("downloads-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  try {
    const searchOptions = {
      limit: 50,
      orderBy: ["-startTime"],
    };
    if (query && typeof query === "string" && query.trim() !== "") {
      searchOptions.query = [query.trim()];
    }

    const items = await chrome.downloads.search(searchOptions);
    if (items.length === 0) {
      listEl.innerHTML = `<div style="padding:20px; color:var(--text-secondary); text-align:center;">${query ? "No downloads match your search" : "No recent downloads"}</div>`;
      return;
    }

    // Group items by date
    const groups = groupDownloadsByDate(items);

    for (const [dateLabel, groupItems] of Object.entries(groups)) {
      if (groupItems.length === 0) continue;

      const groupHeader = document.createElement("div");
      groupHeader.className = "download-group-header";
      groupHeader.textContent = dateLabel;
      listEl.appendChild(groupHeader);

      for (const item of groupItems) {
        listEl.appendChild(await createDownloadNode(item));
      }
    }
  } catch (err) {
    console.error("Failed to load downloads", err);
    listEl.innerHTML = `<div style="padding:10px; color:var(--text-secondary);">Error loading downloads.</div>`;
  }
}

function groupDownloadsByDate(items) {
  const groups = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  items.forEach(item => {
    const d = new Date(item.startTime);
    const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    let label;
    if (itemDate === today) label = "Today";
    else if (itemDate === yesterday) label = "Yesterday";
    else label = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });

  return groups;
}

async function createDownloadNode(item) {
  const container = document.createElement("div");
  container.className = "download-item";
  container.dataset.downloadId = item.id;

  if (item.state === "in_progress") container.classList.add("in-progress");
  if (item.state === "interrupted") container.classList.add("interrupted");

  // Icon
  const iconWrap = document.createElement("div");
  iconWrap.className = "download-icon";
  try {
    const iconUrl = await chrome.downloads.getFileIcon(item.id, { size: 32 });
    const img = document.createElement("img");
    img.src = iconUrl;
    iconWrap.appendChild(img);
  } catch (e) {
    iconWrap.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
  }
  container.appendChild(iconWrap);

  // Info
  const info = document.createElement("div");
  info.className = "download-info";

  const name = document.createElement("div");
  name.className = "download-title";
  const filename = item.filename ? item.filename.split(/[/\\]/).pop() : (item.url ? item.url.split('/').pop() : "Unknown File");
  name.textContent = filename || "Download";
  name.title = item.filename || item.url;
  name.onclick = (e) => {
    e.stopPropagation();
    if (item.state === "complete") chrome.downloads.open(item.id);
  };
  info.appendChild(name);

  const url = document.createElement("div");
  url.className = "download-url";
  url.textContent = item.url;
  info.appendChild(url);

  const meta = document.createElement("div");
  meta.className = "download-meta";

  let statusText = "";
  if (item.state === "in_progress") {
    const received = formatBytes(item.bytesReceived || 0);
    const total = item.totalBytes ? formatBytes(item.totalBytes) : "?";
    statusText = `<span class="download-status-text in_progress">${received} / ${total}</span>`;
  } else if (item.state === "complete") {
    const size = formatBytes(item.fileSize || item.totalBytes);
    statusText = `<span class="download-status-text complete">${size} • Complete</span>`;
  } else if (item.state === "interrupted") {
    statusText = `<span class="download-status-text interrupted">Interrupted</span>`;
  }
  meta.innerHTML = statusText;
  info.appendChild(meta);

  // Progress bar
  if (item.state === "in_progress" && item.totalBytes) {
    const progressContainer = document.createElement("div");
    progressContainer.className = "download-progress";
    const progressBar = document.createElement("div");
    progressBar.className = "download-progress-bar";
    const percent = Math.round((item.bytesReceived / item.totalBytes) * 100);
    progressBar.style.width = `${percent}%`;
    progressContainer.appendChild(progressBar);
    info.appendChild(progressContainer);
  }

  container.appendChild(info);

  // Actions
  const actions = document.createElement("div");
  actions.className = "download-actions";

  // Show in Folder
  const folderBtn = document.createElement("button");
  folderBtn.className = "download-action-btn";
  folderBtn.title = "Show in Folder";
  folderBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  folderBtn.onclick = (e) => {
    e.stopPropagation();
    chrome.downloads.show(item.id);
  };
  actions.appendChild(folderBtn);

  // Copy Link
  const copyBtn = document.createElement("button");
  copyBtn.className = "download-action-btn";
  copyBtn.title = "Copy Download Link";
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.url);
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="green" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => copyBtn.innerHTML = original, 2000);
  };
  actions.appendChild(copyBtn);

  // Remove from list
  const removeBtn = document.createElement("button");
  removeBtn.className = "download-action-btn remove-btn";
  removeBtn.title = "Remove from List";
  removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    chrome.downloads.erase({ id: item.id }, () => fetchAndRenderDownloads());
  };
  actions.appendChild(removeBtn);

  container.appendChild(actions);

  return container;
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Update the downloads badge counter
async function updateDownloadsBadge() {
  try {
    const items = await chrome.downloads.search({ state: "in_progress" });
    const badge = document.getElementById("downloads-badge");

    if (!badge) return;

    const count = items.length;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (err) {
    console.error("Failed to update downloads badge", err);
  }
}

// Handle download change events
async function handleDownloadChange(delta) {
  console.log("Download change:", delta); // Debug log

  // Update badge counter
  updateDownloadsBadge();

  // Always fetch the latest download info
  try {
    const results = await chrome.downloads.search({ id: delta.id });
    if (results.length === 0) return;
    const item = results[0];

    // If downloads section is visible, update the specific download item
    const downloadsSection = document.getElementById("downloads-section");
    if (!downloadsSection || downloadsSection.classList.contains("hidden"))
      return;

    const downloadItem = document.querySelector(
      `[data-download-id="${delta.id}"]`,
    );
    if (!downloadItem) {
      // Item not in current view, refresh entire list
      fetchAndRenderDownloads();
      return;
    }

    // Update progress bar
    const progressBar = downloadItem.querySelector(".download-progress-bar");
    if (progressBar && item.totalBytes && item.state === "in_progress") {
      const percent = Math.round((item.bytesReceived / item.totalBytes) * 100);
      progressBar.style.width = `${percent}%`;
    }

    // Update meta text
    const meta = downloadItem.querySelector(".download-meta span");
    if (meta && item.state === "in_progress") {
      const received = formatBytes(item.bytesReceived || 0);
      const total = item.totalBytes ? formatBytes(item.totalBytes) : "?";
      const percent = item.totalBytes
        ? Math.round((item.bytesReceived / item.totalBytes) * 100)
        : 0;
      meta.textContent = `${received} / ${total} (${percent}%)`;
    }

    // If state changed to complete or interrupted, refresh the list
    if (
      delta.state &&
      (delta.state.current === "complete" ||
        delta.state.current === "interrupted")
    ) {
      fetchAndRenderDownloads();
    }
  } catch (err) {
    console.error("Error handling download change:", err);
  }
}

// --- Tab Groups Management Logic ---

async function fetchAndRenderGroups() {
  const listEl = document.getElementById("groups-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  try {
    const groups = await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });

    if (groups.length === 0) {
      listEl.innerHTML = `<div style="padding:10px; color:var(--text-secondary); text-align:center;">No tab groups</div>`;
      return;
    }

    // Get all tabs to count tabs per group
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabsByGroup = new Map();

    tabs.forEach((tab) => {
      if (tab.groupId !== -1) {
        if (!tabsByGroup.has(tab.groupId)) {
          tabsByGroup.set(tab.groupId, []);
        }
        tabsByGroup.get(tab.groupId).push(tab);
      }
    });

    groups.forEach((group) => {
      const groupTabs = tabsByGroup.get(group.id) || [];
      listEl.appendChild(createGroupManagementNode(group, groupTabs));
    });
  } catch (err) {
    console.error("Failed to load tab groups", err);
    listEl.innerHTML = `<div style="padding:10px; color:var(--text-secondary);">Error loading tab groups.</div>`;
  }
}

function createGroupManagementNode(group, tabs) {
  const container = document.createElement("div");
  container.className = "group-management-item";

  // Group Header
  const header = document.createElement("div");
  header.className = "group-management-header";

  // Color indicator
  const colorDot = document.createElement("div");
  colorDot.className = "group-color-dot";
  colorDot.style.backgroundColor = mapColor(group.color);
  header.appendChild(colorDot);

  // Group info
  const info = document.createElement("div");
  info.className = "group-management-info";

  const title = document.createElement("div");
  title.className = "group-management-title";
  title.textContent = group.title || "Untitled Group";
  info.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "group-management-meta";
  meta.textContent = `${tabs.length} tab${tabs.length !== 1 ? "s" : ""} • ${group.collapsed ? "Collapsed" : "Expanded"}`;
  info.appendChild(meta);

  header.appendChild(info);

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "group-management-actions";

  // Collapse/Expand button
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "group-action-btn";
  toggleBtn.title = group.collapsed ? "Expand Group" : "Collapse Group";
  toggleBtn.innerHTML = group.collapsed
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  toggleBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
      fetchAndRenderTabs();
      fetchAndRenderGroups();
    } catch (err) {
      console.error("Failed to toggle group", err);
    }
  });
  actions.appendChild(toggleBtn);

  // Rename button
  const renameBtn = document.createElement("button");
  renameBtn.className = "group-action-btn";
  renameBtn.title = "Rename Group";
  renameBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>';
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showRenameDialog(group);
  });
  actions.appendChild(renameBtn);

  // Color picker button
  const colorBtn = document.createElement("button");
  colorBtn.className = "group-action-btn";
  colorBtn.title = "Change Color";
  colorBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"></path></svg>';
  colorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showColorPicker(group);
  });
  actions.appendChild(colorBtn);

  // Ungroup button
  const ungroupBtn = document.createElement("button");
  ungroupBtn.className = "group-action-btn";
  ungroupBtn.title = "Ungroup Tabs";
  ungroupBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  ungroupBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const tabIds = tabs.map((t) => t.id);
      await chrome.tabs.ungroup(tabIds);
      fetchAndRenderTabs();
      fetchAndRenderGroups();
    } catch (err) {
      console.error("Failed to ungroup", err);
    }
  });
  actions.appendChild(ungroupBtn);

  header.appendChild(actions);
  container.appendChild(header);

  // Click on header to show tabs in the group
  header.addEventListener("click", () => {
    const existingList = container.querySelector(".group-tabs-list");
    if (existingList) {
      existingList.remove();
    } else {
      const tabsList = document.createElement("div");
      tabsList.className = "group-tabs-list";
      tabs.forEach((tab) => {
        const tabItem = document.createElement("div");
        tabItem.className = "group-tab-item";

        const favicon = document.createElement("img");
        favicon.className = "tab-favicon";
        favicon.src = getFaviconUrl(tab);
        favicon.onerror = () => {
          favicon.src =
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23ccc"><rect width="16" height="16" rx="2"/></svg>';
        };
        tabItem.appendChild(favicon);

        const tabTitle = document.createElement("span");
        tabTitle.className = "group-tab-title";
        tabTitle.textContent = tab.title;
        tabItem.appendChild(tabTitle);

        tabItem.addEventListener("click", () => {
          chrome.tabs.update(tab.id, { active: true });
        });

        // Using mousedown instead of auxclick to prevent browser's autoscroll
        tabItem.addEventListener("mousedown", (e) => {
          if (e.button === 1) {
            e.stopPropagation();
            e.preventDefault();

            // Consistent multi-selection close logic if applicable here too
            // Note: Groups management might not have the same selectedTabs logic as the main tree,
            // but for consistency we use the simple remove if it's not selected in the main tree.
            if (selectedTabs.has(tab.id) && selectedTabs.size > 1) {
              chrome.tabs.remove(Array.from(selectedTabs));
              selectedTabs.clear();
              if (window.updateSelectionToolbar) window.updateSelectionToolbar();
            } else {
              chrome.tabs.remove(tab.id);
            }
            fetchAndRenderGroups(); // Refresh list after closing
          }
        });

        tabsList.appendChild(tabItem);
      });
      container.appendChild(tabsList);
    }
  });

  return container;
}

function showRenameDialog(group) {
  const newTitle = prompt("Enter new group name:", group.title || "");
  if (newTitle !== null) {
    chrome.tabGroups
      .update(group.id, { title: newTitle })
      .then(() => {
        fetchAndRenderTabs();
        fetchAndRenderGroups();
      })
      .catch((err) => console.error("Failed to rename group", err));
  }
}

let currentGroupForColorPicker = null;

function showColorPicker(group) {
  currentGroupForColorPicker = group;
  const modal = document.getElementById("color-picker-modal");
  const grid = document.getElementById("color-picker-grid");

  if (!modal || !grid) return;

  const colors = [
    { id: "grey", name: "Grey", color: "#bdc1c6" },
    { id: "blue", name: "Blue", color: "#8ab4f8" },
    { id: "red", name: "Red", color: "#f28b82" },
    { id: "yellow", name: "Yellow", color: "#fdd663" },
    { id: "green", name: "Green", color: "#81c995" },
    { id: "pink", name: "Pink", color: "#ff8bcb" },
    { id: "purple", name: "Purple", color: "#c58af9" },
    { id: "cyan", name: "Cyan", color: "#78d9ec" },
    { id: "orange", name: "Orange", color: "#fcad70" },
  ];

  grid.innerHTML = "";
  colors.forEach((color) => {
    const option = document.createElement("button");
    option.className = "color-option";
    option.style.background = color.color;
    option.innerHTML = `<span class="color-option-name">${color.name}</span>`;
    option.addEventListener("click", () => {
      selectGroupColor(color.id);
    });
    grid.appendChild(option);
  });

  modal.classList.remove("hidden");
  modal.classList.add("fade-out");
  requestAnimationFrame(() => {
    modal.classList.remove("fade-out");
  });
}

function selectGroupColor(colorId) {
  if (currentGroupForColorPicker) {
    chrome.tabGroups
      .update(currentGroupForColorPicker.id, { color: colorId })
      .then(() => {
        fetchAndRenderTabs();
        fetchAndRenderGroups();
        closeColorPicker();
      })
      .catch((err) => console.error("Failed to change color", err));
  }
}

function closeColorPicker() {
  const modal = document.getElementById("color-picker-modal");
  if (modal) {
    modal.classList.add("fade-out");
    setTimeout(() => {
      modal.classList.add("hidden");
      modal.classList.remove("fade-out");
      currentGroupForColorPicker = null;
    }, 250);
  }
}

// Add event listeners for color picker
document.addEventListener("DOMContentLoaded", () => {
  const closeColorPickerBtn = document.getElementById("close-color-picker");
  const colorPickerModal = document.getElementById("color-picker-modal");

  if (closeColorPickerBtn) {
    closeColorPickerBtn.addEventListener("click", closeColorPicker);
  }

  if (colorPickerModal) {
    colorPickerModal.addEventListener("click", (e) => {
      if (e.target === colorPickerModal) {
        closeColorPicker();
      }
    });
  }

  // --- Selection Toolbar Logic ---
  const selectionToolbar = document.getElementById("selection-toolbar");
  const selectionCount = document.getElementById("selection-count");
  const closeSelectedBtn = document.getElementById("close-selected-btn");
  const groupSelectedBtn = document.getElementById("group-selected-btn");
  const clearSelectionBtn = document.getElementById("clear-selection-btn");

  // Update selection toolbar visibility and count
  function updateSelectionToolbar() {
    if (selectedTabs.size > 0) {
      if (selectionToolbar.classList.contains("hidden")) {
        selectionToolbar.classList.remove("hidden");
        selectionToolbar.classList.add("fade-out");
        requestAnimationFrame(() => {
          selectionToolbar.classList.remove("fade-out");
        });
      }
      selectionCount.textContent = `${selectedTabs.size} selected`;
    } else {
      if (!selectionToolbar.classList.contains("hidden")) {
        selectionToolbar.classList.add("fade-out");
        setTimeout(() => {
          selectionToolbar.classList.add("hidden");
          selectionToolbar.classList.remove("fade-out");
        }, 300);
      }
    }
  }

  // Close selected tabs
  if (closeSelectedBtn) {
    closeSelectedBtn.addEventListener("click", () => {
      if (selectedTabs.size > 0) {
        chrome.tabs.remove(Array.from(selectedTabs));
        selectedTabs.clear();
        updateSelectionToolbar();
      }
    });
  }

  // Group selected tabs
  if (groupSelectedBtn) {
    groupSelectedBtn.addEventListener("click", async () => {
      if (selectedTabs.size > 0) {
        const tabIds = Array.from(selectedTabs);
        try {
          await chrome.tabs.group({ tabIds });
          selectedTabs.clear();
          updateSelectionToolbar();
          fetchAndRenderTabs();
        } catch (error) {
          console.error("Failed to group tabs:", error);
        }
      }
    });
  }

  // Clear selection
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      selectedTabs.clear();
      document.querySelectorAll(".tab-tree-node.selected").forEach((el) => {
        el.classList.remove("selected");
      });
      updateSelectionToolbar();
    });
  }

  // Visual hint when shift key is held
  document.addEventListener("keydown", (e) => {
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      document.body.classList.add("shift-selecting");
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") {
      document.body.classList.remove("shift-selecting");
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + A - Select all tabs
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      const allTabNodes = document.querySelectorAll(".tab-tree-node");
      allTabNodes.forEach((node) => {
        const tabId = Number(node.dataset.tabId);
        if (!isNaN(tabId)) {
          selectedTabs.add(tabId);
          node.classList.add("selected");
        }
      });
      updateSelectionToolbar();
    }

    // Escape - Clear selection
    if (e.key === "Escape" && selectedTabs.size > 0) {
      selectedTabs.clear();
      document.querySelectorAll(".tab-tree-node.selected").forEach((el) => {
        el.classList.remove("selected");
      });
      updateSelectionToolbar();
    }

    // Delete - Close selected tabs
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      selectedTabs.size > 0
    ) {
      e.preventDefault();
      chrome.tabs.remove(Array.from(selectedTabs));
      selectedTabs.clear();
      updateSelectionToolbar();
    }
  });

  // Make updateSelectionToolbar available globally
  window.updateSelectionToolbar = updateSelectionToolbar;
});

// --- AI Auto-Grouping Logic ---

document.addEventListener("DOMContentLoaded", () => {
  setupAI();
});

let preGroupingState = null; // Store tab states before AI grouping

function showAIStatus(statusEl, text, color = "") {
  if (!statusEl) return;
  statusEl.classList.remove("hidden");
  statusEl.classList.add("fade-out");
  requestAnimationFrame(() => {
    statusEl.classList.remove("fade-out");
  });
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function resetAIStatus(statusEl, delay = 3000) {
  if (!statusEl) return;
  setTimeout(() => {
    statusEl.classList.add("fade-out");
    setTimeout(() => {
      statusEl.classList.add("hidden");
      statusEl.classList.remove("fade-out");
      statusEl.textContent = "Ready";
      statusEl.style.color = "";
    }, 400);
  }, delay);
}

function setupAI() {
  const organizeBtn = document.getElementById("ai-organize-btn");
  const undoBtn = document.getElementById("undo-ai-grouping-btn");
  const statusEl = document.getElementById("ai-status");
  const aiToggle = document.getElementById("ai-enabled-toggle");

  if (!organizeBtn) return;

  // Load AI enabled state
  chrome.storage.local.get({ aiEnabled: true }, (res) => {
    const enabled = res.aiEnabled;
    if (aiToggle) aiToggle.checked = enabled;
    updateAIButtonState(enabled);
  });

  // Toggle listener
  if (aiToggle) {
    aiToggle.addEventListener("change", () => {
      const enabled = aiToggle.checked;
      chrome.storage.local.set({ aiEnabled: enabled });
      updateAIButtonState(enabled);
    });
  }

  // Undo button listener
  if (undoBtn) {
    undoBtn.addEventListener("click", async () => {
      if (!preGroupingState) return;

      try {
        showAIStatus(statusEl, "Undoing AI grouping...");

        // Restore previous state
        await restoreTabState(preGroupingState);

        showAIStatus(statusEl, "Grouping undone!", "green");

        // Hide undo button
        undoBtn.classList.add('hidden');
        preGroupingState = null;

        resetAIStatus(statusEl, 2000);
        await fetchAndRenderTabs();
      } catch (err) {
        console.error("Undo failed", err);
        showAIStatus(statusEl, "Undo failed: " + err.message, "red");
      }
    });
  }

  organizeBtn.addEventListener("click", async () => {
    // Check if AI is enabled
    const { aiEnabled } = await chrome.storage.local.get({ aiEnabled: true });
    if (!aiEnabled) {
      showAIStatus(statusEl, "AI features are disabled. Enable in settings.", "orange");
      resetAIStatus(statusEl);
      return;
    }

    try {
      showAIStatus(statusEl, "Analyzing tabs...");

      const tabs = await chrome.tabs.query({ currentWindow: true });
      const windowId = tabs[0]?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
      preGroupingState = await captureTabState(tabs);

      const response = await chrome.runtime.sendMessage({
        type: "AI_ORGANIZE_TABS",
        windowId,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "AI organize failed.");
      }

      if (!response.groupsApplied) {
        preGroupingState = null;
        if (undoBtn) undoBtn.classList.add("hidden");
        showAIStatus(statusEl, "No semantic groups found.", "orange");
        resetAIStatus(statusEl);
        return;
      }

      if (undoBtn) undoBtn.classList.remove("hidden");
      showAIStatus(
        statusEl,
        `Created ${response.groupsApplied} group${response.groupsApplied === 1 ? "" : "s"}.`,
        "green",
      );
      resetAIStatus(statusEl);
      await fetchAndRenderTabs();
    } catch (err) {
      console.error("AI organize failed", err);
      preGroupingState = null;
      if (undoBtn) undoBtn.classList.add("hidden");
      showAIStatus(statusEl, "AI Error: " + err.message, "red");
    }
  });
}

function updateAIButtonState(enabled) {
  const organizeBtn = document.getElementById("ai-organize-btn");
  if (!organizeBtn) return;

  if (enabled) {
    organizeBtn.classList.remove("hidden");
  } else {
    organizeBtn.classList.add("hidden");
  }
}

async function captureTabState(tabs) {
  // Capture current tab groups and their members
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

  return {
    tabs: tabs.map(t => ({
      id: t.id,
      groupId: t.groupId,
      index: t.index
    })),
    groups: groups.map(g => ({
      id: g.id,
      title: g.title,
      color: g.color,
      collapsed: g.collapsed
    }))
  };
}

async function restoreTabState(state) {
  if (!state) return;

  const currentTabs = await chrome.tabs.query({ currentWindow: true });
  const tabsById = new Map(currentTabs.map((tab) => [tab.id, tab]));
  const originalTabs = state.tabs
    .filter((tab) => tabsById.has(tab.id))
    .sort((a, b) => a.index - b.index);

  // Reset existing AI-created grouping before recreating the original layout.
  const currentlyGroupedTabIds = currentTabs
    .filter((tab) => tab.groupId !== -1)
    .map((tab) => tab.id);
  if (currentlyGroupedTabIds.length > 0) {
    await chrome.tabs.ungroup(currentlyGroupedTabIds);
  }

  // Restore original tab order when all saved tabs are still present.
  const missingTabs = state.tabs.some((tab) => !tabsById.has(tab.id));
  if (!missingTabs) {
    for (const originalTab of originalTabs) {
      const currentTab = tabsById.get(originalTab.id);
      if (currentTab && currentTab.index !== originalTab.index) {
        await chrome.tabs.move(originalTab.id, { index: originalTab.index });
      }
    }
  }

  // Recreate original tab groups with their metadata.
  const originalGroupsById = new Map(state.groups.map((group) => [group.id, group]));
  for (const [originalGroupId, originalGroup] of originalGroupsById) {
    const tabIds = originalTabs
      .filter((tab) => tab.groupId === originalGroupId)
      .map((tab) => tab.id);

    if (tabIds.length < 2) {
      continue;
    }

    const recreatedGroupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(recreatedGroupId, {
      title: originalGroup.title,
      color: originalGroup.color,
      collapsed: originalGroup.collapsed,
    });
  }
}

// --- Context Menu Logic ---

let contextMenuTabId = null;

function initContextMenu() {
  const contextMenu = document.getElementById("tab-context-menu");
  if (!contextMenu) return;

  // Global click to hide
  document.addEventListener("click", (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Scroll to hide
  document.addEventListener("scroll", hideContextMenu, true);

  // Menu Actions
  document.getElementById("ctx-duplicate")?.addEventListener("click", async () => {
    if (contextMenuTabId) {
      await chrome.tabs.duplicate(contextMenuTabId);
      hideContextMenu();
    }
  });

  document.getElementById("ctx-reload")?.addEventListener("click", async () => {
    if (contextMenuTabId) {
      await chrome.tabs.reload(contextMenuTabId);
      hideContextMenu();
    }
  });

  document.getElementById("ctx-mute")?.addEventListener("click", async () => {
    if (contextMenuTabId) {
      const tab = tabsMap.get(contextMenuTabId);
      if (tab) {
        const shouldMute = !tab.mutedInfo?.muted;
        await chrome.tabs.update(contextMenuTabId, { muted: shouldMute });
        hideContextMenu();
      }
    }
  });

  document.getElementById("ctx-rename").addEventListener("click", () => {
    if (contextMenuTabId) {
      activateRenameMode(contextMenuTabId);
      hideContextMenu();
    }
  });

  document.getElementById("ctx-nest-under")?.addEventListener("click", async () => {
    if (contextMenuTabId) {
      const childTabIds = getNestingCandidates(contextMenuTabId);
      if (childTabIds.length > 0) {
        await nestTabsUnderParent(contextMenuTabId, childTabIds);
      }
      hideContextMenu();
    }
  });

  document.getElementById("ctx-promote").addEventListener("click", async () => {
    if (contextMenuTabId) {
      // Remove from nested head -> Make it a root
      parentOverrides.set(contextMenuTabId, -1);
      await saveParentOverrides();
      fetchAndRenderTabs();
      hideContextMenu();
    }
  });

  document.getElementById("ctx-close").addEventListener("click", () => {
    if (contextMenuTabId) {
      // Check for multi-select
      if (selectedTabs.has(contextMenuTabId) && selectedTabs.size > 1) {
        chrome.tabs.remove(Array.from(selectedTabs));
        selectedTabs.clear();
        if (window.updateSelectionToolbar) window.updateSelectionToolbar();
      } else {
        chrome.tabs.remove(contextMenuTabId);
      }
      hideContextMenu();
    }
  });
}

function showContextMenu(e, tabId) {
  e.preventDefault();
  e.stopPropagation();

  const contextMenu = document.getElementById("tab-context-menu");
  if (!contextMenu) return;

  contextMenuTabId = tabId;

  // Update Menu Text based on selection
  const closeBtn = document.getElementById("ctx-close");
  if (selectedTabs.size > 1 && selectedTabs.has(tabId)) {
    closeBtn.textContent = `Close ${selectedTabs.size} Tabs`;
  } else {
    closeBtn.textContent = "Close Tab";
  }

  // Update mute button text based on tab state
  const tab = tabsMap.get(tabId);
  const muteText = document.getElementById("ctx-mute-text");
  if (muteText && tab) {
    muteText.textContent = tab.mutedInfo?.muted ? "Unmute Tab" : "Mute Tab";
  }

  // Toggle "Remove from Nested Head" visibility
  const nestUnderBtn = document.getElementById("ctx-nest-under");
  const nestingCandidates = getNestingCandidates(tabId);
  if (nestUnderBtn) {
    if (nestingCandidates.length > 0) {
      nestUnderBtn.style.display = "flex";
      nestUnderBtn.textContent =
        nestingCandidates.length === 1
          ? "Nest 1 Selected Tab Under This Tab"
          : `Nest ${nestingCandidates.length} Selected Tabs Under This Tab`;
    } else {
      nestUnderBtn.style.display = "none";
    }
  }

  // Toggle "Remove from Nested Head" visibility
  const promoteBtn = document.getElementById("ctx-promote");
  const node = document.querySelector(`.tab-tree-node[data-tab-id="${tabId}"]`);
  if (node && node.dataset.depth && parseInt(node.dataset.depth) > 0) {
    promoteBtn.style.display = "flex";
  } else {
    promoteBtn.style.display = "none";
  }

  // Position with edge detection
  contextMenu.style.left = e.clientX + "px";
  contextMenu.style.top = e.clientY + "px";
  contextMenu.classList.remove("hidden");
  contextMenu.classList.add("visible");

  // Edge detection - flip menu if it would appear off-screen
  requestAnimationFrame(() => {
    const rect = contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Flip horizontally if off right edge
    if (rect.right > viewportWidth) {
      contextMenu.style.left = (e.clientX - rect.width) + "px";
    }
    
    // Flip vertically if off bottom edge
    if (rect.bottom > viewportHeight) {
      contextMenu.style.top = (e.clientY - rect.height) + "px";
    }
  });
}

function hideContextMenu() {
  const contextMenu = document.getElementById("tab-context-menu");
  if (!contextMenu) return;

  contextMenu.classList.remove("visible");
  setTimeout(() => {
    // Only hide if still not visible (in case reopened quickly)
    if (!contextMenu.classList.contains("visible")) {
      contextMenu.classList.add("hidden");
    }
  }, 100);
}

function activateRenameMode(tabId) {
  const container = document.querySelector(`.tab-tree-node[data-tab-id="${tabId}"]`);
  if (!container) return;

  const title = container.querySelector(".tab-title");
  if (!title) return;

  const tab = tabsMap.get(tabId);
  if (!tab) return;

  const currentName = title.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "rename-input";

  const commit = async () => {
    if (input.value && input.value !== tab.title) {
      customTitles.set(tabId, input.value);
    } else {
      customTitles.delete(tabId); // Revert to original if empty or same
    }
    await saveCustomTitles();
    fetchAndRenderTabs();
  };

  input.onblur = commit;
  input.onkeydown = (ev) => {
    if (ev.key === "Enter") {
      input.blur();
    }
    if (ev.key === "Escape") {
      fetchAndRenderTabs(); // Cancel
    }
  };

  title.replaceWith(input);
  input.focus();
  input.select();
}

// Initialize Context Menu
document.addEventListener("DOMContentLoaded", () => {
  initContextMenu();
});
