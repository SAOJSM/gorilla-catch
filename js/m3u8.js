// url 參數解析
const params = new URL(location.href).searchParams;
let _m3u8Url = params.get("url");   // m3u8的url地址
const _requestHeaders = params.get("requestHeaders");   // 自定義請求頭
const _initiator = params.get("initiator"); // referer 備用
const _title = params.get("title"); // 來源網頁標題
const _fileName = params.get("filename");   // 自定義檔名
let tsAddArg = params.get("tsAddArg");  // 自定義 切片參數
let autoReferer = params.get("autoReferer");    // 是否已經自動調整 referer
const tabId = parseInt(params.get("tabid"));    // 資源所在的標籤頁ID 用來獲取金鑰
const key = params.get("key");  // 自定義金鑰
let autoDown = params.get("autoDown");  //是否自動下載
const autoClose = params.get("autoClose");  // 下載完是否關閉頁面

let currentTabId = 0;   // 本頁面tab Id
let currentIndex = 0;   // 本頁面Index

/*
*   popup 合併多個m3u8 需要提交以下參數 ffmpeg才能判斷檔案是否新增完畢
*   _ffmpeg 參數為ffmpeg動作 例如: "merge"為合併
*   _quantity: m3u8數量
*   _taskId: 唯一任務ID
**/
const _ffmpeg = params.get("ffmpeg");   // 是否發送到 ffmpeg
const _quantity = params.get("quantity");   // 同時下載的總數
const _taskId = params.get("taskId");   // 任務id

let isSendFfmpeg = false;   // 是否發送到ffmpeg

// 修改目前標籤下的所有xhr的Referer 修改完成 執行init函式
const requestHeaders = JSONparse(_requestHeaders);
// 目前資源數據
let _data = {
    url: _m3u8Url,
    title: _title ?? "NULL",
};
setRequestHeaders(requestHeaders, () => {
    chrome.tabs.getCurrent(function (tab) {
        currentIndex = tab.index;
        currentTabId = tab.id;
        if (tabId && tabId != -1) {
            chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getData", tabId: tabId }, (data) => {
                if (chrome.runtime.lastError) {
                    awaitG(init);
                    return;
                }
                if (data) {
                    data = data.find(item => item.url == _m3u8Url);
                    _data = data ?? _data;
                }
                awaitG(init);
            });
        } else {
            awaitG(init);
        }
    });
});

// 預設設定
const allOption = {
    addParam: false,
    fold: true,
    m3u8dlRE: false,
};
let _m3u8Content;   // 儲存m3u8檔案內容
/* m3u8 解析工具 */
const hls = new Hls({
    enableWorker: false,
    debug: false
});  // hls.js 對像
const _fragments = []; // 儲存切片對像
const keyContent = new Map(); // 儲存key的內容
const initData = new Map(); // 儲存map的url
const decryptor = new AESDecryptor(); // 解密工具 來自hls.js 分離出來的
let skipDecrypt = false; // 是否跳過解密
let possibleKeys = new Set();   // 儲存疑似 金鑰
let downId = 0; // chrome下載api 回撥id
let currentLevel = -1;  // 目前Level

/* 以下參數 新下載器已棄用 */
let stopDownload = false; // 停止下載flag
let downDuration = 0; // 下載媒體得時長
let downSize = 0;
let downCurrentTs = 0;    // 目前進度
let downTotalTs = 0;  // 需要下載的檔案數量
let tsBuffer = []; // ts內容快取
const errorTsList = []; // 下載錯誤ts序號列表

let fileStream = undefined; // 流式下載檔案輸出流
const downSet = {};   // 下載時 儲存設定

/* 錄製相關 */
let recorder = false; // 開關
let recorderIndex = 0;  // 下載索引 新下載器已棄用
let recorderLast = "";  // 最後下載的url

/* mp4 轉碼工具 */
let transmuxer = undefined;
let transmuxerStatus = false;   // 新下載器已棄用
let transmuxerheadEncode = undefined;   // 新下載器已棄用
/* DOM */
const $fileSize = $("#fileSize");   // 下載檔案大小 進度
const $progress = $("#progress");   // 下載進度
const $fileDuration = $("#fileDuration");   // 下載總時長
const $m3u8dlArg = $("#m3u8dlArg"); // m3u8DL 參數
// let pageDOM = null; // m3u8 來源頁面DOM 用於標籤系統${pageDOM}
const $media_file = $("#media_file");   // 切片列表

/**
 * 初始化函式，界面預設配置 loadSource載入 m3u8 url
 */
function init() {
    // 獲取頁面DOM
    if (tabId && tabId != -1) {
        chrome.tabs.sendMessage(parseInt(tabId), { Message: "getPage" }, { frameId: 0 }, function (result) {
            if (chrome.runtime.lastError) { return; }
            _data.pageDOM = new DOMParser().parseFromString(result, 'text/html');
        });
    }
    // 自定義CSS
    $(`<style>${G.css}</style>`).appendTo("head");

    // 隱藏firefox 不支援的功能
    G.isFirefox && $(".firefoxHide").each(function () { $(this).hide(); });

    // 讀取本地配置並裝載
    chrome.storage.local.get(allOption, function (items) {
        for (let key in items) {
            if (key == "fold") {
                items[key] ? $("details").attr("open", "") : $("details").removeAttr("open");
                continue;
            }
            const $dom = $(`#${key}`);
            $dom.length && $dom.prop("checked", items[key]);
        }
    });

    // 轉載預設配置
    $("#thread").val(G.M3u8Thread);
    $("#mp4").prop("checked", G.M3u8Mp4);
    $("#onlyAudio").prop("checked", G.M3u8OnlyAudio);
    $("#skipDecrypt").prop("checked", G.M3u8SkipDecrypt);
    $("#StreamSaver").prop("checked", G.M3u8StreamSaver);
    $("#ffmpeg").prop("checked", G.M3u8Ffmpeg);
    $("#autoClose").prop("checked", autoClose ? true : G.M3u8AutoClose);

    // 存在金鑰參數 自動填寫金鑰
    key && $("#customKey").val(key);

    // 解碼 切片URL參數
    if (tsAddArg != null) {
        tsAddArg = decodeURIComponent(tsAddArg);
        $("#tsAddArg").html(i18n.restoreGetParameters);
    }

    if (isEmpty(_m3u8Url)) {
        $("#loading").hide(); $("#m3u8Custom").show();

        // 批量產生切片鏈接
        $("#generateUrls").change(async function () {
            // 請求頭
            const referer = $("#referer").val().trim();
            if (referer) {
                if (referer.startsWith("http")) {
                    setRequestHeaders({ referer: referer });
                } else {
                    setRequestHeaders(JSONparse(referer));
                }
            }

            const rangePattern = /\$\{range:(\d+)-(\d+|\?),?(\d+)?\}/;
            const text = $(this).val();
            const match = text.match(rangePattern);
            if (match) {
                const start = parseInt(match[1]);
                let end = match[2];
                const padding = match[3] ? parseInt(match[3]) : 0;
                const urls = [];
                $("#m3u8Text").val(i18n.loadingData);

                // 如果end是 ? 使用fetch一直請求直到錯誤
                if (end === "?") {
                    let i = start;
                    while (true) {
                        let number = i.toString();
                        if (padding > 0) {
                            number = number.padStart(padding, '0');
                        }
                        const url = text.replace(rangePattern, number);
                        try {
                            const response = await fetch(url, { method: 'HEAD' });
                            if (!response.ok) {
                                break;
                            }
                            urls.push(url);
                        } catch (error) { break; }

                        i++;
                        // 防止死循環 最大9999個
                        if (urls.length >= 9999) { break; }
                    }
                } else {
                    end = parseInt(end);
                    for (let i = start; i <= end; i++) {
                        let number = i.toString();
                        if (padding > 0) {
                            number = number.padStart(padding, '0');
                        }
                        urls.push(text.replace(rangePattern, number));
                    }
                }

                urls.length && $("#m3u8Text").val(urls.join("\n\n"));
            }
        });
        $("#parse").click(function () {
            let m3u8Text = $("#m3u8Text").val().trim();
            let baseUrl = $("#baseUrl").val().trim();
            let m3u8Url = $("#m3u8Url").val().trim();
            let referer = $("#referer").val().trim();
            if (m3u8Url != "") {
                let url = "m3u8.html?url=" + encodeURIComponent(m3u8Url);
                if (referer) {
                    if (referer.startsWith("http")) {
                        url += "&requestHeaders=" + encodeURIComponent(JSON.stringify({ referer: referer }));
                    } else {
                        url += "&requestHeaders=" + encodeURIComponent(referer);
                    }
                }
                chrome.tabs.update({ url: url });
                return;
            }
            if (referer) {
                if (referer.startsWith("http")) {
                    data[0].requestHeaders = { referer: referer };
                } else {
                    data[0].requestHeaders = JSONparse(referer);
                }
            }
            if (!m3u8Text.includes("#EXTM3U")) {
                // ts列表鏈接 轉 m3u8
                const tsList = m3u8Text.split("\n");
                m3u8Text = "#EXTM3U\n";
                m3u8Text += "#EXT-X-TARGETDURATION:233\n";
                for (let ts of tsList) {
                    if (ts) {
                        m3u8Text += "#EXTINF:1\n";
                        m3u8Text += ts + "\n";
                    }
                }
                m3u8Text += "#EXT-X-ENDLIST";
            }
            if (baseUrl != "") {
                m3u8Text = addBashUrl(baseUrl, m3u8Text);
            }
            _m3u8Url = URL.createObjectURL(new Blob([new TextEncoder("utf-8").encode(m3u8Text)]));
            hls.loadSource(_m3u8Url);
            $("#m3u8Custom").hide();
        });
        // 從mpd解析器讀取數據
        const getId = parseInt(params.get("getId"));
        if (getId) {
            chrome.tabs.sendMessage(getId, "getM3u8", function (result) {
                $("#m3u8Text").val(result.m3u8Content);
                $("#parse").click();
                $("#info").html(result.mediaInfo);
            });
        }
    } else {
        hls.loadSource(_m3u8Url);
    }

    G.saveAs && $("#saveAs").prop("checked", true);
}

