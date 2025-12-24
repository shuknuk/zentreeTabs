Based on the **Gemini for Google Workspace Prompting Guide 101** you provided, I have designed a comprehensive **Product Requirements Document (PRD) Prompt**.

This is not just a standard document; it is engineered as a "Power Prompt" (Tip #6 from the guide) designed to be pasted directly into Google AI Studio or Gemini Advanced. It utilizes the four key areas of effective prompting: **Persona**, **Task**, **Context**, and **Format**.

### **The "Power Prompt" (Copy and Paste this into Gemini)**

---

**Role (Persona):**
You are a Senior Frontend Engineer and Chrome Extension Specialist with an eye for "Vibe Coding" and modern UI/UX design. You specialize in creating "Arc-style" interfaces that are minimal, borderless, and use fluid animations.

**Task:**
Generate the complete codebase for a Chrome Extension (Manifest V3) called "ZenTree Tabs." The extension must feature a **Tree-Style Vertical Tab** sidebar that looks native, modern, and elegant.

**Context (The PRD):**
The goal is to solve "tab fatigue" by moving tabs to a vertical sidebar with hierarchy, similar to the "Arc Browser" or "Tree Style Tab," but with a cleaner, 2025 aesthetic.

**1. Functional Requirements:**

* **Vertical Layout:** Tabs are listed vertically in the Chrome Side Panel API.
* **Tree Hierarchy:** Tabs opened from a "parent" tab should appear indented underneath the parent.
* **Collapsibility:** Users must be able to click an arrow/indicator to collapse or expand a branch of tabs.
* **Drag & Drop:** (Optional but preferred) Ability to drag tabs to nest/unnest them.
* **Active State:** The active tab must be clearly highlighted with a "pill" shape or glow.

**2. Visual & Aesthetic Requirements (The "Clean" Look):**

* **Borderless Design:** The sidebar should feel like it blends into the browser. Remove default scrollbars or style them to be invisible/minimal.
* **Glassmorphism:** Use `backdrop-filter: blur()` effects for the background to let the user's wallpaper/theme subtly shine through.
* **Modern Typography:** Use system-ui fonts (San Francisco/Inter) with clean spacing. No dense text.
* **Dynamic Theme:** The extension should detect if the user's browser is in Dark Mode or Light Mode and adjust colors automatically using CSS variables.

**3. Technical Specifications:**

* **Manifest V3:** Must use the latest Chrome Extension standards.
* **Permissions:** `sidePanel`, `tabs`, `tabGroups` (if needed), `storage`.
* **Tech Stack:** Pure HTML, CSS, and Vanilla JavaScript (no heavy frameworks like React unless necessary for state management, keep it lightweight).

**Format (Deliverables):**
Please output the following files in code blocks:

1. `manifest.json` (Correctly configured for Side Panel).
2. `sidepanel.html` (The structure).
3. `style.css` (The aesthetics—focus heavily here on the "Arc" look).
4. `sidepanel.js` (The logic for tree rendering and tab listeners).
5. `background.js` (Service worker for handling events).

---

### **Why This Prompt Works (Based on the Guide)**

I constructed this prompt using the specific principles found in your PDF:

**1. Persona-Based Prompting**

* **Strategy:** The prompt begins by assigning a specific role: *"You are a Senior Frontend Engineer... with an eye for Vibe Coding."*
* **Source:** The guide states to "Assign a role" to encourage creativity (e.g., "You are the head of a creative department"). By telling Gemini it is a specialist in "Arc-style" interfaces, we prime it to prioritize aesthetics over generic code.

**2. Specificity and Constraints**

* **Strategy:** The prompt explicitly lists permissions (`sidePanel`, `tabs`) and constraints ("Pure HTML/CSS," "Manifest V3").
* **Source:** The guide advises to "Be specific and iterate" and "Give constraints". Vague requests lead to generic code; specific constraints lead to production-ready snippets.

**3. Structure (Persona, Task, Context, Format)**

* **Strategy:** The prompt is visibly divided into these four distinct sections.
* **Source:** The guide identifies these as the "four main areas to consider when writing an effective prompt".
* **Task:** "Generate the complete codebase...".
* **Context:** Explaining *why* we want this (solving tab fatigue, mimicking Arc Browser).
* **Format:** Explicitly asking for `manifest.json`, `style.css`, etc..



**4. Natural Language & "Vibe"**

* **Strategy:** I used terms like "Glassmorphism," "clean," and "pill shape."
* **Source:** The guide suggests using "natural language" and writing as if speaking to another person. It also notes that Gemini 3 is capable of "vibe coding" (implied context from your prompt), so describing the *feel* of the UI is just as important as the logic.

**Next Step:**
Copy the text between the horizontal lines and paste it directly into **Google AI Studio** (using the Gemini 1.5 Pro or Gemini 3 model). The output will be the exact files you need to create the extension folder on your computer.