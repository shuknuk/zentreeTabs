# ZenTree Tabs

<div align="center">
  <img src="icons/logo.svg" alt="ZenTree Tabs Logo" width="128" />
  <h3>Vertical Tree-Style Tab Manager for Chrome</h3>
  <p>Minimalist. Tree-Style. Native.</p>
  <p>
    <a href="https://shuknuk.github.io/zentreeTabs/"><strong>Official Website</strong></a> | 
    <a href="https://zentreetabs.vercel.app/"><strong>Vercel Mirror</strong></a>
  </p>
</div>

<br />


No one has time to switch browsers, because they're too reliant on them *cough Chrome. 

But even those browsers that feature vertical tabs, they don't present them properly. They should be in a tree-style tab, knowing from which main tab other tabs have came from. It becomes so much easier to track that way. 

Which is why I build this: tabs in a vertical layout, nested like branches in a tree. All without switching web browers. 


**ZenTree Tabs**

**ZenTree Tabs** brings vertical, tree-style browsing to the Chrome Side Panel. 

I built this because I wanted the organizational flow and aesthetic of browsers like Arc, but without leaving the Chrome ecosystem. It features automatic nesting, full support for native Tab Groups, and a clean, glassmorphic UI.

## Demo

<div align="center">
  <img src="demo.gif" alt="ZenTree Tabs Demo" width="100%" />
</div>

## Features

- **Tree Layout**: Tabs automatically nest under the tab they were opened from, keeping your research context linked naturally.
  <div align="center">
    <img src="public/nested tabs.png" alt="Nested Tabs Example" width="80%" />
  </div>
- **Native Group Sync**: Chrome Tab Groups show up as folders. Collapsing a folder in the sidebar collapses the actual group in the top strip (and vice versa).
- **Drag & Drop**: Smooth HTML5 drag-and-drop across the full vertical tab row. Reordering follows the visible drop indicator line, so placement is determined by the nearest before/after indicator rather than requiring the cursor to sit directly on a row.
- **Multi-Select**: Use `Ctrl/Cmd + Click` or `Shift + Click` to select multiple tabs for batch closing or grouping.
- **Explicit Nesting**: Keep drag dedicated to reordering, then use multi-select plus the tab context menu to nest selected tabs under a parent tab without overloading the drag gesture.
- **Enhanced Context Menu**: Right-click any tab for quick actions:
  - Duplicate, reload, mute/unmute, or nest selected tabs under the clicked tab
  - Smart edge detection ensures menu stays visible on screen

- **AI Semantic Grouping (Beta)**: Local AI assistant that understands your research context.
  - **Smart Clustering**: Uses the `all-MiniLM-L6-v2` model to group related tabs across different domains.
  - **Deterministic Labeling**: Generates concise, predictable group names (e.g., "Cookie Research").
  - **Configurable Threshold**: Set minimum tabs (2-5) before auto-grouping same domains.
  - **100% Local**: No API keys, no tracking. Everything runs on your device via WASM.
- **Theming**:
  - Comes with 9 themes: Cream (Default), Mist, Sage, Blush, Sand, Lavendar, Seaform, Stone, and AMOLED
  - AMOLED theme features pure black background optimized for OLED displays
  - Toggles for "Background Mesh" and "Glassy Tabs" to tweak the look.
  <div align="center">
    <img src="public/colors.png" alt="Theming Options" width="40%" />
  </div>
- **Smart Icons**: Handles system icons (Settings, History) and Extension pages correctly, so you don't get broken favicons.

## Installation

The extension is now available on the **Chrome Web Store**:

[**Get ZenTree Tabs on Chrome Web Store**](https://chromewebstore.google.com/detail/oehbeeknkkjggpkojibjhmkklgodpdbd?utm_source=item-share-cb)

> [!NOTE]  
> The current store version is **v2.1.0**.  
> **v3.1** (with local AI grouping, AMOLED theme, configurable thresholds, and enhanced context menu) is currently pending review and is coming soon!

### Manual Installation (Developer Mode)

If you'd like to try out the upcoming features before they hit the store:

## Good to Know

- **New Tabs**: Manually opening a new tab (`Cmd/Ctrl + T`) will always start at the root level to prevent accidental nesting chains.
- **Renaming**: Custom names are stored in local storage, so they won't mess with the actual page title or SEO.
- **Selection**: `Ctrl/Cmd + A` works to select all tabs if you need to clear your workspace quickly.

## Tech Stack

- **AI Infrastructure**: `Transformers.js` + `all-MiniLM-L6-v2` for on-device semantic reasoning.
- **WASM**: WebAssembly for high-performance local inference.
- **Core**: Vanilla JavaScript (ES6+), CSS3, and HTML5.
- **Manifest**: Chrome Extension Manifest V3.
- **Storage**: `chrome.storage.local` to persist tab groupings and custom names.

## License

[MIT](LICENSE)
