class FilePreview {

    MAX_CONCURRENT = 3;   // 最大並行產生預覽數
    MAX_LIST_SIZE = 128;  // 最大檔案列表長度

    constructor() {
        this.fileItems = [];         // 檔案列表
        this.originalItems = [];     // 原始檔案列表
        this.regexFilters = null;    // 正則過濾
        this.catDownloadIsProcessing = false;   // 貓抓下載器是否正在處理
        this.pushDebounce = null;   // 新增檔案防抖
        this.alertTimer = null;     // 提示資訊定時器
        this.isDragging = false;    // 是否正在拖動
        this.previewHLS = null;     // 全屏預覽視訊HLS工具

        // 獲取tabId
        const params = new URL(location.href).searchParams;
        this._tabId = parseInt(params.get("tabId"));
        if (isNaN(this._tabId)) {
            this.alert(i18n.noData, 1500);
            return;
        }

        // 顯示範圍
        this.currentRange = params.get("range")?.split("-").map(Number);
        if (this.currentRange) {
            this.currentRange = { start: this.currentRange[0], end: this.currentRange[1] || undefined };
        }

        // 分頁
        this.currentPage = params.get("page");
        this.currentPage = this.currentPage ? parseInt(this.currentPage) : 1;

        // 初始化
        this.init();
    }
    /**
     * 初始化
     */
    async init() {
        this.tab = await chrome.tabs.getCurrent();  // 獲取目前標籤
        this.setupEventListeners();     // 設定事件監聽
        await this.loadFileItems();     // 載入數據
        this.setupExtensionFilters();   // 設定副檔名篩選
        this.renderFileItems();         // 渲染檔案列表
        this.startPreviewGeneration();  // 開始預覽產生
        this.setupSelectionBox();      // 框選
    }