// 監聽 MANIFEST_LOADED 裝載解析的m3u8 URL
hls.on(Hls.Events.MANIFEST_LOADED, function (event, data) {
    $("#m3u8_url").attr("href", data.url).html(data.url);
});

// 監聽 MANIFEST_PARSED m3u8解析完成
hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
    // console.log(data);
    $("#m3u8").show(); $("#loading").hide();
    const more = (data.levels.length + data.audioTracks.length + data.subtitleTracks.length >= 2);

    // 多個視訊
    if (more && data.levels.length) {
        $("#more_m3u8").show();
        for (let item of data.levels) {
            let [name, url] = getNewUrl(item);
            const html = $(`<div class="block">
                    <div>${item.attrs.RESOLUTION ? i18n.resolution + ":" + item.attrs.RESOLUTION : ""}${item.attrs.BANDWIDTH ? " | " + i18n.bitrate + ":" + (parseInt(item.attrs.BANDWIDTH / 1000) + " Kbps") : ""}</div>
                    <a href="${url}">${name}</a>
                    <button id="parser" type="button">${i18n.parser}</button>
                    <button class="sendFfmpeg" type="button">${i18n.sendFfmpeg}</button>
                </div>`);
            html.find(".sendFfmpeg").click(function () {
                let newUrl = url + `&autoDown=1`;
                newUrl += `&ffmpeg=addFile`;
                chrome.tabs.create({ url: newUrl, index: currentIndex + 1, active: false });
            });
            html.find("#parser").click(function () {
                chrome.tabs.update({ url: url });
            });
            $("#next_m3u8").append(html);
        }
    }
    // 多個音訊
    if (more && data.audioTracks.length) {
        $("#more_audio").show();
        for (let item of data.audioTracks) {
            // 音訊資訊沒有m3u8檔案 使用groupId去尋找
            if (item.url == "") {
                let groupId = item.groupId;
                for (let item2 of data.levels) {
                    if (item2.audioGroupIds.includes(groupId)) {
                        item.url = item2.uri;
                        break;
                    }
                }
            }
            let [name, url] = getNewUrl(item);
            const html = $(`<div class="block">
                    <div>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""} | ${item.groupId ? item.groupId : ""}</div>
                    <a href="${url}">${name}</a>
                    <button id="parser" type="button">${i18n.parser}</button>
                    <button class="sendFfmpeg" type="button">${i18n.sendFfmpeg}</button>
                </div>`);
            html.find(".sendFfmpeg").click(function () {
                let newUrl = url + `&autoDown=1`;
                newUrl += `&ffmpeg=addFile`;
                chrome.tabs.create({ url: newUrl, index: currentIndex + 1, active: false });
            });
            html.find("#parser").click(function () {
                chrome.tabs.update({ url: url });
            });
            $("#next_audio").append(html);
        }
    }
    // 多個字幕
    if (more && data.subtitleTracks.length) {
        $("#more_subtitle").show();
        for (let item of data.subtitleTracks) {
            const [name, url] = getNewUrl(item);
            const html = `<div class="block">
                    <div>${item.name ? item.name : ""} | ${item.lang ? item.lang : ""}</div>
                    <a href="${url}">${name}</a>
                </div>`;
            $("#next_subtitle").append(html);
        }
    }
    // 有下一級m3u8 停止解析
    if (more) {
        autoDown && highlight();
        $("#m3u8").hide();
        // $("button").hide();
        return;
    }
    function getNewUrl(item) {
        const url = encodeURIComponent(item.uri ?? item.url);
        const referer = requestHeaders.referer ? "&requestHeaders=" + encodeURIComponent(JSON.stringify(requestHeaders)) : "&initiator=" + (_initiator ? encodeURIComponent(_initiator) : "");
        const title = _title ? encodeURIComponent(_title) : "";
        const name = GetFile(item.uri ?? item.url);
        let newUrl = `/m3u8.html?url=${url}${referer}`;
        if (title) { newUrl += `&title=${title}`; }
        if (tabId) { newUrl += `&tabid=${tabId}`; }
        if (key) { newUrl += `&key=${key}`; }
        return [name, newUrl];
    }
});

// 監聽 LEVEL_LOADED 所有切片載入完成
hls.on(Hls.Events.LEVEL_LOADED, function (event, data) {
    // console.log(data);
    parseTs(data.details);  // 提取Ts鏈接
    // 獲取視訊資訊
    if ($(".videoInfo #info").html() == "") {
        const video = document.createElement("video");
        video.muted = true;
        video.autoplay = false;
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            video.play();
        });
        video.oncanplay = function () {
            hls.detachMedia(video);
            video.remove();
        }
        delete video;
    }
    currentLevel = data.level;
});

// 監聽 ERROR m3u8解析錯誤
hls.on(Hls.Events.ERROR, function (event, data) {
    autoDown && highlight();
    console.log(data);
    if (data.details == "bufferStalledError") {
        hls.stopLoad();
    }
    if (data.type == "mediaError" && data.details == "fragParsingError") {
        if (data.error.message == "No ADTS header found in AAC PES") {
            $("#tips").append("<b>" + i18n.ADTSerror + "</b>");
            hls.stopLoad();
        }
        if (data.error.message == "Unsupported HEVC in M2TS found") {
            $("#mp4").prop("checked", false);
            $(".videoInfo #info").html("<b>" + i18n.hevcTip + "</b>");
            hls.skipTheError = true;
        }
        $("#play").hide();
        return;
    }
    if (data.type == "otherError" && data.error.message.includes("remux") && hls.skipTheError) {
        return;
    }
    $("#loading").show();
    $("#loading .optionBox").html(`${i18n.m3u8Error}<button id="setRequestHeadersError">${i18n.setRequestHeaders}</button>`);

    // 出錯 如果正在錄製中 自動點選下載錄製按鈕
    if (recorder) {
        $("#recorder").click();
        autoReferer = true;
        return;
    }

    // 嘗試新增 / 刪除請求頭
    if (data.type == "networkError" && data.details != "keyLoadError") {
        if (requestHeaders.referer) {
            params.delete("requestHeaders");
        } else if (_initiator) {
            params.delete("requestHeaders");
            let origin = null;
            try { origin = new URL(_initiator).origin; } catch (e) { }
            params.append("requestHeaders", JSON.stringify({ "referer": _initiator, "origin": origin ?? _initiator }));
        }
        const href = window.location.origin + window.location.pathname + "?" + params.toString();
        if (!autoReferer && window.location.href != href) {
            window.location.href = href + "&autoReferer=1";
        }
    }
});

// 監聽 BUFFER_CREATED 獲得第一個切片數據
hls.on(Hls.Events.BUFFER_CREATED, function (event, data) {
    // console.log(data);
    const info = $(".videoInfo #info");
    if (data.tracks && info.html() == "") {
        if (data.tracks.audiovideo) {
            if (data.tracks.audiovideo?.metadata) {
                info.append(` ${i18n.resolution}:${data.tracks.audiovideo.metadata.width} x ${data.tracks.audiovideo.metadata.height}`);
            }
            return;
        }
        !data.tracks.audio && info.append(` (${i18n.noAudio})`);
        if (data.tracks.video?.metadata) {
            info.append(` ${i18n.resolution}:${data.tracks.video.metadata.width} x ${data.tracks.video.metadata.height}`);
        }
        if (hls.levels[currentLevel]?.bitrate) {
            info.append(` ${i18n.bitrate}:${parseInt(hls.levels[currentLevel].bitrate / 1000)} Kbps`);
        }
    }
});

