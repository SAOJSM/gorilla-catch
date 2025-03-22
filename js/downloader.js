// url 參數解析
const params = new URL(location.href).searchParams;
const _requestId = params.get("requestId") ? params.get("requestId").split(",") : [];   // 要下載得資源ID
const _ffmpeg = params.get("ffmpeg");   // 啟用線上FFmpeg
let _downStream = params.get("downStream"); // 啟用邊下邊存 流式下載
const _data = [];   // 通過_requestId獲取得到得數據
const _taskId = Date.parse(new Date()); // 配合ffmpeg使用的任務ID 以便線上ffmpeg通過ID知道檔案屬於哪些任務
let _tabId = null;  // 目前頁面tab id
let _index = null;  // 目前頁面 tab index

// 是否表單提交下載 表單提交 不使用自定義檔名
const downloadData = localStorage.getItem('downloadData') ? JSON.parse(localStorage.getItem('downloadData')) : [];

awaitG(() => {
    $(`<style>${G.css}</style>`).appendTo("head");
    // 獲取目前標籤資訊
    chrome.tabs.getCurrent(function (tabs) {
        _tabId = tabs.id;
        _index = tabs.index;

        // 如果沒有requestId 顯示 提交表單
        if (!_requestId.length) {
            $("#downStream").prop("checked", G.downStream);
            $("#getURL, .newDownload").toggle();
            $("#getURL_btn").click(function () {
                const data = [{
                    url: $("#getURL #url").val().trim(),
                    requestId: 1,
                }];

                // 處理請求頭 如果是url直接放入referer 支援json格式
                const referer = $("#getURL #referer").val().trim();
                if (referer) {
                    if (referer.startsWith("http")) {
                        data[0].requestHeaders = { referer: referer };
                    } else {
                        data[0].requestHeaders = JSONparse(referer);
                    }
                }

                _downStream = $("#downStream").prop("checked");
                _data.push(...data);
                setHeaders(data, start(), _tabId);
                $("#getURL, .newDownload").toggle();
            });
            return;
        }

        // 優先從downloadData 提取任務數據
        for (let item of downloadData) {
            if (_requestId.includes(item.requestId)) {
                _data.push(item);
                _requestId.splice(_requestId.indexOf(item.requestId), 1);
            }
        }
        if (!_requestId.length) {
            setHeaders(_data, start(), _tabId);
            return;
        }

        // downloadData 不存在 從後臺獲取數據
        chrome.runtime.sendMessage({ Message: "getData", requestId: _requestId }, function (data) {
            if (data == "error" || !Array.isArray(data) || chrome.runtime.lastError || data.length == 0) {
                alert(i18n.dataFetchFailed);
                return;
            }
            _data.push(...data);
            setHeaders(data, start(), _tabId);
        });
    });
});

