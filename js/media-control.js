(function () {
    let _tabId = -1;   // 選擇的頁面ID
    let _index = -1;    //選擇的視訊索引
    let VideoTagTimer;  // 獲取所有視訊標籤的定時器
    let VideoStateTimer;  // 獲取所有視訊資訊的定時器
    let compareTab = [];
    let compareVideo = [];

    function setVideoTagTimer() {
        clearInterval(VideoTagTimer);
        VideoTagTimer = setInterval(getVideoTag, 1000);
    }
    function getVideoTag() {
        chrome.tabs.query({ windowType: "normal" }, function (tabs) {
            let videoTabList = [];
            for (let tab of tabs) {
                videoTabList.push(tab.id);
            }
            if (compareTab.toString() == videoTabList.toString()) {
                return;
            }
            compareTab = videoTabList;
            // 列出所有標籤
            for (let tab of tabs) {
                if ($("#option" + tab.id).length == 1) { continue; }
                $("#videoTabIndex").append(`<option value='${tab.id}' id="option${tab.id}">${stringModify(tab.title)}</option>`);
            }
            // 刪除沒有媒體的標籤. 非同步的原因，使用一個for去處理無法保證標籤順序一致
            for (let tab of videoTabList) {
                chrome.tabs.sendMessage(tab, { Message: "getVideoState", index: 0 }, { frameId: 0 }, function (state) {
                    if (chrome.runtime.lastError || state.count == 0) {
                        $("#option" + tab).remove();
                        return;
                    }
                    $("#videoTabTips").remove();
                    if (tab == G.tabId && _tabId == -1) {
                        _tabId = tab;
                        $("#videoTabIndex").val(tab);
                    }
                });
            }
        });
    }
    function setVideoStateTimer() {
        clearInterval(VideoStateTimer);
        VideoStateTimer = setInterval(getVideoState, 500);
    }
    function getVideoState(setSpeed = false) {
        if (_tabId == -1) {
            let currentTabId = $("#videoTabIndex").val();
            if (currentTabId == -1) { return; }
            _tabId = parseInt(currentTabId);
        }
        chrome.tabs.sendMessage(_tabId, { Message: "getVideoState", index: _index }, { frameId: 0 }, function (state) {
            if (chrome.runtime.lastError || state.count == 0) { return; }
            if (state.type == "audio") {
                $("#pip").hide();
                $("#screenshot").hide();
            }
            $("#volume").val(state.volume);
            if (state.duration && state.duration != Infinity) {
                $("#timeShow").html(secToTime(state.currentTime) + " / " + secToTime(state.duration));
                $("#time").val(state.time);
            }
            state.paused ? $("#control").html(i18n.play).data("switch", "play") : $("#control").html(i18n.pause).data("switch", "pause");
            state.speed == 1 ? $("#speed").html(i18n.speedPlayback).data("switch", "speed") : $("#speed").html(i18n.normalPlay).data("switch", "normal");
            $("#loop").prop("checked", state.loop);
            $("#muted").prop("checked", state.muted);
            if (setSpeed && state.speed != 1) {
                $("#playbackRate").val(state.speed);
            }
            if (compareVideo.toString() != state.src.toString()) {
                compareVideo = state.src;
                $("#videoIndex").empty();
                for (let i = 0; i < state.count; i++) {
                    let src = state.src[i].split("/").pop();
                    if (src.length >= 60) {
                        src = src.substr(0, 35) + '...' + src.substr(-35);
                    }
                    $("#videoIndex").append(`<option value='${i}'>${src}</option>`);
                }
            }
            _index = _index == -1 ? 0 : _index;
            $("#videoIndex").val(_index);
        });
    }
    // 點選其他設定標籤頁 開始讀取tab資訊以及視訊資訊
    getVideoTag();
    $("#otherTab").click(function () {
        chrome.tabs.get(G.mediaControl.tabid, function (tab) {
            if (chrome.runtime.lastError) {
                _tabId = -1;
                _index = -1;
                setVideoTagTimer(); getVideoState(); setVideoStateTimer();
                return;
            }
            chrome.tabs.sendMessage(G.mediaControl.tabid, { Message: "getVideoState", index: 0 }, function (state) {
                _tabId = G.mediaControl.tabid;
                if (state.count > G.mediaControl.index) {
                    _index = G.mediaControl.index;
                }
                $("#videoTabIndex").val(_tabId);
                setVideoTagTimer(); getVideoState(true); setVideoStateTimer();
                (chrome.storage.session ?? chrome.storage.local).set({ mediaControl: { tabid: _tabId, index: _index } });
            });
        });
        // setVideoTagTimer(); getVideoState(); setVideoStateTimer();
    });
    // 切換標籤選擇 切換視訊選擇
    $("#videoIndex, #videoTabIndex").change(function () {
        if (!G.isFirefox) { $("#pip").show(); }
        $("#screenshot").show();
        if (this.id == "videoTabIndex") {
            _tabId = parseInt($("#videoTabIndex").val());
        } else {
            _index = parseInt($("#videoIndex").val());
        }
        (chrome.storage.session ?? chrome.storage.local).set({ mediaControl: { tabid: _tabId, index: _index } });
        getVideoState(true);
    });
    let wheelPlaybackRateTimeout;
    $("#playbackRate").on("wheel", function (event) {
        $(this).blur();
        let speed = parseFloat($(this).val());
        speed = event.originalEvent.wheelDelta < 0 ? speed - 0.1 : speed + 0.1;
        speed = parseFloat(speed.toFixed(1));
        if (speed < 0.1 || speed > 16) { return false; }
        $(this).val(speed);
        clearTimeout(wheelPlaybackRateTimeout);
        wheelPlaybackRateTimeout = setTimeout(() => {
            chrome.storage.sync.set({ playbackRate: speed });
            chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: speed, index: _index });
        }, 200);
        return false;
    });
    // 倍速播放
    $("#speed").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        if ($(this).data("switch") == "speed") {
            const speed = parseFloat($("#playbackRate").val());
            chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: speed, index: _index });
            chrome.storage.sync.set({ playbackRate: speed });
            return;
        }
        chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: 1, index: _index });
    });
    // 畫中畫
    $("#pip").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "pip", index: _index }, function (state) {
            if (chrome.runtime.lastError) { return; }
            state.state ? $("#pip").html(i18n.exit) : $("#pip").html(i18n.pictureInPicture);
        });
    });
    // 全屏
    $("#fullScreen").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.get(_tabId, function (tab) {
            chrome.tabs.highlight({ 'tabs': tab.index }, function () {
                chrome.tabs.sendMessage(_tabId, { Message: "fullScreen", index: _index }, function (state) {
                    close();
                });
            });
        });
    });
    // 暫停 播放
    $("#control").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        const action = $(this).data("switch");
        chrome.tabs.sendMessage(_tabId, { Message: action, index: _index });
    });
    // 循環 靜音
    $("#loop, #muted").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        const action = $(this).prop("checked");
        chrome.tabs.sendMessage(_tabId, { Message: this.id, action: action, index: _index });
    });
    // 調節音量和視訊進度時 停止循環任務
    $("#volume, #time").mousedown(function () {
        if (_index < 0 || _tabId < 0) { return; }
        clearInterval(VideoStateTimer);
    });
    // 調節音量
    $("#volume").mouseup(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setVolume", volume: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    // 調節視訊進度
    $("#time").mouseup(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setTime", time: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    // 視訊截圖
    $("#screenshot").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "screenshot", index: _index });
    });
})();