/* 來自 監聽 LEVEL_LOADED 提取所有ts鏈接 進一步處理 */
function parseTs(data) {
    // console.log(data);
    let isEncrypted = false;
    _fragments.splice(0);   // 清空 防止直播HLS無限新增
    /* 獲取 m3u8檔案原始內容 MANIFEST_PARSED也能獲取但偶爾會為空(BUG?) 放在LEVEL_LOADED獲取更安全*/
    _m3u8Content = data.m3u8;

    // #EXT-X-DISCONTINUITY
    let discontinuity = { start: 0, cc: 0 };
    data.endCC && $("#cc").show();
    for (let i in data.fragments) {
        i = parseInt(i);
        /*
        * 少部分網站下載ts必須帶有參數才能正常下載
        * 新增m3u8地址的參數
        */
        if (tsAddArg != null) {
            const arg = new RegExp("([^?]*)").exec(data.fragments[i].url);
            if (arg && arg[0]) {
                data.fragments[i].url = arg[0] + (tsAddArg ? "?" + tsAddArg : "");
            }
        }
        /* 
        * 檢視是否加密 下載key
        * firefox CSP政策不允許在script-src 使用blob 不能直接呼叫hls.js下載好的金鑰
        */
        if (data.fragments[i].encrypted && data.fragments[i].decryptdata) {
            isEncrypted = true;
            // 填入key內容
            Object.defineProperty(data.fragments[i].decryptdata, "keyContent", {
                get: function () { return keyContent.get(this.uri); },
                configurable: true
            });
            // 如果不存在key 開始下載
            if (!keyContent.get(data.fragments[i].decryptdata.uri)) {
                // 佔位 等待fetch獲取key
                keyContent.set(data.fragments[i].decryptdata.uri, true);
                // 下載key
                fetch(data.fragments[i].decryptdata.uri)
                    .then(response => response.arrayBuffer())
                    .then(function (buffer) {
                        if (buffer.byteLength == 16) {
                            keyContent.set(data.fragments[i].decryptdata.uri, buffer); // 儲存金鑰
                            showKeyInfo(buffer, data.fragments[i].decryptdata, i);
                            autoMerge();
                            return;
                        }
                        showKeyInfo(false, data.fragments[i].decryptdata, i);
                    })
                    .catch(function (error) {
                        console.log(error);
                        showKeyInfo(false, data.fragments[i].decryptdata, i);
                    });
            }
        }
        // 處理 #EXT-X-MAP 標籤
        let initSegment = null;
        if (data.fragments[i].initSegment && !initData.get(data.fragments[i].initSegment.url)) {
            initSegment = data.fragments[i].initSegment;
            initData.set(data.fragments[i].initSegment.url, true);
            fetch(data.fragments[i].initSegment.url)
                .then(response => response.arrayBuffer())
                .then(function (buffer) {
                    initData.set(data.fragments[i].initSegment.url, buffer);
                    autoMerge();
                }).catch(function (error) { console.log(error); });
            $("#tips").append('EXT-X-MAP: <input type="text" class="keyUrl" value="' + data.fragments[i].initSegment.url + '" spellcheck="false" readonly="readonly">');
        }
        if (data.live && data.fragments[i].initSegment && tsBuffer.length == 0) {
            initSegment = data.fragments[i].initSegment;
        }

        // #EXT-X-DISCONTINUITY
        if (i === data.fragments.length - 1 || data.fragments[i].cc !== data.fragments[i + 1].cc) {
            $('#cc').append(`<option value="${+discontinuity.start + 1}-${i + 1}">playlist: ${data.fragments[i].cc}</option>`);
            discontinuity.start = i + 1;
        }
        _fragments.push({
            url: data.fragments[i].url,
            decryptdata: data.fragments[i].decryptdata,
            encrypted: data.fragments[i].encrypted,
            duration: data.fragments[i].duration,
            initSegment: initSegment,
            sn: data.fragments[i].sn,
            cc: data.fragments[i].cc,
        });
    }

    // 錄製直播
    /* 直播是持續更新的m3u8 recorderLast儲存下載的最後一個url 以便下次更新時判斷從哪個切片開始繼續下載 */
    if (recorder) {
        if ($("#test").prop("checked")) {
            let indexLast = _fragments.findIndex((fragment) => {
                return fragment.url == recorderLast;
            });
            recorderLast = _fragments[_fragments.length - 1].url;
            downloadNew(indexLast + 1);
        } else {
            let indexLast = -1;
            for (let index = 0; index < _fragments.length; index++) {
                if (_fragments[index].url == recorderLast) {
                    indexLast = index;
                    break;
                }
            }
            recorderLast = _fragments[_fragments.length - 1].url;
            fileStream ? streamDownload(indexLast + 1) : downloadTs(indexLast + 1);
        }
    }

    writeText(_fragments);   // 寫入ts鏈接到textarea
    $("#count").append(i18n("m3u8Info", [_fragments.length, secToTime(data.totalduration)]));

    isEncrypted && $("#count").append(` (${i18n.encryptedHLS})`);
    if (_m3u8Content.includes("#EXT-X-KEY:METHOD=SAMPLE-AES-CTR")) {
        $("#count").append(' <b>' + i18n.encryptedSAMPLE + '</b>');
    }
    // 範圍下載所需數據
    $("#rangeStart").attr("max", _fragments.length);
    $("#rangeEnd").attr("max", _fragments.length);
    $("#rangeStart").val(1);
    $("#rangeEnd").val(_fragments.length);
    $m3u8dlArg.val(getM3u8DlArg());

    if (data.live) {
        autoDown && highlight();
        $("#recorder").show();
        $("#count").html(i18n.liveHLS);
    } else {
        $("#sendFfmpeg").show();
    }
    if (!_fragments.some(fragment => fragment.initSegment) && autoDown) {
        $("#mergeTs").click();
    }

    if (tabId && tabId != -1) {
        chrome.webNavigation.getAllFrames({ tabId: tabId }, function (frames) {
            if (!frames) { return; }
            frames.forEach(function (frame) {
                chrome.tabs.sendMessage(tabId, { Message: "getKey" }, { frameId: frame.frameId }, function (result) {
                    if (chrome.runtime.lastError || !result || result.length == 0) { return; }
                    const maybeKey = $("#maybeKey select");
                    for (let item of result) {
                        if (possibleKeys.has(item)) { continue; }
                        possibleKeys.add(item);
                        maybeKey.append(`<option value="${item}">${item}</option>`);
                    }
                    $("#maybeKey").show();
                    maybeKey.change(function () {
                        this.value != "tips" && $("#customKey").val(this.value);
                        $m3u8dlArg.val(getM3u8DlArg());
                    });
                });
            });
        });
    }
    function showKeyInfo(buffer, decryptdata, i) {
        $("#tips").append(i18n.keyAddress + ': <input type="text" value="' + decryptdata.uri + '" spellcheck="false" readonly="readonly" class="keyUrl">');
        if (buffer) {
            $("#tips").append(`
                <div class="key flex">
                    <div class="method">${i18n.encryptionAlgorithm}: <input type="text" value="${decryptdata.method ? decryptdata.method : "NONE"}" spellcheck="false" readonly="readonly"></div>
                    <div>${i18n.key}(Hex): <input type="text" value="${ArrayBufferToHexString(buffer)}" spellcheck="false" readonly="readonly"></div>
                    <div>${i18n.key}(Base64): <input type="text" value="${ArrayBufferToBase64(buffer)}" spellcheck="false" readonly="readonly"></div>
                </div>`);
        } else {
            $("#tips").append(`
                <div class="key flex">
                    <div class="method">${i18n.encryptionAlgorithm}: <input type="text" value="${decryptdata.method ? decryptdata.method : "NONE"}" spellcheck="false" readonly="readonly"></div>
                    <div>${i18n.key}(Hex): <input type="text" value="${i18n.keyDownloadFailed}" spellcheck="false" readonly="readonly"></div>
                </div>`);
        }
        // 如果是預設iv 則不顯示
        let iv = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i + 1]).toString();
        let iv2 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, i]).toString();
        let _iv = decryptdata.iv.toString();
        if (_iv != iv && _iv != iv2) {
            iv = "0x" + ArrayBufferToHexString(decryptdata.iv.buffer);
            $("#tips").append('<div class="key flex"><div>偏移量(IV): <input type="text" value="' + iv + '" spellcheck="false" readonly="readonly" class="offset"></div></div>');
        }
    }
}
/**************************** 監聽 / 按鈕繫結 ****************************/
// 標題
let progressTimer = setInterval(() => {
    if ($progress.html()) {
        document.title = $progress.html();
    }
}, 1000);
// 監聽下載事件 修改提示
chrome.downloads.onChanged.addListener(function (downloadDelta) {
    if (!downloadDelta.state) { return; }
    if (downloadDelta.state.current == "complete" && downId == downloadDelta.id) {
        $progress.html(i18n.SavePrompt);
        $("#autoClose").prop("checked") && closeTab();
    }
});
// 打開目錄
$(".openDir").click(function () {
    downId ? chrome.downloads.show(downId) : chrome.downloads.showDefaultFolder();
});
// 下載ts列表
$("#downText").click(function () {
    const filename = GetFileName(_m3u8Url) + '.txt';
    let text = "data:text/plain,";
    _fragments.forEach(function (item) {
        text += item.url + "\n";
    });
    if (G.isFirefox) {
        downloadDataURL(text, filename);
        return;
    }
    chrome.downloads.download({
        url: text,
        filename: filename
    });
});
// 原始m3u8
$("#originalM3U8").click(function () {
    writeText(_m3u8Content);
});
// 提取ts
$("#getTs").click(function () {
    writeText(_fragments);
});
//把遠端檔案替換成本地檔案
$("#localFile").click(function () {
    writeText("");
    let textarea = "";
    let m3u8_split = _m3u8Content.split("\n");
    for (let key in m3u8_split) {
        if (isEmpty(m3u8_split[key])) { continue; }
        if (m3u8_split[key].includes("URI=")) {
            let KeyURL = /URI="(.*)"/.exec(m3u8_split[key]);
            if (KeyURL && KeyURL[1]) {
                KeyURL = GetFile(KeyURL[1]);
                m3u8_split[key] = m3u8_split[key].replace(/URI="(.*)"/, 'URI="' + KeyURL + '"');
            }
        }
        if (!m3u8_split[key].includes("#")) {
            m3u8_split[key] = GetFile(m3u8_split[key]);
        }
        textarea += m3u8_split[key] + "\n";
    }
    writeText(textarea);
});
// 播放m3u8
$("#play").click(function () {
    if ($(this).data("switch") == "on") {
        $("#video").show();
        hls.attachMedia($("#video")[0]);
        $media_file.hide();
        $("#downList").hide();
        $(this).html(i18n.close).data("switch", "off");
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            video.play();
        });
        return;
    }
    $("#video").hide();
    hls.detachMedia($("#video")[0]);
    $media_file.show();
    $(this).html(i18n.play).data("switch", "on");
});
// 呼叫m3u8DL下載
$("#m3u8DL").click(function () {
    if (_m3u8Url.startsWith("blob:")) {
        alert(i18n.blobM3u8DLError);
        return;
    }
    const m3u8dlArg = getM3u8DlArg();
    $m3u8dlArg.val(m3u8dlArg);
    navigator.clipboard.writeText(m3u8dlArg);
    const m3u8dl = 'm3u8dl:' + (G.m3u8dl == 1 ? Base64.encode(m3u8dlArg) : m3u8dlArg);
    if (m3u8dl.length >= 2046) {
        alert(i18n.M3U8DLparameterLong);
    }
    chrome.tabs.update({ url: m3u8dl });
});
// 呼叫自定義協議
$("#invoke").click(function () {
    const url = getTemplates(G.invokeText);
    chrome.tabs.update({ url: url });
});
// 複製m3u8DL命令
$("#copyM3U8dl").click(function () {
    const m3u8dlArg = getM3u8DlArg();
    $m3u8dlArg.val(m3u8dlArg);
    navigator.clipboard.writeText(m3u8dlArg);
});
// 顯示m3u8DL命令
$("#setM3u8dl").click(function () {
    $m3u8dlArg.val(getM3u8DlArg());
    $m3u8dlArg.slideToggle();
});
// 設定載入參數
$("#addParam").click(function () {
    $m3u8dlArg.val(getM3u8DlArg());
});
$("input").click(function () {
    $m3u8dlArg.val(getM3u8DlArg());
});
$("input").keyup(function () {
    $m3u8dlArg.val(getM3u8DlArg());
});
// 只要音訊
$("#onlyAudio").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    if ($(this).prop("checked") && !$("#mp4").prop("checked") && !$("#ffmpeg").prop("checked")) {
        $("#mp4").click();
    }
});
$("#mp4").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    $("#ffmpeg").prop("checked") && $("#ffmpeg").click();
    if (!$(this).prop("checked") && !$("#ffmpeg").prop("checked") && $("#onlyAudio").prop("checked")) {
        $("#onlyAudio").click();
    }
});
$("#StreamSaver").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    if ($(this).prop("checked")) {
        $progress.html(`<b>${i18n.streamSaverTip}</b>`);
        $("#ffmpeg").prop("checked") && $("#ffmpeg").click();
        $("#saveAs").prop("checked", false);
    }
});
$("#ffmpeg").on("change", function () {
    if (transmuxer) {
        $(this).prop("checked", !$(this).prop("checked"));
        alert(i18n.runningCannotChangeSettings);
        return;
    }
    if ($(this).prop("checked")) {
        $("#mp4").prop("checked", false);
        $("#StreamSaver").prop("checked", false);
        $("#saveAs").prop("checked", false);
    }
});
// 範圍 執行緒數 滾輪調節
let debounce2 = undefined;
$("#rangeStart, #rangeEnd, #thread").on("wheel", function (event) {
    $(this).blur();
    let number = $(this).val();
    number = parseInt(number ? number : 1);
    number = event.originalEvent.wheelDelta < 0 ? number - 1 : number + 1;
    if (number < 1 || number > $(this).attr("max")) {
        return false;
    }
    $(this).val(number);
    $m3u8dlArg.val(getM3u8DlArg());
    if (this.id == "thread") {
        clearTimeout(debounce2);
        debounce2 = setTimeout(() => {
            chrome.storage.local.set({ thread: number });
        }, 500);
    }
    return false;
});
$("#rangeStart, #rangeEnd, #thread").keyup(function () {
    if ($(this).val() == '') {
        switch (this.id) {
            case 'rangeStart':
                $(this).val(1);
                break;
            case 'rangeEnd':
                $(this).val(_fragments.length);
                break;
            case 'thread':
                $(this).val(32);
                break;
        }
    }
});
// 儲存設定
$("#addParam").on("change", function () {
    allOption.addParam = $("#addParam").prop("checked");
    chrome.storage.local.set(allOption);
});
// 上傳key
$("#uploadKeyFile").change(function () {
    let fileReader = new FileReader();
    fileReader.onload = function () {
        if (this.result.byteLength != 16) {
            $progress.html(`<b>${i18n.incorrectKey}</b>`);
            return;
        }
        $("#customKey").val(ArrayBufferToBase64(this.result));
        $m3u8dlArg.val(getM3u8DlArg());
    };
    let file = $("#uploadKeyFile").prop('files')[0];
    fileReader.readAsArrayBuffer(file);
});
$("#uploadKey").click(function () {
    $("#uploadKeyFile").click();
});
// 錄製直播
$("#recorder").click(function () {
    if ($(this).data("switch") == "on") {
        initDownload(); // 初始化下載變數
        recorder = true;

        // 測試功能 錄製模式必須開啟流式下載
        if ($("#test").prop("checked")) {
            $("#StreamSaver").prop("checked", true);
        }

        // 流式下載
        if ($("#StreamSaver").prop("checked")) {
            fileStream = createStreamSaver(_fragments[0].url);
        }

        $(this).html(fileStream ? i18n.stopDownload : i18n.download).data("switch", "off");
        $progress.html(i18n.waitingForLiveData);
        return;
    }
    stopDownload = i18n.stopRecording;
    recorder = false;
    $(this).html(i18n.recordLive).data("switch", "on");
    if (fileStream) {
        fileStream.close();
        buttonState("#mergeTs", true);
        initDownload();
        $progress.html(stopDownload);
        return true;
    }
    mergeTs();
});
// 線上下載合併ts
$("#mergeTs").click(async function () {
    initDownload(); // 初始化下載變數
    // 設定起始序號
    let start = $("#rangeStart").val();
    if (start.includes(":")) {
        start = timeToIndex(start);
    } else {
        start = parseInt(start);
        start = start ? start - 1 : 0;
    }
    // 設定結束序號
    let end = $("#rangeEnd").val();
    if (end.includes(":")) {
        end = timeToIndex(end);
    } else {
        end = parseInt(end);
        end = end ? end - 1 : _fragments.length - 1;
    }
    // 檢查序號
    if (start == -1 || end == -1) {
        $progress.html(`<b>${i18n.sNumError}</b>`);
        return;
    }
    if (start > end) {
        $progress.html(`<b>${i18n.startGTend}</b>`);
        return;
    }
    if (start > _fragments.length - 1 || end > _fragments.length - 1) {
        $progress.html(`<b>${i18n("sNumMax", _fragments.length)}</b>`);
        return;
    }
    /* 設定自定義金鑰和IV */
    let customKey = $("#customKey").val().trim();
    if (customKey) {
        if (isHexKey(customKey)) {
            customKey = HexStringToArrayBuffer(customKey);
        } else if (customKey.length == 24 && customKey.slice(-2) == "==") {
            customKey = Base64ToArrayBuffer(customKey);
            // console.log(customKey);
        } else if (/^http[s]*:\/\/.+/i.test(customKey)) {
            let flag = false;
            await $.ajax({
                url: customKey,
                xhrFields: { responseType: "arraybuffer" }
            }).fail(function () {
                flag = true;
            }).done(function (responseData) {
                customKey = responseData;
                $("#customKey").val(ArrayBufferToBase64(customKey));
                $m3u8dlArg.val(getM3u8DlArg());
            });
            if (flag) {
                $progress.html(`<b>${i18n.keyDownloadFailed}</b>`);
                return;
            }
        } else {
            $progress.html(`<b>${i18n.incorrectKey}</b>`);
            return;
        }
        for (let i in _fragments) {
            _fragments[i].encrypted = true;
            _fragments[i].decryptdata = {};
            if (!keyContent.get("customKey")) {
                keyContent.set("customKey", true);
            }
            Object.defineProperty(_fragments[i].decryptdata, "keyContent", {
                get: function () { return keyContent.get("customKey"); },
                configurable: true
            });
        }
        keyContent.forEach(function (value, key) {
            keyContent.set(key, customKey);
        });
    }
    // 自定義IV
    let customIV = $("#customIV").val().trim();
    if (customIV) {
        customIV = StringToUint8Array(customIV);
        for (let i in _fragments) {
            _fragments[i].decryptdata.iv = customIV;
        }
    }
    skipDecrypt = $("#skipDecrypt").prop("checked");    // 是否跳過解密
    downTotalTs = end - start + 1;  // 需要下載的檔案數量
    $progress.html(`${downCurrentTs}/${downTotalTs}`); // 進度顯示

    // 流式下載
    if ($("#StreamSaver").prop("checked")) {
        fileStream = createStreamSaver(_fragments[0].url);
        // streamDownload(start, end);
        $("#test").prop("checked") ? downloadNew(start, end + 1) : downloadTs(start, end);
        $("#ffmpeg").prop("checked", false);
        $("#saveAs").prop("checked", false);
        $("#stopStream").show();
        return;
    }
    $("#test").prop("checked") ? downloadNew(start, end + 1) : downloadTs(start, end);
});
// 強制下載
$("#ForceDownload").click(function () {
    !$("#test").prop("checked") && mergeTs();
});
// 停止下載流
$("#stopStream").click(function () {
    if (fileStream) {
        stopDownload = i18n.stopDownload;
        fileStream.close();
        $("#stopStream").hide();
        buttonState("#mergeTs", true);
    }
});
// 重新下載
$("#errorDownload").click(function () {
    if ($("#test").prop("checked")) { return; }
    $("#errorTsList button").each(function (index) {
        let button = this;
        setTimeout(() => {
            button.click();
        }, index * 233);
    });
});
// 新增ts 參數
$("#tsAddArg").click(function () {
    if (tsAddArg != null) {
        window.location.href = window.location.href.replace(/&tsAddArg=[^&]*/g, "");
        return;
    }
    //獲取m3u8參數
    let m3u8Arg = new RegExp("\\.m3u8\\?([^\n]*)").exec(_m3u8Url);
    if (m3u8Arg) {
        m3u8Arg = m3u8Arg[1];
    }
    const arg = window.prompt(i18n.addParameters, m3u8Arg ?? "");
    if (arg != null) {
        window.location.href += "&tsAddArg=" + encodeURIComponent(arg);
    }
});
// 下載進度
$("#downProgress").click(function () {
    $media_file.hide();
    $("#downList").show();
});
// 設定請求頭
$(document).on("click", "#setRequestHeaders, #setRequestHeadersError", function () {
    const arg = window.prompt(i18n.addParameters, JSON.stringify(requestHeaders));
    if (arg != null) {
        params.delete("requestHeaders");
        params.append("requestHeaders", arg);
        window.location.href = window.location.origin + window.location.pathname + "?" + params.toString();
    }
});

