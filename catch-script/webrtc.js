(function () {
    console.log("webrtc.js Start");
    if (document.getElementById("catCatchWebRTC")) { return; }

    // 多語言
    let language = navigator.language.replace("-", "_");
    if (window.CatCatchI18n) {
        if (!window.CatCatchI18n.languages.includes(language)) {
            language = language.split("_")[0];
            if (!window.CatCatchI18n.languages.includes(language)) {
                language = "en";
            }
        }
    }

    const buttonStyle = 'style="border:solid 1px #000;margin:2px;padding:2px;background:#fff;border-radius:4px;border:solid 1px #c7c7c780;color:#000;"';
    const checkboxStyle = 'style="-webkit-appearance: auto;"';
    const CatCatch = document.createElement("div");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips" data-i18n="waiting">正在等待視訊流..."</div>
    <div id="time"></div>
    ${i18n("recordEncoding", "錄製編碼")}: <select id="mimeTypeList" style="max-width: 200px;"></select>
    <label><input type="checkbox" id="autoSave1"} ${checkboxStyle} data-i18n="save1hour">1小時儲存一次</label>
    <label>
        <select id="videoBits">
            <option value="2500000" data-i18n="videoBits">視訊位元速率</option>
            <option value="2500000">2.5 Mbps</option>
            <option value="5000000">5 Mbps</option>
            <option value="8000000">8 Mbps</option>
            <option value="16000000">16 Mbps</option>
        </select>
        <select id="audioBits">
            <option value="128000" data-i18n="audioBits">視訊位元速率</option>
            <option value="128000">128 kbps</option>
            <option value="256000">256 kbps</option>
        </select>
    </label>
    <div>
        <button id="start" ${buttonStyle} data-i18n="startRecording">開始錄製</button>
        <button id="stop" ${buttonStyle} data-i18n="stopRecording">停止錄製</button>
        <button id="save" ${buttonStyle} data-i18n="save">儲存</button>
        <button id="hide" ${buttonStyle} data-i18n="hide">隱藏</button>
        <button id="close" ${buttonStyle} data-i18n="close">關閉</button>
    </div>`;
    CatCatch.style = `
        position: fixed;
        z-index: 999999;
        top: 10%;
        left: 80%;
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

    // 提示
    const $tips = CatCatch.querySelector("#tips");
    const tips = (text) => {
        $tips.innerHTML = text;
    }

    // 開始 結束 按鈕切換
    const $start = CatCatch.querySelector("#start");
    const $stop = CatCatch.querySelector("#stop");
    const buttonState = (state = true) => {
        $start.style.display = state ? 'inline' : 'none';
        $stop.style.display = state ? 'none' : 'inline';
    }
    $start.style.display = 'inline';
    $stop.style.display = 'none';

    // 關閉
    CatCatch.querySelector("#close").addEventListener('click', function (event) {
        recorder?.state && recorder.stop();
        CatCatch.style.display = "none";
        window.postMessage({ action: "catCatchToBackground", Message: "script", script: "webrtc.js", refresh: true });
    });

    // 隱藏
    CatCatch.querySelector("#hide").addEventListener('click', function (event) {
        CatCatch.style.display = "none";
    });

    /* 核心變數 */
    let recorder = null;    // 錄製器
    let mediaStream = null;    // 媒體流
    let autoSave1Timer = null;    // 1小時儲存一次

    // #region 編碼選擇
    let option = { mimeType: 'video/webm;codecs=vp9,opus' };
    function getSupportedMimeTypes(media, types, codecs) {
        const supported = [];
        types.forEach((type) => {
            const mimeType = `${media}/${type}`;
            codecs.forEach((codec) => [`${mimeType};codecs=${codec}`].forEach(variation => {
                if (MediaRecorder.isTypeSupported(variation)) {
                    supported.push(variation);
                }
            }));
            if (MediaRecorder.isTypeSupported(mimeType)) {
                supported.push(mimeType);
            }
        });
        return supported;
    };
    const $mimeTypeList = CatCatch.querySelector("#mimeTypeList");
    const videoTypes = ["webm", "ogg", "mp4", "x-matroska"];
    const codecs = ["should-not-be-supported", "vp9", "vp8", "avc1", "av1", "h265", "h.265", "h264", "h.264", "opus", "pcm", "aac", "mpeg", "mp4a"];
    const supportedVideos = getSupportedMimeTypes("video", videoTypes, codecs);
    supportedVideos.forEach(function (type) {
        $mimeTypeList.options.add(new Option(type, type));
    });
    option.mimeType = supportedVideos[0];
    $mimeTypeList.addEventListener('change', function (event) {
        if (recorder && recorder.state && recorder.state === 'recording') {
            tips(i18n("recordingChangeEncoding", "錄製中不能更改編碼"));
            return;
        }
        if (MediaRecorder.isTypeSupported(event.target.value)) {
            option.mimeType = event.target.value;
            tips(`${i18n("recordEncoding", "錄製編碼")}:` + event.target.value);
        } else {
            tips(i18n("formatNotSupported", "不支援此格式"));
        }
    });
    // #endregion 編碼選擇

    // 錄製
    $time = CatCatch.querySelector("#time");
    CatCatch.querySelector("#start").addEventListener('click', function () {
        if (!mediaStream) {
            tips(i18n("streamEmpty", "媒體流為空"));
            return;
        }
        if (!mediaStream instanceof MediaStream) {
            tips(i18n("notStream", "非媒體流對像"));
            return;
        }
        let recorderTime = 0;
        let recorderTimeer = undefined;
        let chunks = [];

        // 位元速率
        option.audioBitsPerSecond = +CatCatch.querySelector("#audioBits").value;
        option.videoBitsPerSecond = +CatCatch.querySelector("#videoBits").value;

        recorder = new MediaRecorder(mediaStream, option);
        recorder.ondataavailable = event => {
            chunks.push(event.data)
        };
        recorder.onstop = () => {
            recorderTime = 0;
            clearInterval(recorderTimeer);
            clearInterval(autoSave1Timer);
            $time.innerHTML = "";
            tips(i18n("stopRecording", "已停止錄製!"));
            download(chunks);
            buttonState();
        }
        recorder.onstart = () => {
            chunks = [];
            tips(i18n("recording", "視訊錄製中"));
            $time.innerHTML = "00:00";
            recorderTimeer = setInterval(function () {
                recorderTime++;
                $time.innerHTML = secToTime(recorderTime);
            }, 1000);
            buttonState(false);
        }
        recorder.start(60000);
    });
    // 停止錄製
    CatCatch.querySelector("#stop").addEventListener('click', function () {
        if (recorder) {
            recorder.stop();
            recorder = undefined;
        }
    });
    // 儲存
    CatCatch.querySelector("#save").addEventListener('click', function () {
        if (recorder) {
            recorder.stop();
            recorder.start();
        }
    });
    // 每1小時 儲存一次
    CatCatch.querySelector("#autoSave1").addEventListener('click', function () {
        clearInterval(autoSave1Timer);
        if (CatCatch.querySelector("#autoSave1").checked) {
            autoSave1Timer = setInterval(function () {
                if (recorder) {
                    recorder.stop();
                    recorder.start();
                }
            }, 3600000);
        }
    });

    // 獲取webRTC流
    window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
        construct(target, args) {
            const pc = new target(...args);
            mediaStream = new MediaStream();
            pc.addEventListener('track', (event) => {
                const track = event.track;
                if (track.kind === 'video' || track.kind === 'audio') {
                    mediaStream.addTrack(track);
                    tips(`${track.kind} ${i18n("streamAdded", "流已新增")}`);
                    const hasVideo = mediaStream.getVideoTracks().length > 0;
                    const hasAudio = mediaStream.getAudioTracks().length > 0;
                    if (hasVideo && hasAudio) {
                        tips(i18n("videoAndAudio", "已包含音訊和視訊流"));
                    }
                }
            });
            pc.addEventListener('iceconnectionstatechange', (event) => {
                if (pc.iceConnectionState === 'disconnected' && recorder?.state === 'recording') {
                    recorder.stop();
                    tips(i18n("stopRecording", "連線已斷開，錄製已停止"));
                }
            });
            return pc;
        }
    });

    // #region 移動邏輯
    let x, y;
    const move = (event) => {
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
    // #endregion 移動邏輯

    function download(chunks) {
        const blob = new Blob(chunks, { type: option.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'recorded-video.mp4';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    // 秒轉換成時間
    function secToTime(sec) {
        let hour = (sec / 3600) | 0;
        let min = ((sec % 3600) / 60) | 0;
        sec = (sec % 60) | 0;
        let time = hour > 0 ? hour + ":" : "";
        time += min.toString().padStart(2, '0') + ":";
        time += sec.toString().padStart(2, '0');
        return time;
    }

    // 防止網頁意外關閉跳轉
    window.addEventListener('beforeunload', function (e) {
        recorder && recorder.stop();
        return true;
    });

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