function start() {
    $("#autoClose").prop("checked", G.downAutoClose);
    streamSaver.mitm = G.streamSaverConfig.url;

    const $downBox = $("#downBox"); // 下載列表容器
    const down = new Downloader(_data);  // 建立下載器 
    const itemDOM = new Map();  // 提前儲存需要平凡操作的dom對像 提高效率

    $("#test").click(() => console.log(down));

    // 新增html
    const addHtml = (fragment) => {
        const html = $(`
            <div class="downItem">
                <div class="explain">${fragment.downFileName}</div>
                <div id="downFilepProgress"></div>
                <div class="progress-container">
                    <div class="progress-wrapper">
                        <div class="progress-bar">
                            <div class="progress"></div>
                        </div>
                    </div>
                    <button class="cancel-btn">${i18n.stopDownload}</button>
                </div>
            </div>`);

        const $button = html.find("button");
        $button.data("action", "stop");

        // 操作對像放入itemDOM 提高效率
        itemDOM.set(fragment.index, {
            progressText: html.find("#downFilepProgress"),
            progress: html.find(".progress"),
            button: $button
        });

        $button.click(function () {
            const action = $(this).data("action");
            if (action == "stop") {
                down.stop(fragment.index);
                $(this).html(i18n.retryDownload).data("action", "start");
                if (fragment.fileStream) {
                    fragment.fileStream.close();
                }
            } else if (action == "start") {
                if (fragment.fileStream) {
                    fragment.fileStream = streamSaver.createWriteStream(fragment.downFileName).getWriter();
                }
                down.state = "waiting";
                down.downloader(fragment);
                $(this).html(i18n.stopDownload).data("action", "stop");
            }
        });
        $downBox.append(html);

        // 流式下載處理
        if ((_downStream || G.downStream) && !_ffmpeg) {
            fragment.fileStream = streamSaver.createWriteStream(fragment.downFileName).getWriter();
        }
    }

    // 下載列表新增對應html
    down.fragments.forEach(addHtml);

    // 檔案程序事件
    let lastEmitted = Date.now();
    down.on('itemProgress', function (fragment, state, receivedLength, contentLength, value) {
        // 通過 lastEmitted 限制更新頻率 避免瘋狂dom操作
        if (Date.now() - lastEmitted >= 100 && !state) {
            const $dom = itemDOM.get(fragment.index);
            if (contentLength) {
                const progress = (receivedLength / contentLength * 100).toFixed(2) + "%";
                $dom.progress.css("width", progress).html(progress);
                $dom.progressText.html(`${byteToSize(receivedLength)} / ${byteToSize(contentLength)}`);
            } else {
                $dom.progressText.html(`${byteToSize(receivedLength)}`);
            }
            if (down.total == 1) {
                const title = contentLength ?
                    `${byteToSize(receivedLength)} / ${byteToSize(contentLength)}` :
                    `${byteToSize(receivedLength)}`;
                document.title = title;
            }
            lastEmitted = Date.now();
        }
    });

    // 單檔案下載完成事件
    down.on('completed', function (buffer, fragment) {

        const $dom = itemDOM.get(fragment.index);
        $dom.progress.css("width", "100%").html("100%");
        $dom.progressText.html(i18n.downloadComplete);
        $dom.button.html(i18n.sendFfmpeg).data("action", "sendFfmpeg");
        document.title = `${down.success}/${down.total}`;
        $dom.button.hide();

        // 是流式下載 停止寫入
        if (fragment.fileStream) {
            fragment.fileStream.close();
            return;
        }

        // 轉為blob
        const blob = ArrayBufferToBlob(buffer, { type: fragment.contentType });

        // 發送到ffmpeg
        if (_ffmpeg) {
            sendFile(_ffmpeg, blob, fragment);
            $dom.progressText.html(i18n.sendFfmpeg);
            return;
        }

        $dom.progressText.html(i18n.saving);
        // 直接下載
        chrome.downloads.download({
            url: URL.createObjectURL(blob),
            filename: fragment.downFileName,
            saveAs: G.saveAs
        }, function (downloadId) {
            fragment.downId = downloadId;
        });
    });

    // 全部下載完成事件
    down.on('allCompleted', function (buffer) {
        $("#stopDownload").hide();

        // 檢查 down.fragments 是否都為邊下邊存 檢查自動關閉
        if (down.fragments.every(item => item.fileStream) && $("#autoClose").prop("checked")) {
            setTimeout(() => {
                closeTab();
            }, Math.ceil(Math.random() * 999));
        }
    });

    // 錯誤處理
    down.on('downloadError', function (fragment, error) {
        // 新增range請求頭 重新嘗試下載
        if (!fragment.retry?.Range && error?.cause == "HTTPError") {
            fragment.retry = { "Range": "bytes=0-" };
            down.downloader(fragment);
            return;
        }
        // 新增sec-fetch 再次嘗試下載
        if (!fragment.retry?.sec && error?.cause == "HTTPError") {
            fragment.retry.sec = true;
            if (!fragment.requestHeaders) { fragment.requestHeaders = {}; }
            fragment.requestHeaders = { ...fragment.requestHeaders, "sec-fetch-mode": "no-cors", "sec-fetch-site": "same-site" };
            setHeaders(fragment, () => { down.downloader(fragment); }, _tabId);
            return;
        }
        itemDOM.get(fragment.index).progressText.html(error);
        chrome.tabs.highlight({ tabs: _index });
    });

    // 開始下載事件 如果存在range重下標記 則新增 range 請求頭
    down.on('start', function (fragment, options) {
        if (fragment.retry) {
            options.headers = fragment.retry;
            options.cache = "no-cache";
        }
    });

    // 全部停止下載按鈕
    $("#stopDownload").click(function () {
        down.stop();
        // 更新對應的按鈕狀態
        itemDOM.forEach((item, index) => {
            if (item.button.data("action") == "stop") {
                item.button.html(i18n.retryDownload).data("action", "start");
                if (down.fragments[index].fileStream) {
                    down.fragments[index].fileStream.close();
                    down.fragments[index].fileStream = null;
                }
            }
        });
    });

    // 打開下載目錄
    $(".openDir").click(function () {
        if (down.fragments[0].downId) {
            chrome.downloads.show(down.fragments[0].downId);
            return;
        }
        chrome.downloads.showDefaultFolder();
    });

    // 監聽事件
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message) { return; }

        // 外部新增下載任務
        if (Message.Message == "catDownload" && Message.data && Array.isArray(Message.data)) {
            // ffmpeg任務的下載器 不允許新增新任務
            if (_ffmpeg) {
                sendResponse({ message: "FFmpeg", tabId: _tabId });
                return;
            }
            setHeaders(Message.data, () => {
                for (let fragment of Message.data) {
                    // 檢查fragment是否已經存在
                    if (down.fragments.find(item => item.requestId == fragment.requestId)) {
                        continue;
                    }

                    _data.push(fragment);
                    down.push(fragment);
                    addHtml(fragment);

                    // 修改url requestId 參數
                    const url = new URL(location.href);
                    url.searchParams.set("requestId", down.fragments.map(item => item.requestId).join(","));
                    history.replaceState(null, null, url);

                    // 數據儲存到localStorage
                    downloadData.push(fragment);
                    localStorage.setItem('downloadData', JSON.stringify(downloadData));

                    // 正在執行的下載任務小於執行緒數 則開始下載
                    if (down.running < down.thread) {
                        down.downloader(fragment.index);
                    }
                };
            }, _tabId);
            sendResponse({ message: "OK", tabId: _tabId });
            return;
        }

        // 以下為線上ffmpeg返回結果
        if (Message.Message != "catCatchFFmpegResult" || Message.state != "ok" || _tabId == 0 || Message.tabId != _tabId) { return; }

        // 發送狀態提示
        const $dom = itemDOM.get(Message.index);
        $dom && $dom.progressText.html(i18n.hasSent);
        down.buffer[Message.index] = null; //清空buffer

        // 全部發送完成 檢查自動關閉
        if (down.success == down.total) {
            if ($("#autoClose").prop("checked")) {
                setTimeout(() => {
                    closeTab();
                }, Math.ceil(Math.random() * 999));
            }
        }
    });

    // 監聽下載事件 下載完成 關閉視窗
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state || downloadDelta.state.current != "complete") { return; }

        // 檢查id是否本頁面提交的下載
        const fragment = down.fragments.find(item => item.downId == downloadDelta.id);
        if (!fragment) { return; }

        down.buffer[fragment.index] = null; //清空buffer

        // 更新下載狀態
        itemDOM.get(fragment.index).progressText.html(i18n.downloadComplete);

        // 完成下載 檢查自動關閉
        if (down.success == down.total) {
            document.title = i18n.downloadComplete;
            if ($("#autoClose").prop("checked")) {
                setTimeout(() => {
                    closeTab();
                }, Math.ceil(Math.random() * 999));
            }
        }
    });

    // 關閉頁面 檢查關閉所有未完成的下載流
    window.addEventListener('beforeunload', function (e) {
        const fileStream = down.fragments.filter(item => item.fileStream);
        if (fileStream.length) {
            e.preventDefault();
            fileStream.forEach((fragment) => {
                fragment.fileStream.close();
            });
        }
    });

    document.title = `${down.success}/${down.total}`;
    down.start();
}