// #EXT-X-DISCONTINUITY 範圍選擇
$('#cc').change(function () {
    const range = this.value.split("-");
    $("#rangeStart").val(+range[0]);
    $("#rangeEnd").val(+range[1]);
});

// 摺疊
$("details summary").click(function () {
    allOption.fold = !$("details")[0].open;
    chrome.storage.local.set(allOption);
});

// 發送到線上ffmpeg
$("#sendFfmpeg").click(function () {
    isSendFfmpeg = true;
    $("#mergeTs").click();
});

// 找到真金鑰
$("#searchingForRealKey").click(function () {
    const keys = $('#maybeKey option').map(function () {
        return $(this).val();
    }).get();
    keys.shift();   // 刪除提示

    let iv = _fragments[0].decryptdata?.iv;
    if (!iv) {
        iv = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, _fragments[0].sn]);
    }

    const customIV = $("#customIV").val().trim();
    if (customIV) {
        iv = StringToUint8Array(customIV);
    }
    $("#searchingForRealKey").html(i18n.verifying);

    const check = (buffer) => {
        const uint8Array = new Uint8Array(buffer);
        // fmp4
        if (uint8Array[4] === 0x73 && uint8Array[5] === 0x74 && uint8Array[6] === 0x79 && uint8Array[7] === 0x70) {
            return true;
        }
        // moof
        if (uint8Array[4] === 0x6d && uint8Array[5] === 0x6f && uint8Array[6] === 0x6f && uint8Array[7] === 0x66) {
            return true;
        }
        // webm
        if (uint8Array[0] === 0x1a && uint8Array[1] === 0x45 && uint8Array[2] === 0xdf && uint8Array[3] === 0xa3) {
            return true;
        }
        // mp3 ID3
        if (uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33) {
            return true;
        }
        // mp3 (MPEG audio frame header)
        if (uint8Array[0] === 0xff && (uint8Array[1] & 0xe0) === 0xe0) {
            return true;
        }
        // aac (ADTS header)
        if (uint8Array[0] === 0xff && (uint8Array[1] & 0xf0) === 0xf0) {
            return true;
        }
        // ts
        const maxCheckLength = Math.min(188, uint8Array.length);
        for (let i = 0; i < maxCheckLength; i++) {
            if (uint8Array[i] === 0x47 && (i + 188) < uint8Array.length && uint8Array[i + 188] === 0x47) {
                return true;
            }
        }
    }
    fetch(_fragments[0].url)
        .then(response => response.arrayBuffer())
        .then(function (buffer) {
            for (let key of keys) {
                try {
                    decryptor.expandKey(Base64ToArrayBuffer(key));
                    const testBuffer = decryptor.decrypt(buffer, 0, iv.buffer, true);
                    // 檢查是否解密成功
                    if (check(testBuffer)) {
                        prompt(i18n.searchingForRealKey, key);
                        $("#searchingForRealKey").html(i18n.searchingForRealKey);
                        $("#customKey").val(key);
                        $('#maybeKey select').val(key);
                        $m3u8dlArg.val(getM3u8DlArg());
                        return;
                    }
                } catch (error) {
                    console.log(error);
                }
            };
            $("#searchingForRealKey").html(i18n.realKeyNotFound);
        }).catch(function (error) {
            $("#searchingForRealKey").html(i18n.dataFetchFailed);
            console.log(error);
        });
});



