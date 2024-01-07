(async () => {
    const src = chrome.runtime.getURL('src/index.js');
    const contentScript = await import(src);
    contentScript.main();
})();