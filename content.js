function getMetaContent(attribute, value) {
  const selector = `meta[${attribute}="${value}"]`;
  const element = document.querySelector(selector);
  return element?.content?.trim() || "";
}

function extractTabContext() {
  const description =
    getMetaContent("name", "description") ||
    getMetaContent("property", "og:description") ||
    getMetaContent("name", "twitter:description");

  const title = document.title?.trim() || "";
  return {
    context: description || title,
    hasUsableDescription: Boolean(description),
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ZENTREE_GET_CONTEXT") {
    return undefined;
  }

  sendResponse(extractTabContext());
  return false;
});