/**************************** 下載TS檔案 ****************************/
// start 開始下載的索引
// end 結束下載的索引
function downloadTs(start = 0, end = _fragments.length - 1, errorObj = undefined) {
    buttonState("#mergeTs", false);
    const _tsThread = parseInt($("#thread").val());  // 原始執行緒數量
    let tsThread = _tsThread;  // 執行緒數量
    let index = start - 1; // 目前下載的索引
    downTotalTs = errorObj ? downTotalTs : end - start + 1;  // 需要下載的檔案數量
    let fileSize = 0;
    const tsInterval = setInterval(function () {
        // 停止下載flag
        if (stopDownload) {
            clearInterval(tsInterval);
            $progress.html(stopDownload);
            return;
        }
        // 列表為空 等待執行緒數迴歸 檢查是否下載完成
        if (index == end && tsThread == _tsThread) {
            clearInterval(tsInterval);
            if (stopDownload) { return; }
            // 錯誤列表為0 下載完成
            if (errorTsList.length == 0) {
                $("#ForceDownload").hide();
                $("#errorDownload").hide();
                $("#errorTsList").hide();
                !recorder && mergeTs();  // 合併下載
                return;
            }
            $progress.html(`數據不完整... 剩餘未下載: ${errorTsList.length}`);
            return;
        }
        // 下載
        if (tsThread > 0 && index < end) {
            tsThread--;
            let currentIndex = ++index;   // 目前下載的索引
            const fragment = _fragments[currentIndex];
            if (recorder) { currentIndex = recorderIndex++; }
            const timeout = errorObj ? 0 : 60000;
            $.ajax({
                url: fragment.url,
                xhrFields: { responseType: "arraybuffer" },
                timeout: timeout
            }).fail(function () {
                // 直播 不處理下載失敗
                if (stopDownload || recorder) { return; }
                if (errorObj) {
                    errorObj.find("button").html("下載失敗...重試");
                    buttonState(errorObj.find("button"), true);
                }
                if (!errorTsList.includes(currentIndex)) {
                    errorTsList.push(currentIndex);
                    downloadTsError(currentIndex);
                }
            }).done(function (responseData) {
                if (stopDownload) { return; }
                if (errorObj) { errorObj.remove(); }
                if (errorTsList.length && errorTsList.includes(currentIndex)) {
                    errorTsList.splice(errorTsList.indexOf(currentIndex), 1);
                }
                tsBuffer[currentIndex] = tsDecrypt(responseData, currentIndex); //解密m3u8
                fileSize += tsBuffer[currentIndex].byteLength;
                $fileSize.html("已下載:" + byteToSize(fileSize));
                downDuration += fragment.duration;
                if (recorder) {
                    $fileDuration.html("錄製時長:" + secToTime(downDuration));
                    return;
                }
                downCurrentTs++;
                if (downCurrentTs == downTotalTs) {
                    $progress.html($("#mp4").prop("checked") ? `數據正在轉換格式...` : `數據正在合併...`);
                    return;
                }
                $progress.html(`${downCurrentTs}/${downTotalTs}`);
            }).always(function () {
                tsThread++;
            });
        }
    }, 10);
}

/**
 * 呼叫新下載器的方法
 * @param {number} start 下載範圍 開始索引
 * @param {number} end 下載範圍 結束索引
 */
