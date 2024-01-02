(async () => {
    const src = chrome.runtime.getURL('src/init.js');
    const contentScript = await import(src);
    contentScript.main();
})();