    /**
     * 設定按鈕、鍵盤 、等事件監聽
     */
    setupEventListeners() {
        // 全選
        document.querySelector('#select-all').addEventListener('click', () => this.toggleSelection('all'));
        // 反選
        document.querySelector('#select-reverse').addEventListener('click', () => this.toggleSelection('reverse'));
        // 下載選中
        document.querySelector('#download-selected').addEventListener('click', () => this.downloadSelected());
        // 合併下載
        document.querySelector('#merge-download').addEventListener('click', () => this.mergeDownload());
        // 點選非視訊區域 關閉視訊
        document.querySelectorAll('.preview-container').forEach(container => {
            container.addEventListener('click', (event) => {
                if (event.target.closest('video, img')) { return; }
                this.closePreview()
            });
        });
        // 按鍵盤ESC關閉視訊
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closePreview();
                return;
            }
            // ctrl + a
            if ((event.ctrlKey || event.metaKey) && event.key === 'a' && event.target.tagName != "INPUT") {
                this.toggleSelection('all');
                event.preventDefault();
            }
        });
        // 排序按鈕
        document.querySelectorAll('.sort-options input').forEach(input => {
            input.addEventListener('change', () => this.updateFileList());
        });
        // 正則過濾 監聽回車
        document.querySelector('#regular').addEventListener('keypress', (e) => {
            if (e.keyCode == 13) {
                const value = e.target.value.trim();
                try {
                    this.regexFilters = value ? new RegExp(value) : null;
                } catch (error) {
                    this.regexFilters = null;
                    this.alert(i18n.noMatch);
                }
                this.updateFileList();
            }
        });
        // 複製
        document.querySelector('#copy-selected').addEventListener('click', () => this.copy());
        // 清理數據
        document.querySelector('#clear').addEventListener('click', (e) => {
            chrome.runtime.sendMessage({ Message: "clearData", type: true, tabId: this._tabId });
            chrome.runtime.sendMessage({ Message: "ClearIcon", type: true, tabId: this._tabId });
            this.originalItems = [];
            document.querySelector('#extensionFilters').innerHTML = '';
            this.updateFileList();
        });
        // 刪除
        document.querySelector('#delete-selected').addEventListener('click', () => this.deleteItem());
        // debug
        document.querySelector('#debug').addEventListener('click', () => console.dir(this.fileItems));
        // 顯示標題
        document.querySelector('input[name="showTitle"]').addEventListener('change', (e) => {
            this.fileItems.forEach(item => {
                item.html.querySelector('.file-title').classList.toggle('hide', !e.target.checked);
            });
            this.updateFileList();
        });
        // aria2
        if (G.enableAria2Rpc) {
            const aria2 = document.querySelector("#aria2-selected");
            aria2.classList.remove("hide");
            aria2.addEventListener('click', () => {
                this.getSelectedItems().forEach(item => this.aria2(item));
            });
        }
        // 發送
        if (G.send2localManual) {
            const send = document.querySelector("#send-selected");
            send.classList.remove("hide");
            send.addEventListener('click', () => {
                this.getSelectedItems().forEach(item => this.send(item));
            });
        }
    }
    // 全選/反選
    toggleSelection(type) {
        this.fileItems.forEach(item => {
            item.selected = type === 'all' ? true :
                type === 'reverse' ? !item.selected : false;
        });
        this.updateButtonStatus();
    }
    /**
     * 獲取選中元素 轉為對像
     */
    getSelectedItems() {
        return this.fileItems.filter(item => item.selected);
    }
    /**
     * 更新按鈕狀態
     */
    updateButtonStatus() {
        const selectedItems = this.getSelectedItems();

        const hasItems = selectedItems.length > 0;
        const canMerge = selectedItems.length === 2 && selectedItems.every(item => (item.size ?? 0) <= G.chromeLimitSize && isMedia(item));

        document.querySelector('#delete-selected').disabled = !hasItems;
        document.querySelector('#merge-download').disabled = !canMerge;
        document.querySelector('#copy-selected').disabled = !hasItems;
        document.querySelector('#download-selected').disabled = !hasItems;
        document.querySelector('#aria2-selected').disabled = !hasItems;
        document.querySelector('#send-selected').disabled = !hasItems;
    }
    /**
     * 合併下載
     */
    mergeDownload() {
        chrome.runtime.sendMessage({
            Message: "catCatchFFmpeg",
            action: "openFFmpeg",
            extra: i18n.waitingForMedia
        });
        const checkedData = this.getSelectedItems();
        // 都是m3u8 自動合併併發送到ffmpeg
        if (checkedData.every(data => isM3U8(data))) {
            const taskId = Date.parse(new Date());
            checkedData.forEach((data) => {
                this.openM3U8(data, { ffmpeg: "merge", quantity: checkedData.length, taskId: taskId, autoDown: true, autoClose: true });
            });
            return;
        }
        this.catDownload(checkedData, { ffmpeg: "merge" });
    }

    /**
     * 下載檔案
     * @param {Object} data 下載數據
     */
    downloadItem(data) {
        if (G.m3u8dl && isM3U8(data)) {
            if (!data.url.startsWith("blob:")) {
                const m3u8dlArg = data.m3u8dlArg ?? templates(G.m3u8dlArg, data);
                const url = 'm3u8dl:' + (G.m3u8dl == 1 ? Base64.encode(m3u8dlArg) : m3u8dlArg);
                if (url.length >= 2046) {
                    navigator.clipboard.writeText(m3u8dlArg);
                    alert(i18n.M3U8DLparameterLong);
                    return;
                }
                if (G.isFirefox) {
                    window.location.href = url;
                    return;
                }
                chrome.tabs.update({ url: url });
                return;
            }
        }
        if (G.m3u8AutoDown && isM3U8(data)) {
            this.openM3U8(data, { taskId: Date.parse(new Date()), autoDown: true, autoClose: true });
            return;
        }
        this.catDownload(data);
    }
    /**
     * 刪除檔案
     * @param {Object|null} data 
     */
    deleteItem(data = null) {
        data = data ? [data] : this.getSelectedItems();
        data.forEach(item => {
            const index = this.originalItems.findIndex(originalItem => originalItem.requestId === item.requestId);
            if (index !== -1) {
                this.originalItems.splice(index, 1);
            }
        });
        this.updateFileList();
    }
    /**
     * 複製檔案鏈接
     * @param {Object|null} item 
     */
    copy(data = null) {
        data = data ? [data] : this.getSelectedItems();
        const url = [];
        data.forEach(function (item) {
            url.push(copyLink(item));
        });
        navigator.clipboard.writeText(url.join("\n"));
        this.alert(i18n.copiedToClipboard);
    }
    /**
     * 下載選中
     */
    downloadSelected() {
        const data = this.getSelectedItems();
        data.length && this.catDownload(data);
    }
    /**
     * 發送到aria2
     * @param {Object} data 檔案對像
     */
    aria2(data) {
        aria2AddUri(data, (success) => {
            this.alert(success, 1000);
        }, (msg) => {
            this.alert(msg, 1500);
        });
    }
    /**
     * 呼叫第三方工具
     * @param {Object} data 檔案對像
     */
    invoke(data) {
        const url = templates(G.invokeText, data);
        if (G.isFirefox) {
            window.location.href = url;
        } else {
            chrome.tabs.update({ url: url });
        }
    }
    /**
     * 發送到遠端或本地地址
     * @param {Object} data 檔案對像
     */
    send(data) {
        send2local("catch", data, this._tabId).then((success) => {
            success && success?.ok && this.alert(i18n.hasSent, 1000);
        }).catch((error) => {
            error ? this.alert(error, 1500) : this.alert(i18n.sendFailed, 1500);
        });
    }
    /**
     * 更新檔案列表
     */
    updateFileList() {
        this.fileItems = [...this.originalItems];
        // 獲取勾選擴充套件
        const selectedExts = Array.from(document.querySelectorAll('input[name="ext"]:checked'))
            .map(checkbox => checkbox.value);
        // 應用 正則 and 擴充套件過濾
        this.fileItems = this.fileItems.filter(item =>
            selectedExts.includes(item.ext) &&
            (!this.regexFilters || this.regexFilters.test(item.url))
        );
        // 排序
        const order = document.querySelector('input[name="sortOrder"]:checked').value === 'asc' ? 1 : -1;
        const field = document.querySelector('input[name="sortField"]:checked').value;
        this.fileItems.sort((a, b) => order * (a[field] - b[field]));
        // 更新顯示
        this.renderFileItems();
        this.updateButtonStatus();
    }
    /**
     * 建立檔案元素
     * @param {Object} item 數據
     * @param {Number} index 索引
     */
    createFileElement(item, index) {
        if (item.html) { return item.html; }
        item.html = document.createElement('div');
        item.html.setAttribute('data-index', index);
        item.html.className = 'file-item';
        item.html.innerHTML = `
            <div class="file-title hide">${item.title}</div>
            <div class="file-name">${item.name}</div>
            <div class="preview-container">
                <img src="${item.favIconUrl || 'img/icon.png'}" class="preview-image icon">
            </div>
            <div class="bottom-row">
                <div class="file-info">${item.ext}</div>
            </div>
            <div class="actions">
                <img src="img/copy.png" class="icon copy" title="${i18n.copy}">
                <img src="img/delete.svg" class="icon delete" title="${i18n.delete}">
                <img src="img/download.svg" class="icon download" title="${i18n.download}">
            </div>`;
        // 新增檔案資訊
        if (item.size && item.size >= 1024) {
            item.html.querySelector('.file-info').textContent += ` / ${byteToSize(item.size)}`;
        }
        item.html.addEventListener('click', (event) => {
            if (event.target.closest('.icon') || this.isDragging) { return; }
            item.selected = !item.selected;
            this.updateButtonStatus();
        });
        // 複製圖示
        item.html.querySelector('.copy').addEventListener('click', () => this.copy(item));
        // 刪除圖示
        item.html.querySelector('.delete').addEventListener('click', () => this.deleteItem(item));
        // 下載圖示
        item.html.querySelector('.download').addEventListener('click', () => this.downloadItem(item));
        // 選中狀態 新增對應class
        item._selected = false;
        Object.defineProperty(item, "selected", {
            get: () => item._selected,
            set(newValue) {
                item._selected = newValue;
                item.html.classList.toggle('selected', newValue);
            }
        });
        // 圖片預覽
        if (isPicture(item)) {
            const previewImage = item.html.querySelector('.preview-image');
            previewImage.onload = () => {
                item.html.querySelector('.file-info').textContent += ` / ${previewImage.naturalWidth}*${previewImage.naturalHeight}`;
            };
            previewImage.src = item.url;
            // 點選預覽圖片
            previewImage.addEventListener('click', (event) => {
                event.stopPropagation();
                const container = document.querySelector('.image-container');
                container.querySelector('img').src = item.url;
                container.classList.remove('hide');
            });
        }

        // 新增一些圖示 和 事件
        const actions = item.html.querySelector('.actions');

        if (isM3U8(item)) {
            const m3u8 = document.createElement('img');
            m3u8.src = 'img/parsing.png';
            m3u8.className = 'icon m3u8';
            m3u8.title = i18n.parser;
            m3u8.addEventListener('click', () => this.openM3U8(item));
            actions.appendChild(m3u8);
        }

        // 發送到aria2
        if (G.enableAria2Rpc) {
            const aria2 = document.createElement('img');
            aria2.src = 'img/aria2.png';
            aria2.className = 'icon aria2';
            aria2.title = "aria2";
            aria2.addEventListener('click', () => this.aria2(item));
            actions.appendChild(aria2);
        }

        // 呼叫第三方工具
        if (G.invoke) {
            const invoke = document.createElement('img');
            invoke.src = 'img/invoke.svg';
            invoke.className = 'icon invoke';
            invoke.title = i18n.invoke;
            invoke.addEventListener('click', () => this.invoke(item));
            actions.appendChild(invoke);
        }

        // 發送到遠端或本地地址
        if (G.send2localManual) {
            const send = document.createElement('img');
            send.src = 'img/send.svg';
            send.className = 'icon send';
            send.title = i18n.send2local;
            send.addEventListener('click', () => this.send(item));
            actions.appendChild(send);
        }

        return item.html;
    }
    /**
     * 設定副檔名覈取方塊
     */
    setupExtensionFilters() {
        const extensions = [...new Set(this.originalItems.map(item => item.ext))];
        const extFilter = document.querySelector('#extensionFilters');
        extensions.forEach(ext => {
            // 檢查 extFilter 是否存在ext
            if (extFilter.querySelector(`input[value="${ext}"]`)) return;
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="ext" value="${ext}" checked>${ext == 'Unknown' ? ext : ext.toLowerCase()}`;
            label.querySelector('input').addEventListener('click', () => this.updateFileList());
            extFilter.appendChild(label);
        });
    }
    /**
     * 渲染檔案列表
     */
    renderFileItems() {
        const fragment = document.createDocumentFragment();
        this.fileItems.forEach((item, index) => {
            fragment.appendChild(this.createFileElement(item, index));
        });
        const container = document.querySelector('#file-container');
        container.innerHTML = '';
        container.appendChild(fragment);
    }
    /**
     * 修剪檔名
     * @param {Object} data 數據
     */
    trimFileName(data) {
        data._title = data.title;
        data.title = stringModify(data.title);

        data.name = isEmpty(data.name) ? data.title + '.' + data.ext : decodeURIComponent(stringModify(data.name));

        data.downFileName = G.TitleName ? templates(G.downFileName, data) : data.name;
        data.downFileName = filterFileName(data.downFileName);
        if (isEmpty(data.downFileName)) {
            data.downFileName = data.name;
        }
        data.ext = data.ext ? data.ext : 'Unknown';
        return data;
    }
    /**
     * 載入數據
     */
    async loadFileItems() {
        this.originalItems = await chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getData", tabId: this._tabId }) || [];
        if (this.originalItems.length == 0) {
            this.alert(i18n.noData, 1500);
            return;
        }
        // 設定分頁
        if (this.originalItems.length > this.MAX_LIST_SIZE) {
            this.setupPage(this.originalItems.length);
            this.originalItems = this.originalItems.slice((this.currentPage - 1) * this.MAX_LIST_SIZE, this.currentPage * this.MAX_LIST_SIZE);
        }
        // 顯示範圍
        if (this.currentRange) {
            this.originalItems = this.originalItems.slice(this.currentRange.start, this.currentRange.end ?? this.originalItems.length);
        }
        this.originalItems = this.originalItems.map(data => this.trimFileName(data));
        this.fileItems = [...this.originalItems];
        setHeaders(this.fileItems, null, this.tab.id);

    }
    /**
     * 關閉預覽視訊
     */
    closePreview() {
        document.querySelector('.play-container').classList.add('hide');
        const video = document.querySelector('#video-player');
        video.pause();
        video.src = '';
        this.previewHLS && this.previewHLS.destroy();

        const imageContainer = document.querySelector('.image-container');
        imageContainer.classList.add('hide');
    }
    /**
     * 播放檔案
     * @param {Object} item 
     */
    playItem(item) {
        const video = document.querySelector('#video-player');
        const container = document.querySelector('.play-container');
        if (isM3U8(item)) {
            this.previewHLS = new Hls({ enableWorker: false });
            this.previewHLS.loadSource(item.url);
            this.previewHLS.attachMedia(video);
            this.previewHLS.on(Hls.Events.ERROR, (event, data) => {
                this.previewHLS.stopLoad();
                this.previewHLS.destroy();
            });
            this.previewHLS.on(Hls.Events.MEDIA_ATTACHED, () => {
                container.classList.remove('hide');
                video.play();
            });
        } else {
            video.src = item.url;
            container.classList.remove('hide');
            video.play();
        }
    }
    /**
     * 產生預覽video標籤
     * @param {Object} item 數據
     */
    async generatePreview(item) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.loop = true;
            video.preload = 'metadata';
            video.addEventListener('loadedmetadata', () => {
                video.currentTime = 0.5;
                video.pause();
                videoInfo.height = video.videoHeight;
                videoInfo.width = video.videoWidth;

                if (video.duration && video.duration != Infinity) {
                    videoInfo.duration = secToTime(video.duration);
                }

                // 判斷是否為音訊檔案
                if (item.type?.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(item.ext)) {
                    videoInfo.type = 'audio';
                    videoInfo.video = null;
                    videoInfo.height = 0;
                    videoInfo.width = 0;
                }
                resolve(videoInfo);
            });

            let hls = null;

            const cleanup = () => {
                if (hls) hls.destroy();
                video.remove();
            };

            const videoInfo = { video: video, height: 0, width: 0, duration: 0, type: 'video' };
            // 處理HLS視訊
            if (isM3U8(item)) {
                if (!Hls.isSupported()) {
                    return reject(new Error('HLS is not supported'));
                }

                hls = new Hls({ enableWorker: false });
                hls.loadSource(item.url);
                hls.attachMedia(video);
                videoInfo.type = 'hlsVideo';

                hls.on(Hls.Events.ERROR, (event, data) => {
                    cleanup();
                    reject(data);
                });
            }
            // 處理普通視訊
            else {
                video.src = item.url;
                video.addEventListener('error', () => {
                    cleanup();
                    reject(new Error('Video load failed'));
                });
            }
        });
    }
    /**
     * 設定預覽video標籤到對應位置 以及新增滑鼠懸停事件
     * @param {Object} item data
     */
    setPerviewVideo(item) {
        // 視訊放入預覽容器 增加class
        const container = item.html.querySelector('.preview-container');
        container.classList.add('video-preview');

        if (item.previewVideo.type == 'audio' || (item.previewVideo.width == 0 && item.previewVideo.height == 0)) {
            // 如果是音訊檔案，使用音樂圖示
            container.innerHTML = '<img src="img/music.svg" class="preview-music icon" />';
        } else {
            if (container.querySelector('video')) return;
            // 如果是視訊檔案，使用視訊預覽
            container.appendChild(item.previewVideo.video);
            // 滑鼠懸停事件
            item.html.addEventListener('mouseenter', () => {
                item.previewVideo.video.play();
            });
            item.html.addEventListener('mouseleave', () => {
                item.previewVideo.video.pause();
            });
            // 填寫視訊資訊
            item.html.querySelector('.file-info').textContent += ` / ${item.previewVideo.width}*${item.previewVideo.height}`;
        }
        // 點選視訊 全屏播放 阻止冒泡 以免選中
        container.querySelectorAll("video, .preview-music").forEach((element) => {
            element.addEventListener('click', (event) => {
                event.stopPropagation();
                this.playItem(item);
            });
        });
        // 填寫時長
        if (item.previewVideo.duration) {
            item.html.querySelector('.file-info').textContent += ` / ${item.previewVideo.duration}`;
        }

        // 刪除 preview-image
        item.html.querySelector('.preview-image')?.remove();
    }
    /**
     * 多執行緒 開始產生預覽video標籤
     */
    async startPreviewGeneration() {
        const pendingItems = this.fileItems.filter(item =>
            !item.previewVideo &&
            !item.previewVideoError &&
            (item.type?.startsWith('video/') ||
                item.type?.startsWith('audio/') ||
                isMediaExt(item.ext) ||
                isM3U8(item))
        );

        const processItem = async () => {
            while (pendingItems.length) {
                const item = pendingItems.shift();
                if (!item?.url) continue;
                try {
                    item.previewVideo = await this.generatePreview(item);
                    this.setPerviewVideo(item);
                    // console.log('Preview generated for:', item.url);
                } catch (e) {
                    item.previewVideoError = true;
                    // console.warn('Failed to generate preview for:', item.url, e);
                }
            }
        };
        await Promise.all(Array(this.MAX_CONCURRENT).fill().map(processItem));
    }
    /**
     * 貓抓下載器
     * @param {Object} data 
     * @param {Object} extra 
     */
    catDownload(data, extra = {}) {
        // 防止連續多次提交
        if (this.catDownloadIsProcessing) {
            setTimeout(() => {
                catDownload(data, extra);
            }, 233);
            return;
        }
        this.catDownloadIsProcessing = true;
        if (!Array.isArray(data)) { data = [data]; }

        // 儲存數據到臨時變數 提高檢索速度
        localStorage.setItem('downloadData', JSON.stringify(data));

        // 如果大於2G 詢問是否使用流式下載
        if (!extra.ffmpeg && !G.downStream && Math.max(...data.map(item => item._size)) > G.chromeLimitSize && confirm(i18n("fileTooLargeStream", ["2G"]))) {
            extra.downStream = 1;
        }
        // 發送訊息給下載器
        chrome.runtime.sendMessage(chrome.runtime.id, { Message: "catDownload", data: data }, (message) => {
            // 不存在下載器或者下載器出錯 新建一個下載器
            if (chrome.runtime.lastError || !message || message.message != "OK") {
                this.createCatDownload(data, extra);
                return;
            }
            this.catDownloadIsProcessing = false;
        });
    }
    /**
     * 建立貓抓下載器
     * @param {Object} data 
     * @param {Object} extra 
     */
    createCatDownload(data, extra) {
        const arg = {
            url: `/downloader.html?${new URLSearchParams({
                requestId: data.map(item => item.requestId).join(","),
                ...extra
            })}`,
            index: this.tab.index + 1,
            active: !G.downActive
        };
        chrome.tabs.create(arg, (tab) => {
            // 循環獲取tab.id 的狀態 準備就緒 重置任務狀態
            const interval = setInterval(() => {
                chrome.tabs.get(tab.id, (tab) => {
                    if (tab.status != "complete") { return; }
                    clearInterval(interval);
                    this.catDownloadIsProcessing = false;
                });
            });
        });
    }
    /**
     * 設定框選
     */
    setupSelectionBox() {
        const selectionBox = document.getElementById('selection-box');
        const container = document.querySelector('body');
        // let isDragging = false;
        let isSelecting = false;
        const startPoint = { x: 0, y: 0 };

        container.addEventListener('mousedown', (e) => {
            if (e.button == 2) return;
            // 限定起始位範圍
            if (e.target.closest('.icon, .preview-image, video, button, input')) return;

            isSelecting = true;
            startPoint.x = e.pageX;
            startPoint.y = e.pageY;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;

            const currentPoint = {
                x: e.pageX,
                y: e.pageY
            };

            // 計算移動距離，只有真正拖動時才顯示選擇框
            const moveDistance = Math.sqrt(
                Math.pow(currentPoint.x - startPoint.x, 2) +
                Math.pow(currentPoint.y - startPoint.y, 2)
            );

            // 如果移動距離大於5畫素，認為是拖動而不是點選
            if (!this.isDragging && moveDistance > 5) {
                this.isDragging = true;
                selectionBox.style.display = 'block';
            }

            if (!this.isDragging) return;

            // 計算選擇框的位置和大小
            const left = Math.min(startPoint.x, currentPoint.x);
            const top = Math.min(startPoint.y, currentPoint.y);
            const width = Math.abs(currentPoint.x - startPoint.x);
            const height = Math.abs(currentPoint.y - startPoint.y);

            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;

            // 檢查每個file-item是否在選擇框內
            this.fileItems.forEach(item => {
                const rect = item.html.getBoundingClientRect();
                if (rect.left + window.scrollX < left + width &&
                    rect.left + rect.width + window.scrollX > left &&
                    rect.top + window.scrollY < top + height &&
                    rect.top + rect.height + window.scrollY > top) {
                    item.selected = true;
                } else {
                    item.selected = false;
                }
            });
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button == 2 || !isSelecting) return;

            isSelecting = false;
            setTimeout(() => { this.isDragging = false; }, 10);
            selectionBox.style.display = 'none';
            selectionBox.style.width = '0';
            selectionBox.style.height = '0';
            this.updateButtonStatus();
        });
    }

    /**
     * 打開m3u8解析器
     * @param {Object} data 
     * @param {Object} options 
     */
    openM3U8(data, options = {}) {
        const url = `/m3u8.html?${new URLSearchParams({
            url: data.url,
            title: data.title,
            filename: data.downFileName,
            tabid: data.tabId == -1 ? this._tabId : data.tabId,
            initiator: data.initiator,
            requestHeaders: data.requestHeaders ? JSON.stringify(data.requestHeaders) : undefined,
            ...Object.fromEntries(Object.entries(options).map(([key, value]) => [key, typeof value === 'boolean' ? 1 : value])),
        })}`
        chrome.tabs.create({ url: url, index: this.tab.index + 1, active: !options.autoDown });
    }
    /**
     * 提示資訊
     * @param {String} message 提示資訊
     * @param {Number} sec 顯示時間
     */
    alert(message, sec = 1000) {
        let toast = document.querySelector('.alert-box');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'alert-box';
            document.body.appendChild(toast);
        }
        // 顯示期間新訊息頂替
        clearTimeout(this.alertTimer);
        toast.classList.remove('active');

        toast.textContent = message;
        toast.classList.add('active');
        this.alertTimer = setTimeout(() => {
            toast.classList.remove('active');
        }, sec);
    }
    /**
     * 新增檔案
     * @param {Object} data 
     */
    push(data) {
        if (this.originalItems.length >= this.MAX_LIST_SIZE) {
            return;
        }
        setHeaders(data, null, this.tab.id);
        this.originalItems.push(this.trimFileName(data));

        // this.startPreviewGeneration(); 防抖
        clearTimeout(this.pushDebounce);
        this.pushDebounce = setTimeout(() => {
            this.setupExtensionFilters();
            this.updateFileList();
            this.startPreviewGeneration();
        }, 1000);
    }

    /**
     * 設定分頁
     * @param {Number} fileLength 檔案數
     */
    setupPage(fileLength) {
        const url = new URL(location.href);
        document.querySelector('.pagination').classList.remove('hide'); // 顯示頁面元件
        const maxPage = Math.ceil(fileLength / this.MAX_LIST_SIZE); // 最大頁數

        // 設定頁碼
        document.querySelector('.page-numbers').textContent = `${this.currentPage} / ${maxPage}`;

        // 上一頁按鈕
        if (this.currentPage != 1) {
            const prev = document.querySelector('#prev-page');
            prev.disabled = false;
            prev.addEventListener('click', () => {
                url.searchParams.set('page', this.currentPage - 1);
                chrome.tabs.update({ url: url.toString() });
            });
        }

        // 下一頁按鈕
        if (this.currentPage != maxPage) {
            const next = document.querySelector('#next-page');
            next.disabled = false;
            next.addEventListener('click', () => {
                url.searchParams.set('page', this.currentPage + 1);
                chrome.tabs.update({ url: url.toString() });
            });
        }
    }
}

awaitG(() => {
    // 自定義css
    const css = document.createElement('style');
    css.textContent = G.css;
    document.head.appendChild(css);

    // 實例化 FilePreview
    const filePreview = new FilePreview();

    // 監聽新數據
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message || !Message.data || !filePreview || Message.data.tabId != filePreview._tabId) { return; }
        // 新增資源
        if (Message.Message == "popupAddData") {
            filePreview.push(Message.data);
            return;
        }
    });
});