function downloadNew(start = 0, end = _fragments.length) {

    $("#video").hide();
    hls.detachMedia($("#video")[0]);

    // 避免重複下載
    buttonState("#mergeTs", false);

    // 切片下載器
    const down = new Downloader(_fragments, parseInt($("#thread").val()));

    // 儲存切片所需 DOM 提高效能
    const itemDOM = new Map();

    // 解密函式
    down.setDecrypt(function (buffer, fragment) {
        return new Promise(function (resolve, reject) {
            // 跳過解密 錄製模式 切片不存在加密 跳過解密 直接返回
            if (skipDecrypt || recorder || !fragment.encrypted || !fragment.decryptdata) {
                if (fragment.initSegment) {
                    buffer = addInitSegmentData(buffer, fragment.initSegment);
                }
                resolve(buffer);
                return;
            }
            // 載入金鑰 開始解密
            try {
                decryptor.expandKey(fragment.decryptdata.keyContent);
                const iv = fragment.decryptdata.iv ?? new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, fragment.sn]);
                buffer = decryptor.decrypt(buffer, 0, iv.buffer, true);
            } catch (e) {
                $progress.html(i18n.decryptionError + e);
                down.stop();
                buttonState("#mergeTs", true);
                console.log(e);
                reject(e);
                return;
            }
            // 如果存在MAP切片 把MAP整合進buffer
            // MAP切片不需要解密
            if (fragment.initSegment) {
                buffer = addInitSegmentData(buffer, fragment.initSegment);
            }
            resolve(buffer);
        });
    });
    // 轉碼函式 如果存在down.mapTag 跳過轉碼
    if (downSet.mp4 && !down.mapTag) {
        let tempBuffer = null;
        let head = true;
        transmuxer = new muxjs.mp4.Transmuxer({ remux: !downSet.onlyAudio });    // mux.js 對像
        transmuxer.on('data', function (segment) {
            if (downSet.onlyAudio && segment.type != "audio") { return; }
            if (head) {
                let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
                data.set(segment.initSegment, 0);
                data.set(segment.data, segment.initSegment.byteLength);
                tempBuffer = fixFileDuration(data, down.totalDuration);
                return;
            }
            tempBuffer = segment.data;
        });
        down.setTranscode(async function (buffer, fragment) {
            head = fragment.index == 0;
            transmuxer.push(new Uint8Array(buffer));
            transmuxer.flush();
            return tempBuffer ? tempBuffer.buffer : buffer;
        });
    }
    // 下載錯誤
    down.on('downloadError', function (fragment, error) {
        $("#ForceDownload").show(); // 強制下載
        $("#errorDownload").show(); // 重下所有失敗項

        // const $dom = $(`#downItem${fragment.index}`);
        // $dom.find(".percentage").addClass('error').html(i18n.downloadFailed);
        itemDOM.get(fragment.index).percentage.addClass('error').html(i18n.downloadFailed);
        $button = itemDOM.get(fragment.index).button;
        $button.html(i18n.retryDownload).data("action", "start");
        if (down.isErrorItem(fragment)) {
            const count = parseInt($button.data("count")) + 1;
            $button.data("count", count).html(`${i18n.retryDownload}(${count})`);
        } else {
            $button.data("count", 0);
        }
    });
    // 切片下載完成
    down.on('completed', function (buffer, fragment) {
        if (recorder) {
            $progress.html(i18n.waitingForLiveData);
            downDuration += fragment.duration;
            $fileDuration.html(i18n.recordingDuration + ":" + secToTime(downDuration));
            return;
        }
        itemDOM.get(fragment.index).root.remove();
        $progress.html(`${down.success}/${down.total}`);
        $fileSize.html(i18n.downloaded + ":" + byteToSize(down.buffersize));
        $fileDuration.html(i18n.downloadedVideoLength + ":" + secToTime(down.duration));
    });
    // 全部下載完成
    down.on('allCompleted', async function (buffer) {
        if (recorder) { return; }
        if (fileStream) {
            fileStream.close();
            fileStream = undefined;
        } else {
            // if ($("#ffmpeg").prop("checked") || _ffmpeg || isSendFfmpeg) {
            //     await chrome.runtime.sendMessage({
            //         Message: "catCatchFFmpeg",
            //         action: "openFFmpeg",
            //         extra: i18n.waitingForMedia
            //     });
            // }
            mergeTsNew(down);
        }
        transmuxer?.off && transmuxer.off('data');
        transmuxer = undefined;

        $("#ForceDownload").hide(); // 強制下載
        $("#errorDownload").hide(); // 重下所有失敗項

        buttonState("#mergeTs", true);
    });
    // 單個專案下載進度
    let lastEmitted = Date.now();
    down.on('itemProgress', function (fragment, state, receivedLength, contentLength) {
        if (Date.now() - lastEmitted >= 233) {
            itemDOM.get(fragment.index).percentage.html((receivedLength / contentLength * 100).toFixed(2) + "%");
            lastEmitted = Date.now();
        }
    });
    if (fileStream) {
        down.on('sequentialPush', function (buffer) {
            fileStream.write(new Uint8Array(buffer));
        });
    }
    down.on('error', function (error) {
        console.log(error);
    });
    down.on('stop', function (fragment, error) {
        console.log(error);
    });

    // 開始下載
    down.start(start, end);

    // 單項進度
    const tempDOM = $("<div>");
    down.fragments.forEach((fragment) => {
        const html = $(`<div id="downItem${fragment.index}">
            <a href="${fragment.url}" target="_blank">${fragment.url}</a>
            <div class="itemProgress">
            <span>${i18n.downloadProgress}: </span>
            <span class="percentage">${i18n.waitDownload}</span>
            <button data-action="stop">${i18n.stopDownload}</button>
            </div>
        </div>`);

        const $button = html.find("button");

        // 儲存程序 DOM 更新下載進度提升效能
        itemDOM.set(fragment.index, {
            root: html,
            percentage: html.find(".percentage"),
            button: $button,
        });

        $button.click(function () {
            html.find(".percentage").removeClass('error');
            if ($(this).data("action") == "stop") {
                down.stop(fragment.index);
                down.downloader();  // 停止目前下載器 重新開一個下載器保持執行緒數量
                $(this).html(i18n.retryDownload).data("action", "start");
            } else {
                down.downloader(fragment);
                $(this).html(i18n.stopDownload).data("action", "stop");
            }
        });
        tempDOM.append(html);
    });
    $media_file.hide();
    $("#downList").html("").show().append(tempDOM);

    // 強制下載
    $("#ForceDownload").off("click").click(function () {
        $("#test").prop("checked") && mergeTsNew(down);
    });

    // 重新下載
    $("#errorDownload").off("click").click(function () {
        if (!$("#test").prop("checked")) { return; }
        down.errorItem.forEach(function (fragment, index) {
            const button = $(`#downItem${fragment.index} button`);
            setTimeout(() => {
                button.click();
            }, index * 233);
        });
    });
}
function addInitSegmentData(buffer, initSegment) {
    let initSegmentData = initData.get(initSegment.url);
    if (!initSegmentData && initSegment.data) {
        initSegmentData = initSegment.data.buffer;
    }
    const initLength = initSegmentData.byteLength;
    const newData = new Uint8Array(initLength + buffer.byteLength);
    newData.set(new Uint8Array(initSegmentData), 0);
    newData.set(new Uint8Array(buffer), initLength);
    return newData.buffer;
}
// 下載ts出現錯誤
function downloadTsError(index) {
    if ($("#errorTsList").is(':hidden')) {
        $("#ForceDownload").show();
        $("#errorDownload").show();
        $("#errorTsList").show();
    }
    let html = $(`<p id="errorId${index}">${_fragments[index].url} <button data-id="${index}">${i18n.retryDownload}</button></p>`);
    html.find("button").click(function () {
        buttonState(this, false);
        $(this).html(i18n.retryingDownload);
        downloadTs(index, index, html);
    });
    $('#errorTsList').append(html);
}
// 合併下載
function mergeTsNew(down) {
    $progress.html(i18n.merging);

    // 建立Blob
    const fileBlob = new Blob(down.buffer, { type: down.transcode ? "video/mp4" : "video/MP2T" });

    // 預設後綴
    let ext = (down.mapTag ? down.mapTag : down.fragments[0].url).split("/").pop();
    ext = ext.split("?").shift();
    ext = ext.split(".").pop();
    ext = ext ? ext : "ts";
    ext = down.transcode ? "mp4" : ext;

    let fileName = "";
    const customFilename = $('#customFilename').val().trim();
    if (customFilename) {
        fileName = customFilename;
    } else if (_fileName) {
        fileName = _fileName;
    } else {
        fileName = GetFileName(_m3u8Url);
    }
    // 刪除目錄
    // fileName = fileName.split("/");
    // fileName = fileName.length > 1 ? fileName.pop() : fileName.join("");
    // 刪除後綴
    let originalExt = null;
    if (/\.[a-zA-Z0-9]{1,4}$/.test(fileName)) {
        fileName = fileName.split(".");
        originalExt = fileName.pop();
        fileName = fileName.join(".");
    }
    // 發送到ffmpeg
    if ($("#ffmpeg").prop("checked") || _ffmpeg || isSendFfmpeg) {
        /**
         * 大於1.8G 不使用ffmpeg直接下載
         * chrome每個程序限制2G記憶體 處理2G視訊可能導致超過限制。1.8G是安全值。
         * firefox 不受影響
         */
        if (!G.isFirefox && fileBlob.size > G.chromeLimitSize) {
            $progress.html(i18n("fileTooLarge", ["2G"]));
            apiDownload(fileBlob, fileName, ext);
            down.destroy();
            return;
        }
        if (customFilename && originalExt) {
            fileName += "." + originalExt;
        } else if (ext != "mp4" && ext != "mp3") {
            fileName = fileName + ".mp4";
        } else {
            fileName = fileName + "." + ext;
        }
        let action = $("#onlyAudio").prop("checked") ? "onlyAudio" : "transcode";
        if (_ffmpeg) {
            action = _ffmpeg;
        }
        if (isSendFfmpeg) {
            action = "addFile";
            isSendFfmpeg = false;
        }
        const data = {
            Message: "catCatchFFmpeg",
            action: action,
            files: [{ data: G.isFirefox ? fileBlob : URL.createObjectURL(fileBlob), name: `memory${new Date().getTime()}.${ext}` }],
            title: fileName,
            output: fileName,
            name: "memory" + new Date().getTime() + "." + ext,
            active: !autoDown,
            tabId: currentTabId,
        };
        if (_quantity) {
            data.quantity = parseInt(_quantity);
        }
        if (_taskId) {
            data.taskId = _taskId;
        }
        chrome.runtime.sendMessage(data, function (response) {
            if (!chrome.runtime?.lastError && response && response == "ok") {
                $progress.html(i18n.sendFfmpeg);
                buttonState("#mergeTs", true);
                return;
            }
            apiDownload(fileBlob, fileName, ext);
            down.destroy();
            return;
        });
    } else {
        apiDownload(fileBlob, fileName, ext);
        down.destroy();
    }
}
function apiDownload(fileBlob, fileName, ext) {
    chrome.downloads.download({
        url: URL.createObjectURL(fileBlob),
        filename: fileName + "." + ext,
        saveAs: $("#saveAs").prop("checked")
    }, function (downloadId) {
        if (downloadId) {
            downId = downloadId;
            $(".openDir").show();
            buttonState("#mergeTs", true);
        } else if (chrome.runtime?.lastError?.message && chrome.runtime.lastError.message == 'Invalid filename') {
            apiDownload(fileBlob, stringModify(fileName), ext);
            return;
        }
    });
}

