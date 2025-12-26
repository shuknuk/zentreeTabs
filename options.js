document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('glass-toggle').addEventListener('change', saveOptions);

function saveOptions() {
    const glassEnabled = document.getElementById('glass-toggle').checked;
    chrome.storage.local.set({ themePreference: glassEnabled ? 'glass' : 'simple' }, () => {
        // Optional: Status feedback
        console.log("Theme saved:", glassEnabled ? 'glass' : 'simple');
    });
}

function restoreOptions() {
    chrome.storage.local.get({ themePreference: 'glass' }, (items) => {
        // Default to glass if not set, or checks if value is 'glass'
        document.getElementById('glass-toggle').checked = items.themePreference === 'glass';
    });
}