/**
 * 發送數據到線上FFmpeg
 * @param {String} action 發送型別
 * @param {ArrayBuffer|Blob} data 數據內容
 * @param {Object} fragment 數據對像
 */
let isCreatingTab = false;
function sendFile(action, data, fragment) {
    // 轉 blob
    if (data instanceof ArrayBuffer) {
        data = ArrayBufferToBlob(data, { type: fragment.contentType });
    }
    chrome.tabs.query({ url: G.ffmpegConfig.url + "*" }, function (tabs) {
        // 等待ffmpeg 打開並且可用
        if (tabs.length === 0) {
            if (!isCreatingTab) {
                isCreatingTab = true; // 設定建立標誌位
                chrome.tabs.create({ url: G.ffmpegConfig.url });
            }
            setTimeout(sendFile, 500, action, data, fragment);
            return;
        } else if (tabs[0].status !== "complete") {
            setTimeout(sendFile, 233, action, data, fragment);
            return;
        }
        isCreatingTab = false; // 重置建立標誌位
        /**
         * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities#data_cloning_algorithm
         * chrome.runtime.sendMessage API
         * chrome 的對象參數需要序列化 無法傳遞Blob
         * firefox 可以直接傳遞Blob
         */
        const baseData = {
            Message: "catCatchFFmpeg",
            action: action,
            files: [{ data: G.isFirefox ? data : URL.createObjectURL(data), name: getUrlFileName(fragment.url), index: fragment.index }],
            title: stringModify(fragment.title),
            tabId: _tabId
        };
        if (action === "merge") {
            baseData.taskId = _taskId;
            baseData.quantity = _data.length;
        }

        chrome.runtime.sendMessage(baseData);
    });
}