// 合併下載
function mergeTs() {
    if (tsBuffer.length == 0 && down.buffer.length != 0) {
        tsBuffer = down.buffer;
    }
    // 修正陣列，清理空白數據
    const _tsBuffer = [];
    for (let i = 0; i < tsBuffer.length; i++) {
        if (tsBuffer[i]) {
            _tsBuffer.push(tsBuffer[i]);
            tsBuffer[i] = undefined;
        }
        delete tsBuffer[i];
    }
    tsBuffer = [];

    // 預設下載格式
    let fileBlob = new Blob(_tsBuffer, { type: "video/MP2T" });
    let ext = _fragments[0].url.split("/").pop();
    ext = ext.split("?")[0];
    ext = ext.split(".").pop();
    ext = ext ? ext : "ts";

    // ffmpeg 轉碼
    if ($("#ffmpeg").prop("checked")) {
        if (fileBlob.size < G.chromeLimitSize) {
            chrome.runtime.sendMessage({
                Message: "catCatchFFmpeg",
                action: $("#onlyAudio").prop("checked") ? "onlyAudio" : "transcode",
                media: [{ data: G.isFirefox ? fileBlob : URL.createObjectURL(fileBlob), name: `memory${new Date().getTime()}.${ext}` }],
                title: `${GetFileName(_m3u8Url)}`,
                name: "memory" + new Date().getTime() + "." + ext
            });
            buttonState("#mergeTs", true);
            $progress.html(i18n.sendFfmpeg);
            return;
        } else {
            $progress.html(i18n("fileTooLarge", ["2G"]));
        }
    }

    /* 有初始化切片 可能是fMP4 獲取初始化切片的後綴 */
    if (_fragments[0].initSegment) {
        let name = _fragments[0].initSegment.url.split("/").pop();
        name = name.split("?")[0];
        ext = name.split(".").pop();
        ext = ext ? ext : "ts";
    }
    // 轉碼mp4
    if (downSet.mp4 && ext.toLowerCase() != "mp4") {
        let index;
        transmuxerheadEncode = false;
        /* 轉碼工具 */
        transmuxer = new muxjs.mp4.Transmuxer({ remux: !downSet.onlyAudio });    // mux.js 對像
        // 轉碼服務監聽
        transmuxer.on('data', function (segment) {
            // console.log(segment);
            if (downSet.onlyAudio && segment.type != "audio") { return; }
            // 頭部資訊
            if (!transmuxerheadEncode) {
                transmuxerheadEncode = true;
                let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
                data.set(segment.initSegment, 0);
                data.set(segment.data, segment.initSegment.byteLength);
                _tsBuffer[index] = fixFileDuration(data, downDuration);
                return;
            }
            _tsBuffer[index] = segment.data;
        });
        // 載入ts數據轉碼
        for (index in _tsBuffer) {
            transmuxer.push(new Uint8Array(_tsBuffer[index]));
            transmuxer.flush();
        }
        // 關閉監聽
        transmuxer.off('data');
        // 正確轉換 下載格式改為 mp4 
        if (transmuxerheadEncode) {
            fileBlob = new Blob(_tsBuffer, { type: "video/mp4" });
            ext = "mp4";
        }
        transmuxer = undefined;
        transmuxerheadEncode = undefined;
    }
    chrome.downloads.download({
        url: URL.createObjectURL(fileBlob),
        filename: `${GetFileName(_m3u8Url)}.${ext}`,
        saveAs: $("#saveAs").prop("checked")
    }, function (downloadId) { downId = downloadId });
    buttonState("#mergeTs", true);
    _tsBuffer.splice(0); delete _tsBuffer;
}

// 流式下載
function streamDownload(start = 0, end = _fragments.length - 1) {
    buttonState("#mergeTs", false); // 禁止下載按鈕
    const _tsThread = parseInt($("#thread").val());  // 原始執行緒數量
    let tsThread = _tsThread;  // 執行緒數量
    // 下載範圍
    const downList = [];
    for (let index = start; index <= end; index++) {
        downList.push({ url: _fragments[index].url, index: index, duration: _fragments[index].duration });
    }
    let index = 0;  // 下載指針
    let downP = 0;  // 推流指針 幫助按照順序下載
    const errorList = [];
    const downTotalTs = end - start + 1;  // 需要下載的檔案數量
    /* 轉碼工具 */
    if (downSet.mp4 && transmuxer == undefined) {
        transmuxer = new muxjs.mp4.Transmuxer({ remux: !downSet.onlyAudio });    // mux.js 對像
        transmuxer.on('data', function (segment) {
            if (downSet.onlyAudio && segment.type != "audio") { return; }
            // 頭部資訊
            if (!transmuxerheadEncode) {
                transmuxerheadEncode = true;
                const data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
                data.set(segment.initSegment, 0);
                data.set(segment.data, segment.initSegment.byteLength);
                fileStream.write(fixFileDuration(data, downDuration));
                return;
            }
            fileStream.write(segment.data);
        });
    }
    const tsInterval = setInterval(function () {
        // 停止下載flag
        if (stopDownload) {
            if (fileStream) {
                fileStream.abort();
                fileStream = undefined;
            }
            downSet.mp4 && transmuxer.off('data');
            clearInterval(tsInterval);
            $progress.html(stopDownload);
            buttonState("#mergeTs", true);
            return;
        }
        errorList.includes(downP) && downP++;
        // 推流指針位置大於總下載量 已完成下載
        // downTotalTs 從1開始 所以 判斷相等
        // 錄播不停止
        if (downP == downTotalTs) {
            clearInterval(tsInterval);
            if (!recorder) {
                setTimeout(() => {
                    fileStream.close();
                    fileStream = undefined;
                }, 1000);
                if (downSet.mp4) {
                    transmuxer.off('data');
                    transmuxer = undefined;
                }
                $progress.html(i18n.savePrompt);
                $("#stopStream").hide();
                buttonState("#mergeTs", true);
            }
            return;
        }
        // 檢查目前推流指針是否有數據
        if (downList[downP].data) {
            if (!fileStream) { clearInterval(tsInterval); return; }
            if (downSet.mp4) {
                // 如果編碼已經開始 但沒有任何headEncode 轉碼錯誤 取消
                if (transmuxerStatus && !transmuxerheadEncode) {
                    stopDownload = i18n.formatConversionError;
                    return;
                }
                transmuxerStatus = true;
                transmuxer.push(new Uint8Array(downList[downP].data));
                transmuxer.flush();
            } else {
                fileStream.write(new Uint8Array(downList[downP].data));
            }
            downList[downP].data = undefined;
            downP++;
        }
        // 下載指針超過推流指針太多(超過執行緒數) 暫停下載
        if (index - downP > _tsThread) { return; }
        // 還有執行緒數 並且下載指針小於總下載量 開啟下載
        if (tsThread > 0 && index < downTotalTs) {
            tsThread--;
            const currentIndex = index++; // 記錄目前下載指針
            $.ajax({
                url: downList[currentIndex].url,
                xhrFields: { responseType: "arraybuffer" },
                timeout: 60000
            }).fail(function (error) {
                if (stopDownload) { return; }
                errorList.push(currentIndex);
                console.error('Error:', error);
            }).done(function (buffer) {
                if (stopDownload) { return; }
                // 解密需要目前資源的總索引 downList[currentIndex].index
                downList[currentIndex].data = tsDecrypt(buffer, downList[currentIndex].index);
                if (recorder) {
                    downDuration += downList[currentIndex].duration;
                    $fileDuration.html(i18n.recordingDuration + ":" + secToTime(downDuration));
                    return;
                }
                $progress.html(`${++downCurrentTs}/${downTotalTs}`);
            }).always(function () {
                tsThread++;
            });
        }
    }, 4);
}

// ts解密
function tsDecrypt(responseData, index) {
    // 是否存在初始化切片
    if (_fragments[index] && _fragments[index].initSegment) {
        let initSegmentData = initData.get(_fragments[index].initSegment.url);
        let initLength = initSegmentData.byteLength;
        let newData = new Uint8Array(initLength + responseData.byteLength);
        newData.set(new Uint8Array(initSegmentData), 0);
        newData.set(new Uint8Array(responseData), initLength);
        responseData = newData.buffer;
    }
    if (skipDecrypt || recorder || !_fragments[index].encrypted) {
        return responseData;
    }
    try {
        decryptor.expandKey(_fragments[index].decryptdata.keyContent);
    } catch (e) {
        stopDownload = i18n.incorrectKey;
        buttonState("#mergeTs", true);
        console.log(e);
        return;
    }
    try {
        let iv = _fragments[index].decryptdata.iv ?? new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, index]);
        return decryptor.decrypt(responseData, 0, iv.buffer, true);
    } catch (e) {
        stopDownload = i18n.decryptionError;
        buttonState("#mergeTs", true);
        console.log(e);
    }
}
// 初始化下載變數
function initDownload() {
    $fileSize.html("");
    downDuration = 0;   // 初始化時長
    $fileDuration.html("");
    tsBuffer.splice(0); // 初始化一下載ts快取
    downCurrentTs = 0;  // 目前進度
    stopDownload = false; // 停止下載
    recorderIndex = 0;  // 錄製直播索引
    recorderLast = "";  // 錄製最後下載的url
    fileStream = undefined; // 流式下載 檔案流
    // 轉碼工具初始化
    transmuxer = undefined;
    transmuxerStatus = false;
    transmuxerheadEncode = undefined;
    // 避免下載中途 更改設定 暫時儲存下載配置
    downSet.mp4 = $("#mp4").prop("checked");
    downSet.onlyAudio = $("#onlyAudio").prop("checked");
}

