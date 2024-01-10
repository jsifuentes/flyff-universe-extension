export default function injectScript(url, body) {
    const script = document.createElement("script");

    if (url) {
        script.src = chrome.extension.getURL(url);
    } else {
        script.textContent = body;
    }

    script.onload = function() {
        // this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}
