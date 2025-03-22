(function () {
    console.log("catch.js Start");

    // 啟用開關
    let enable = true;
    let language = navigator.language.replace("-", "_");
    if (window.CatCatchI18n) {
        if (!window.CatCatchI18n.languages.includes(language)) {
            language = language.split("_")[0];
            if (!window.CatCatchI18n.languages.includes(language)) {
                language = "en";
            }
        }
    }

    // 刪除iframe sandbox屬性 避免 issues #576
    document.addEventListener('DOMContentLoaded', () => {
        function processIframe(iframe) {
            if (iframe.hasAttribute('sandbox')) {
                const clonedIframe = iframe.cloneNode(true);
                clonedIframe.removeAttribute('sandbox');
                iframe.parentNode.replaceChild(clonedIframe, iframe);
            }
        }
        document.querySelectorAll('iframe').forEach(processIframe);
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeName === 'IFRAME') {
                            processIframe(node);
                        }
                    });
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // Trusted Types
    let createHTML = (string) => {
        try {
            const fakeDiv = document.createElement('div');
            fakeDiv.innerHTML = string;
            createHTML = (string) => string;
        } catch (e) {
            const policy = trustedTypes.createPolicy('catCatchPolicy', { createHTML: (s) => s });
            createHTML = (string) => policy.createHTML(string);
            const _innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
            Object.defineProperty(Element.prototype, 'innerHTML', {
                set: function (value) {
                    _innerHTML.set.call(this, createHTML(value));
                }
            });
        }
    }
    createHTML("<div></div>");

    const buttonStyle = 'style="border:solid 1px #000;margin:2px;padding:2px;background:#fff;border-radius:4px;border:solid 1px #c7c7c780;color:#000;"';
    const checkboxStyle = 'style="-webkit-appearance: auto;"';

    const CatCatch = document.createElement("div");
    CatCatch.setAttribute("id", "CatCatchCatch");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips"></div>
    <button id="download" ${buttonStyle} data-i18n="downloadCapturedData">下載已捕獲的數據</button>
    <button id="clean" ${buttonStyle} data-i18n="deleteCapturedData">刪除已捕獲數據</button>
    <button id="restart" ${buttonStyle} data-i18n="capturedBeginning">從頭捕獲</button>
    <div><button id="hide" ${buttonStyle} data-i18n="hide">隱藏</button><button id="close" ${buttonStyle} data-i18n="close">關閉</button></div>
    <label><input type="checkbox" id="autoDown" ${localStorage.getItem("CatCatchCatch_autoDown")} ${checkboxStyle}><span data-i18n="automaticDownload">完成捕獲自動下載</span></label>
    <label><input type="checkbox" id="ffmpeg" ${localStorage.getItem("CatCatchCatch_ffmpeg")} ${checkboxStyle}><span data-i18n="ffmpeg">使用ffmpeg合併</span></label>
    <label><input type="checkbox" id="restartAlways" ${localStorage.getItem("CatCatchCatch_restart")} ${checkboxStyle}><span data-i18n="alwaysCapturedBeginning">始終從頭捕獲</span>(beta)</label>
    <label><input type="checkbox" id="autoToBuffered" ${checkboxStyle}><span data-i18n="autoToBuffered">自動跳轉緩衝尾</span></label>
    <label><input type="checkbox" id="checkHead" ${checkboxStyle}>清理多餘頭部數據</label>
    <details>
        <summary data-i18n="fileName" id="summary">檔名設定</summary>
        <div style="font-weight:bold;"><span data-i18n="fileName">檔名</span>: </div><div id="fileName"></div>
        <div style="font-weight:bold;"><span data-i18n="selector">表達式</span>: </div><div id="selector">Null</div>
        <div style="font-weight:bold;"><span data-i18n="regular">正則</span>: </div><div id="regular">Null</div>
        <button id="setSelector" ${buttonStyle} data-i18n="usingSelector">表達式提取</button>
        <button id="setRegular" ${buttonStyle} data-i18n="usingRegular">正則提取</button>
        <button id="setFileName" ${buttonStyle} data-i18n="customize">手動填寫</button>
    </details>
    <details>
    <summary>test</summary>
        <button id="test" ${buttonStyle}>test</button>
    </details>`;
    CatCatch.style = `
        position: fixed;
        z-index: 999999;
        top: 10%;
        left: 90%;
        background: rgb(255 255 255 / 85%);
        border: solid 1px #c7c7c7;
        border-radius: 4px;
        color: rgb(26, 115, 232);
        padding: 5px 5px 5px 5px;
        font-size: 12px;
        font-family: "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
        user-select: none;
        display: flex;
        align-items: flex-start;
        justify-content: space-evenly;
        flex-direction: column;
        line-height: 20px;`;

    // 建立 Shadow DOM 放入CatCatch
    const divShadow = document.createElement('div');
    const shadowRoot = divShadow.attachShadow({ mode: 'closed' });
    shadowRoot.appendChild(CatCatch);
    // 頁面插入Shadow DOM
    document.getElementsByTagName('html')[0].appendChild(divShadow);

    const tips = CatCatch.querySelector("#tips");

    CatCatch.querySelector("#autoDown").addEventListener('change', function (event) {
        localStorage.setItem("CatCatchCatch_autoDown", this.checked ? "checked" : "");
    });
    CatCatch.querySelector("#ffmpeg").addEventListener('change', function (event) {
        localStorage.setItem("CatCatchCatch_ffmpeg", this.checked ? "checked" : "");
    });
    CatCatch.querySelector("#restartAlways").addEventListener('change', function (event) {
        localStorage.setItem("CatCatchCatch_restart", this.checked ? "checked" : "");
    });
    const $clean = CatCatch.querySelector("#clean");
    $clean.addEventListener('click', function (event) {
        clearCache();
        $clean.innerHTML = i18n("cleanupCompleted", "清理完成!");
        setTimeout(() => { $clean.innerHTML = i18n("clearCache", "清理快取"); }, 1000);
    });
    CatCatch.querySelector("#download").addEventListener('click', function (event) {
        if (isComplete || window.confirm(i18n("downloadConfirmation", "提前下載可能會造成數據混亂.確認？"))) {
            catchDownload();
        }
    });
    CatCatch.querySelector("#hide").addEventListener('click', function (event) {
        CatCatch.style.display = "none";
    });
    CatCatch.querySelector("#close").addEventListener('click', function (event) {
        enable = false;
        CatCatch.style.display = "none";
        window.postMessage({ action: "catCatchToBackground", Message: "script", script: "catch.js", refresh: false });
    });
    CatCatch.querySelector("#restart").addEventListener('click', function (event) {
        CatCatch.querySelector("#checkHead").checked = true;
        clearCache();
        document.querySelectorAll("video").forEach(function (element) {
            element.currentTime = 0;
            element.play();
        });
    });
    CatCatch.querySelector("#setFileName").addEventListener('click', function (event) {
        setFileName = window.prompt(i18n("fileName", i18n("fileName", "輸入檔名, 不包含副檔名")), setFileName ?? "");
        getFileName();
    });
    CatCatch.querySelector("#test").addEventListener('click', function (event) {
        console.log(catchMedia);
        console.log(bufferList);
    });
    CatCatch.querySelector("#summary").addEventListener('click', getFileName);

    // 自動跳轉到緩衝節點
    let autoToBufferedFlag = true;
    const $autoToBuffered = CatCatch.querySelector("#autoToBuffered");
    $autoToBuffered.addEventListener('click', function (event) {
        if (!autoToBufferedFlag) { return; }
        autoToBufferedFlag = false;

        const videos = document.querySelectorAll("video");
        for (let video of videos) {
            video.addEventListener("progress", function (event) {
                const bufferedEnd = video.buffered.end(0);
                if ($autoToBuffered.checked && bufferedEnd < video.duration) {
                    video.currentTime = bufferedEnd - 5;
                }
            });
            video.addEventListener("ended", function (event) {
                $autoToBuffered.checked = false;
            });
        }
    });

    //  始終從頭捕獲
    if (localStorage.getItem("CatCatchCatch_restart") == "checked") {
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('video').forEach(resetVideoPlayback);
            // 監控 DOM
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'VIDEO') {
                            resetVideoPlayback(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('video').forEach(resetVideoPlayback);
                        }
                    });
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    // 檔名設定
    let setFileName = null;
    const fileName = CatCatch.querySelector("#fileName");
    const selector = CatCatch.querySelector("#selector");
    selector.innerHTML = localStorage.getItem("CatCatchCatch_selector") ?? "Null";
    CatCatch.querySelector("#setSelector").addEventListener('click', function (event) {
        const result = window.prompt("Selector", localStorage.getItem("CatCatchCatch_selector") ?? "");
        if (result == null) { return; }
        if (result == "") { clearFileName("selector"); return; }
        const title = document.querySelector(result);
        if (title && title.innerHTML) {
            selector.innerHTML = stringModify(result);
            localStorage.setItem("CatCatchCatch_selector", result);
            getFileName();
        } else {
            clearFileName("selector", i18n("fileNameError", "表達式錯誤, 無法獲取或內容為空!"));
        }
    });
    const regular = CatCatch.querySelector("#regular");
    regular.innerHTML = localStorage.getItem("CatCatchCatch_regular") ?? "Null";
    CatCatch.querySelector("#setRegular").addEventListener('click', function (event) {
        let result = window.prompt(i18n("regular", "檔名獲取正則"), localStorage.getItem("CatCatchCatch_regular") ?? "");
        if (result == null) { return; }
        if (result == "") { clearFileName("regular"); return; }
        try {
            new RegExp(result);
            regular.innerHTML = stringModify(result);
            localStorage.setItem("CatCatchCatch_regular", result);
            getFileName();
        } catch (e) { clearFileName("regular", i18n("fileNameError", "正規表示式錯誤")); console.log(e); }
    });

    // 操作按鈕
    let isComplete = false;
    let x, y;
    function move(event) {
        CatCatch.style.left = event.pageX - x + 'px';
        CatCatch.style.top = event.pageY - y + 'px';
    }
    CatCatch.addEventListener('mousedown', function (event) {
        x = event.pageX - CatCatch.offsetLeft;
        y = event.pageY - CatCatch.offsetTop;
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', function () {
            document.removeEventListener('mousemove', move);
        });
    });

    tips.innerHTML = i18n("waiting", "等待視訊播放");
    let catchMedia = [];
    let bufferList = {};
    let mediaSize = 0;
    let index = 0;

    window.MediaSource.prototype.addSourceBuffer = new Proxy(window.MediaSource.prototype.addSourceBuffer, {
        apply: function (target, thisArg, argumentsList) {
            const result = Reflect.apply(target, thisArg, argumentsList);
            // 標題獲取
            setTimeout(() => { getFileName(); }, 2000);
            tips.innerHTML = i18n("capturingData", "捕獲數據中...");
            const type = argumentsList[0].split("/").shift() + (++index);
            bufferList[type] = [];
            catchMedia.push({ mimeType: argumentsList[0], bufferList: bufferList[type] });
            result.appendBuffer = new Proxy(result.appendBuffer, {
                apply: function (target, thisArg, argumentsList) {
                    Reflect.apply(target, thisArg, argumentsList);
                    if (enable) {
                        mediaSize += argumentsList[0].byteLength;
                        tips.innerHTML = i18n("capturingData", "捕獲數據中...") + ": " + byteToSize(mediaSize);
                        bufferList[type].push(argumentsList[0]);
                    }
                }
            });
            return result;
        }
    });

    window.MediaSource.prototype.endOfStream = new Proxy(window.MediaSource.prototype.endOfStream, {
        apply: function (target, thisArg, argumentsList) {
            Reflect.apply(target, thisArg, argumentsList);
            if (enable) {
                isComplete = true;
                tips.innerHTML = i18n("captureCompleted", "捕獲完成");
                localStorage.getItem("CatCatchCatch_autoDown") == "checked" && catchDownload();
            }
        }
    });

    // 下載資源
    function catchDownload() {
        if (catchMedia.length == 0) {
            alert(i18n("noData", "沒抓到有效數據"));
            return;
        }
        // catchMedia 預處理 解決 從頭捕獲 檔案頭重複 臨時解決辦法
        if (CatCatch.querySelector("#checkHead").checked) {
            for (let key in catchMedia) {
                if (!catchMedia[key].bufferList) { continue; }
                const data = new Uint8Array(catchMedia[key].bufferList[1]);
                if (data[4] == 0x66 && data[5] == 0x74 && data[6] == 0x79 && data[7] == 0x70) {
                    catchMedia[key].bufferList.shift();
                }
            }
            CatCatch.querySelector("#checkHead").checked = false;
        }
        if (catchMedia.length >= 2 && localStorage.getItem("CatCatchCatch_ffmpeg") == "checked") {
            const media = [];
            for (let item of catchMedia) {
                const mime = item.mimeType.split(';')[0];
                const fileBlob = new Blob(item.bufferList, { type: mime });
                const type = mime.split('/')[0];
                media.push({ data: (typeof chrome == "object") ? URL.createObjectURL(fileBlob) : fileBlob, type: type });
            }
            window.postMessage({
                action: "catCatchFFmpeg",
                use: "catchMerge",
                files: media,
                title: fileName.innerHTML.trim(),
                output: fileName.innerHTML.trim(),
                quantity: media.length
            });
        } else {
            const a = document.createElement('a');
            for (let item of catchMedia) {
                const mime = item.mimeType.split(';')[0];
                const type = mime.split('/')[0] == "video" ? "mp4" : "mp3";
                const fileBlob = new Blob(item.bufferList, { type: mime });
                a.href = URL.createObjectURL(fileBlob);
                a.download = `${fileName.innerHTML.trim()}.${type}`;
                a.click();
            }
            a.remove();
        }
        if (isComplete) {
            clearCache(true);
            tips.innerHTML = i18n("downloadCompleted", "下載完畢...");
        }
    }
    function clearFileName(obj = "selector", warning = "") {
        localStorage.removeItem("CatCatchCatch_" + obj);
        (obj == "selector" ? selector : regular).innerHTML = i18n("notSet", "未設定");
        getFileName();
        warning && alert(warning);
    }

    function clearCache(all = false) {
        isComplete = false;
        mediaSize = 0;
        if (all) {
            catchMedia = [];
            bufferList = {};
            restartFlag = false;
            return;
        }
        for (let key in catchMedia) {
            catchMedia[key].bufferList.splice(1);
            mediaSize += catchMedia[key].bufferList[0]?.byteLength;
        }
    }
    function byteToSize(byte) {
        if (!byte || byte < 1024) { return 0; }
        if (byte < 1024 * 1024) {
            return (byte / 1024).toFixed(1) + "KB";
        } else if (byte < 1024 * 1024 * 1024) {
            return (byte / 1024 / 1024).toFixed(1) + "MB";
        } else {
            return (byte / 1024 / 1024 / 1024).toFixed(1) + "GB";
        }
    }
    function getFileName() {
        if (setFileName) {
            fileName.innerHTML = stringModify(setFileName);
            return;
        }
        let name = "";
        if (localStorage.getItem("CatCatchCatch_selector")) {
            const title = document.querySelector(localStorage.getItem("CatCatchCatch_selector"));
            if (title && title.innerHTML) {
                name = title.innerHTML;
            }
        }
        if (localStorage.getItem("CatCatchCatch_regular")) {
            const str = name == "" ? document.documentElement.outerHTML : name;
            try {
                const reg = new RegExp(localStorage.getItem("CatCatchCatch_regular"), "g");
                let result = str.match(reg);
                console.log(result, reg);
                if (result) {
                    result = result.filter((item) => { return item !== ""; });
                    name = result.join("_");
                }
            } catch (e) { console.log(e); }
        }
        fileName.innerHTML = name ? stringModify(name) : stringModify(document.title);
    }
    function stringModify(str) {
        if (!str) { return str; }
        return str.replace(/['\\:\*\?"<\/>\|~]/g, function (m) {
            return {
                "'": '&#39;',
                '\\': '&#92;',
                '/': '&#47;',
                ':': '&#58;',
                '*': '&#42;',
                '?': '&#63;',
                '"': '&quot;',
                '<': '&lt;',
                '>': '&gt;',
                '|': '&#124;',
                '~': '_'
            }[m];
        });
    }

    // 從頭播放
    function resetVideoPlayback(video) {
        const timer = setInterval(() => {
            if (!video.paused) {
                video.currentTime = 0;
                CatCatch.querySelector("#checkHead").checked = true;
                clearCache();
                clearInterval(timer);
            }
        });
        video.addEventListener('play', () => {
            if (!video.isResetCatCatch) {
                video.isResetCatCatch = true;
                video.currentTime = 0;
                CatCatch.querySelector("#checkHead").checked = true;
                clearCache();
            }
        });
    }

    // i18n
    if (window.CatCatchI18n) {
        CatCatch.querySelectorAll('[data-i18n]').forEach(function (element) {
            element.innerHTML = window.CatCatchI18n[element.dataset.i18n][language];
        });
        CatCatch.querySelectorAll('[data-i18n-outer]').forEach(function (element) {
            element.outerHTML = window.CatCatchI18n[element.dataset.i18nOuter][language];
        });
    }
    function i18n(key, original = "") {
        if (!window.CatCatchI18n) { return original };
        return window.CatCatchI18n[key][language];
    }
})();