// 流式下載
function createStreamSaver(url) {
    streamSaver.mitm = G.streamSaverConfig.url;
    const ext = $("#mp4").prop("checked") ? "mp4" : GetExt(url);
    return streamSaver.createWriteStream(`${GetFileName(url)}.${ext}`).getWriter();
}
window.addEventListener('beforeunload', function () {
    fileStream && fileStream.abort();
});
window.onbeforeunload = function (event) {
    if (fileStream) {
        event.returnValue = i18n.streamOnbeforeunload;
    }
}
function getTemplates(text) {
    // 也許請求頭被更改
    if (Object.keys(requestHeaders).length) {
        _data.requestHeaders = { ...requestHeaders };
        _data.initiator = requestHeaders?.referer ?? _initiator;
    }
    return templates(text, _data);
}
function getM3u8DlREArg() {
    let m3u8dlArg = G.m3u8dlArg;
    const addParam = $("#addParam").prop("checked");    // 是否新增參數
    const customFilename = $("#customFilename").val().trim();   // 自定義檔名
    if (customFilename && addParam) {
        m3u8dlArg = m3u8dlArg.replace(/--save-name "[^"]+"/g, `--save-name "${customFilename}"`);
    }
    m3u8dlArg = getTemplates(m3u8dlArg);
    if (!addParam) { return m3u8dlArg; }

    // 執行緒處理
    const tsThread = $("#thread").val();  // 執行緒數量
    const threadCountRegex = /(--thread-count\s+)\d+/;
    if (m3u8dlArg.match(threadCountRegex)) {
        m3u8dlArg = m3u8dlArg.replace(threadCountRegex, `\$1${tsThread}`);
    } else {
        m3u8dlArg += ` --thread-count ${tsThread}`;
    }

    // 範圍處理
    let rangeStart = $("#rangeStart").val();
    rangeStart = rangeStart.includes(":") ? rangeStart : rangeStart - 1;
    let rangeEnd = $("#rangeEnd").val();
    rangeEnd = rangeEnd.includes(":") ? rangeEnd : rangeEnd - 1;
    if (rangeStart != 0 || rangeEnd != _fragments.length - 1) {
        m3u8dlArg += ` --custom-range "${rangeStart}-${rangeEnd}"`
    }

    // 自定義金鑰
    let customKey = $("#customKey").val().trim();  // 自定義金鑰
    if (customKey) {
        m3u8dlArg += ` --custom-hls-key "${customKey}"`;
    }

    // 自定義IV
    const customIV = $("#customIV").val();  // 自定義IV
    m3u8dlArg += customIV ? ` --custom-hls-iv "${customIV}"` : "";

    // 只要音訊
    // const onlyAudio = $("#onlyAudio").prop("checked");
    // m3u8dlArg += onlyAudio ? ` --drop-video all` : "";

    return m3u8dlArg;
}
function getM3u8DlArg() {
    if (G.m3u8dl == 2) { return getM3u8DlREArg(); }

    let m3u8dlArg = G.m3u8dlArg;
    const addParam = $("#addParam").prop("checked");
    // 自定義檔名
    const customFilename = $("#customFilename").val().trim();
    if (customFilename && addParam) {
        m3u8dlArg = m3u8dlArg.replace(/--saveName "[^"]+"/g, `--saveName "${customFilename}"`);
    }
    m3u8dlArg = getTemplates(m3u8dlArg);

    if (!addParam) { return m3u8dlArg; }

    if (m3u8dlArg.includes("--maxThreads")) {
        m3u8dlArg = m3u8dlArg.replace(/--maxThreads "?[0-9]+"?/g, "");
    }
    const tsThread = $("#thread").val();  // 執行緒數量
    m3u8dlArg += ` --maxThreads "${tsThread}"`

    let rangeStart = $("#rangeStart").val();
    rangeStart = rangeStart.includes(":") ? rangeStart : rangeStart - 1;
    let rangeEnd = $("#rangeEnd").val();
    rangeEnd = rangeEnd.includes(":") ? rangeEnd : rangeEnd - 1;
    m3u8dlArg += ` --downloadRange "${rangeStart}-${rangeEnd}"`

    let customKey = $("#customKey").val().trim();  // 自定義金鑰
    if (customKey) {
        if (isHexKey(customKey)) {
            customKey = HexStringToArrayBuffer(customKey);
            customKey = ArrayBufferToBase64(customKey);
            m3u8dlArg += ` --useKeyBase64 "${customKey}"`;
        } else if (customKey.length == 24 && customKey.slice(-2) == "==") {
            m3u8dlArg += ` --useKeyBase64 "${customKey}"`;
        }
    }
    const customIV = $("#customIV").val();  // 自定義IV
    m3u8dlArg += customIV ? ` --useKeyIV "${customIV}"` : "";
    // 只要音訊
    const onlyAudio = $("#onlyAudio").prop("checked");
    m3u8dlArg += onlyAudio ? ` --enableAudioOnly` : "";

    return m3u8dlArg;
}

/**
 * 時間格式轉為切片序號
 * @param {string} time
 * @returns {number}
 */
function timeToIndex(time) {
    let totalSeconds = time.split(":").reduce((acc, time) => 60 * acc + +time);
    return _fragments.findIndex(fragment => (totalSeconds -= fragment.duration) < 0);
}
// 寫入ts鏈接
function writeText(text) {
    $media_file.show();
    $("#downList").hide();
    if (typeof text == "object") {
        let url = [];
        for (let key in text) {
            url.push(text[key].url + "\n");
        }
        $media_file.val(url.join("\n"));
        $media_file.data("type", "link");
        return;
    }
    $media_file.val(text);
    $media_file.data("type", "m3u8");
}
// 獲取檔名
function GetFile(str) {
    str = str.split("?")[0];
    if (str.substr(0, 5) != "data:" && str.substr(0, 4) != "skd:") {
        return str.split("/").pop();
    }
    return str;
}
// 獲得不帶擴充套件的檔名
function GetFileName(url) {
    //hiaming 增加自定義名字功能
    if ($('#customFilename').val()) {
        return $('#customFilename').val().trim();
    }
    if (G.TitleName && _title) {
        if (_title.length >= 150) {
            return _title.substring(_title.length - 150);
        }
        return _title;
    }
    url = GetFile(url);
    url = url.split(".");
    url.length > 1 && url.pop();
    url = url.join(".");
    if (url.length >= 150) {
        url = url.substring(url.length - 150);
    }
    if (url.length == 0) {
        url = "NULL";
    }
    return stringModify(url);
}
// 獲取副檔名
function GetExt(url) {
    let str = url.split(".");
    if (str.length == 1) {
        return undefined;
    }
    let ext = str[str.length - 1];
    ext = ext.match(/[0-9a-zA-Z]*/);
    return ext[0].toLowerCase();
}
// 按鈕狀態
function buttonState(obj = "#mergeTs", state = true) {
    if (state) {
        $(obj).prop("disabled", false).removeClass("no-drop");
        return;
    }
    $(obj).prop("disabled", true).addClass("no-drop");
}
// ArrayBuffer 轉 16進位制字串
function ArrayBufferToHexString(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += ('00' + bytes[i].toString(16)).slice(-2);
    }
    return binary;
}
// ArrayBuffer 轉 Base64
function ArrayBufferToBase64(buffer) {
    let binary = "";
    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
// Base64 轉 ArrayBuffer
function Base64ToArrayBuffer(base64) {
    let binary_string = atob(base64);
    let len = binary_string.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
// 字串 轉 ArrayBuffer
function StringToArrayBuffer(str) {
    let bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes.buffer;
}
// 16進位制字串 轉 ArrayBuffer
function HexStringToArrayBuffer(hex) {
    let typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
        return parseInt(h, 16)
    }));
    return typedArray.buffer
}
// 字串 轉 Uint8Array
function StringToUint8Array(str) {
    str = str.replace("0x", "");
    return new Uint8Array(HexStringToArrayBuffer(str));
}
/* 修正mp4檔案顯示時長 */
function fixFileDuration(data, duration) {
    // duration = parseInt(duration);
    let mvhdBoxDuration = duration * 90000;
    function getBoxDuration(data, duration, index) {
        let boxDuration = "";
        index += 16;    // 偏移量 16 為timescale
        boxDuration += data[index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration += data[++index].toString(16);
        boxDuration = parseInt(boxDuration, 16);
        boxDuration *= duration;
        return boxDuration;
    }
    for (let i = 0; i < data.length; i++) {
        // mvhd
        if (data[i] == 0x6D && data[i + 1] == 0x76 && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            mvhdBoxDuration = getBoxDuration(data, duration, i);   // 獲得 timescale
            data[i + 11] = 0;   //刪除建立日期
            i += 20;    // mvhd 偏移20 為duration
            data[i] = (mvhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mvhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mvhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mvhdBoxDuration & 0xFF;
            continue;
        }
        // tkhd
        if (data[i] == 0x74 && data[i + 1] == 0x6B && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            i += 24;    // tkhd 偏移24 為duration
            data[i] = (mvhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mvhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mvhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mvhdBoxDuration & 0xFF;
            continue;
        }
        // mdhd
        if (data[i] == 0x6D && data[i + 1] == 0x64 && data[i + 2] == 0x68 && data[i + 3] == 0x64) {
            let mdhdBoxDuration = getBoxDuration(data, duration, i);   // 獲得 timescale
            i += 20;    // mdhd 偏移20 為duration
            data[i] = (mdhdBoxDuration & 0xFF000000) >> 24;
            data[++i] = (mdhdBoxDuration & 0xFF0000) >> 16;
            data[++i] = (mdhdBoxDuration & 0xFF00) >> 8;
            data[++i] = mdhdBoxDuration & 0xFF;
            continue;
        }
        //  mdat 之後是媒體數據 結束頭部修改
        if (data[i] == 0x6D && data[i + 1] == 0x64 && data[i + 2] == 0x61 && data[i + 3] == 0x74) {
            return data;
        }
    }
    return data;
}
function isHexKey(str) {
    return /^[0-9a-fA-F]{32}$/.test(str);
}
// m3u8檔案內容加入bashUrl
function addBashUrl(baseUrl, m3u8Text) {
    let m3u8_split = m3u8Text.split("\n");
    m3u8Text = "";
    for (let key in m3u8_split) {
        if (isEmpty(m3u8_split[key])) { continue; }
        if (m3u8_split[key].includes("URI=")) {
            let KeyURL = /URI="(.*)"/.exec(m3u8_split[key]);
            if (KeyURL && KeyURL[1] && !/^[\w]+:.+/i.test(KeyURL[1])) {
                m3u8_split[key] = m3u8_split[key].replace(/URI="(.*)"/, 'URI="' + baseUrl + KeyURL[1] + '"');
            }
        }
        if (!m3u8_split[key].includes("#") && !/^[\w]+:.+/i.test(m3u8_split[key])) {
            m3u8_split[key] = baseUrl + m3u8_split[key];
        }
        m3u8Text += m3u8_split[key] + "\n";
    }
    return m3u8Text;
}

function highlight() {
    autoDown = false;
    chrome.tabs.getCurrent(function name(params) {
        chrome.tabs.highlight({ tabs: params.index });
    });
}

let autoMergeTimer = null;
function autoMerge() {
    if (!autoDown) { return; }
    clearTimeout(autoMergeTimer);
    autoMergeTimer = setTimeout(() => {
        $("#mergeTs").click();
    }, 1000);
}

// 接收 catCatchFFmpegResult
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (!Message.Message || Message.Message != "catCatchFFmpegResult" || Message.state != "ok" || currentTabId == 0 || Message.tabId != currentTabId) { return; }
    setTimeout(() => {
        $("#autoClose").prop("checked") && closeTab();
    }, Math.ceil(Math.random() * 500));
});