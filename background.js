// ZenTree Tabs - Background Service Worker

let offscreenDocumentPromise = null;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("ZenTree Tabs installed.");
});

function resolveTabUrl(tab) {
  let url = tab.pendingUrl || tab.url || "";
  if (!url.startsWith("chrome-extension://") || !url.includes("suspended.html")) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    const restoredUrl =
      parsedUrl.searchParams.get("uri") || parsedUrl.searchParams.get("url");
    if (restoredUrl) {
      return restoredUrl;
    }

    const hashMatch = parsedUrl.hash.match(/(?:uri|url)=([^&]+)/);
    if (hashMatch) {
      return decodeURIComponent(hashMatch[1]);
    }
  } catch (error) {
    console.warn("Failed to parse suspended URL", url, error);
  }

  return url;
}

function isCompoundSuffix(parts) {
  const compoundRoots = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
  return parts.length >= 3 && parts[parts.length - 1].length === 2 && compoundRoots.has(parts[parts.length - 2]);
}

function getRootDomain(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) {
      return hostname;
    }
    if (isCompoundSuffix(parts)) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  } catch (error) {
    return "";
  }
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");

  if (chrome.runtime.getContexts) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });
    if (existingContexts.length > 0) {
      return;
    }
  }

  if (!offscreenDocumentPromise) {
    offscreenDocumentPromise = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: ["DOM_PARSER"],
        justification: "Compute semantic tab embeddings outside the service worker.",
      })
      .finally(() => {
        offscreenDocumentPromise = null;
      });
  }

  await offscreenDocumentPromise;
}

async function getTabContext(tab) {
  const resolvedUrl = resolveTabUrl(tab);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "ZENTREE_GET_CONTEXT",
    });

    const context = (response?.context || tab.title || resolvedUrl || "").trim();
    return {
      id: tab.id,
      index: tab.index,
      url: resolvedUrl,
      rootDomain: getRootDomain(resolvedUrl),
      context,
      hasUsableDescription: Boolean(response?.hasUsableDescription),
    };
  } catch (error) {
    return {
      id: tab.id,
      index: tab.index,
      url: resolvedUrl,
      rootDomain: getRootDomain(resolvedUrl),
      context: (tab.title || resolvedUrl || "").trim(),
      hasUsableDescription: false,
    };
  }
}

async function organizeTabsWithAI(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const eligibleTabs = tabs.filter((tab) => !tab.pinned && tab.groupId === -1);
  if (eligibleTabs.length < 2) {
    return { ok: true, groupsApplied: 0 };
  }

  const tabContexts = await Promise.all(eligibleTabs.map((tab) => getTabContext(tab)));
  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: "OFFSCREEN_GROUP_TABS",
    tabs: tabContexts,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Failed to group tabs.");
  }

  let groupsApplied = 0;
  for (const group of response.groups || []) {
    if (!group.tabIds || group.tabIds.length < 2) {
      continue;
    }

    const groupId = await chrome.tabs.group({ tabIds: group.tabIds });
    if (group.name) {
      await chrome.tabGroups.update(groupId, { title: group.name });
    }
    groupsApplied += 1;
  }

  return { ok: true, groupsApplied };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AI_ORGANIZE_TABS") {
    return undefined;
  }

  organizeTabsWithAI(message.windowId)
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error("AI organize failed", error);
      sendResponse({
        ok: false,
        error: error.message || "AI organize failed.",
      });
    });

  return true;
});
