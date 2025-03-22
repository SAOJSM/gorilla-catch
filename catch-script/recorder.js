(function () {
    console.log("recorder.js Start");
    if (document.getElementById("catCatchRecorder")) { return; }

    // let language = "en";
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
    CatCatch.setAttribute("id", "catCatchRecorder");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips"></div>
    <span data-i18n="selectVideo">選擇視訊</span> <select id="videoList" style="max-width: 200px;"></select>
    <span data-i18n="recordEncoding">錄製編碼</span> <select id="mimeTypeList" style="max-width: 200px;"></select>
    <label><input type="checkbox" id="ffmpeg" ${checkboxStyle}><span data-i18n="ffmpeg">使用ffmpeg轉碼</span></label>
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
        <select id="frameRate">
            <option value="0" data-i18n="frameRate">幀率</option>
            <option value="25">25 FPS</option>
            <option value="30">30 FPS</option>
            <option value="60">60 FPS</option>
            <option value="120">120 FPS</option>
        </select>
    </label>
    <div>
        <button id="getVideo" ${buttonStyle} data-i18n="readVideo">讀取視訊</button>
        <button id="start" ${buttonStyle} data-i18n="startRecording">開始錄製</button>
        <button id="stop" ${buttonStyle} data-i18n="stopRecording">停止錄製</button>
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

    const $tips = CatCatch.querySelector("#tips");
    const $videoList = CatCatch.querySelector("#videoList");
    const $mimeTypeList = CatCatch.querySelector("#mimeTypeList");
    const $start = CatCatch.querySelector("#start");
    const $stop = CatCatch.querySelector("#stop");
    let videoList = [];
    $tips.innerHTML = i18n("noVideoDetected", "沒有檢測到視訊, 請重新讀取");
    let recorder = {};
    let option = { mimeType: 'video/webm;codecs=vp9,opus' };

    CatCatch.querySelector("#hide").addEventListener('click', function (event) {
        CatCatch.style.display = "none";
    });
    CatCatch.querySelector("#close").addEventListener('click', function (event) {
        recorder?.state && recorder.stop();
        CatCatch.style.display = "none";
        window.postMessage({ action: "catCatchToBackground", Message: "script", script: "recorder.js", refresh: false });
    });

    function init() {
        getVideo();
        $start.style.display = 'inline';
        $stop.style.display = 'none';
    }
    setTimeout(init, 500);

    // #region 視訊編碼選擇
    function setMimeType() {
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
        const videoTypes = ["webm", "ogg", "mp4", "x-matroska"];
        const codecs = ["should-not-be-supported", "vp9", "vp8", "avc1", "av1", "h265", "h.265", "h264", "h.264", "opus", "pcm", "aac", "mpeg", "mp4a"];
        const supportedVideos = getSupportedMimeTypes("video", videoTypes, codecs);
        supportedVideos.forEach(function (type) {
            $mimeTypeList.options.add(new Option(type, type));
        });
        option.mimeType = supportedVideos[0];

        $mimeTypeList.addEventListener('change', function (event) {
            if (recorder && recorder.state && recorder.state === 'recording') {
                $tips.innerHTML = i18n("recordingChangeEncoding", "錄製中不能更改編碼");
                return;
            }
            if (MediaRecorder.isTypeSupported(event.target.value)) {
                option.mimeType = event.target.value;
                $tips.innerHTML = event.target.value;
            } else {
                $tips.innerHTML = i18n("formatNotSupported", "不支援此格式");
            }
        });
    }
    setMimeType();
    // #endregion 視訊編碼選擇

    // #region 獲取視訊列表
    function getVideo() {
        videoList = [];
        $videoList.options.length = 0;
        document.querySelectorAll("video, audio").forEach(function (video, index) {
            if (video.currentSrc) {
                const src = video.currentSrc.split("/").pop();
                videoList.push(video);
                $videoList.options.add(new Option(src, index));
            }
        });
        $tips.innerHTML = videoList.length ? i18n("clickToStartRecording", "請點選開始錄製") : i18n("noVideoDetected", "沒有檢測到視訊, 請重新讀取");
    }
    CatCatch.querySelector("#getVideo").addEventListener('click', getVideo);
    CatCatch.querySelector("#stop").addEventListener('click', function () {
        recorder.stop();
    });
    // #endregion 獲取視訊列表

    CatCatch.querySelector("#start").addEventListener('click', function (event) {
        if (!MediaRecorder.isTypeSupported(option.mimeType)) {
            $tips.innerHTML = i18n("formatNotSupported", "不支援此格式");
            return;
        }
        init();
        const index = $videoList.value;
        if (index && videoList[index]) {
            let stream = null;
            try {
                const frameRate = +CatCatch.querySelector("#frameRate").value;
                if (frameRate) {
                    stream = videoList[index].captureStream(frameRate);
                } else {
                    stream = videoList[index].captureStream();
                }
            } catch (e) {
                $tips.innerHTML = i18n("recordingNotSupported", "不支援錄製");
                return;
            }
            // 位元速率
            option.audioBitsPerSecond = +CatCatch.querySelector("#audioBits").value;
            option.videoBitsPerSecond = +CatCatch.querySelector("#videoBits").value;

            recorder = new MediaRecorder(stream, option);
            recorder.ondataavailable = function (event) {
                if (CatCatch.querySelector("#ffmpeg").checked) {
                    window.postMessage({
                        action: "catCatchFFmpeg",
                        use: "transcode",
                        files: [{ data: URL.createObjectURL(event.data), type: option.mimeType }],
                        title: document.title.trim()
                    });
                    $tips.innerHTML = i18n("clickToStartRecording", "請點選開始錄製");
                    return;
                }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(event.data);
                a.download = `${document.title}`;
                a.click();
                a.remove();
                $tips.innerHTML = i18n("downloadCompleted", "下載完成");;
            }
            recorder.onstart = function (event) {
                $stop.style.display = 'inline';
                $start.style.display = 'none';
                $tips.innerHTML = i18n("recording", "視訊錄製中");
            }
            recorder.onstop = function (event) {
                $tips.innerHTML = i18n("stopRecording", "停止錄製");
                init();
            }
            recorder.onerror = function (event) {
                init();
                $tips.innerHTML = i18n("recordingFailed", "錄製失敗");;
                console.log(event);
            };
            recorder.start();
            videoList[index].play();
            setTimeout(() => {
                if (recorder.state === 'recording') {
                    $stop.style.display = 'inline';
                    $start.style.display = 'none';
                    $tips.innerHTML = i18n("recording", "視訊錄製中");
                }
            }, 500);
        } else {
            $tips.innerHTML = i18n("noVideoDetected", "請確認視訊是否存在");
        }
    });

    // #region 移動邏輯
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
    // #endregion 移動邏輯

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