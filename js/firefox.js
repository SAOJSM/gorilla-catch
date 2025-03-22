// 相容Firefox
if (typeof (browser) == "object") {
    function importScripts() {
        for (let script of arguments) {
            const js = document.createElement('script');
            js.src = script;
            document.head.appendChild(js);
        }
    }

    // browser.windows.onFocusChanged.addListener 少一個參數
    const _onFocusChanged = chrome.windows.onFocusChanged.addListener;
    chrome.windows.onFocusChanged.addListener = function (listener) {
        _onFocusChanged(listener);
    };

    browser.runtime.onInstalled.addListener(({ reason }) => {
        if (reason == "install") {
            browser.tabs.create({ url: "install.html" });
        }
    });
}