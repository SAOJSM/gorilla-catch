class Downloader {
    constructor(fragments = [], thread = 6) {
        this.fragments = fragments;      // 切片列表
        this.allFragments = fragments;   // 儲存所有原始切片列表
        this.thread = thread;            // 執行緒數
        this.events = {};                // events
        this.decrypt = null;             // 解密函式
        this.transcode = null;           // 轉碼函式
        this.init();
    }
    /**
     * 初始化所有變數
     */
    init() {
        this.index = 0;                  // 目前任務索引
        this.buffer = [];                // 儲存的buffer
        this.state = 'waiting';          // 下載器狀態 waiting running done abort
        this.success = 0;                // 成功下載數量
        this.errorList = new Set();      // 下載錯誤的列表
        this.buffersize = 0;             // 已下載buffer大小
        this.duration = 0;               // 已下載時長
        this.pushIndex = 0;              // 推送順序下載索引
        this.controller = [];            // 儲存中斷控制器
        this.running = 0;
    }
    /**
     * 設定監聽
     * @param {string} eventName 監聽名
     * @param {Function} callBack 
     */
    on(eventName, callBack) {
        if (this.events[eventName]) {
            this.events[eventName].push(callBack);
        } else {
            this.events[eventName] = [callBack];
        }
    }
    /**
     * 觸發監聽器
     * @param {string} eventName 監聽名
     * @param  {...any} args 
     */
    emit(eventName, ...args) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(callBack => {
                callBack(...args);
            });
        }
    }
    /**
     * 設定解密函式
     * @param {Function} callback 
     */
    setDecrypt(callback) {
        this.decrypt = callback;
    }
    /**
     * 設定轉碼函式
     * @param {Function} callback 
     */
    setTranscode(callback) {
        this.transcode = callback;
    }
    /**
     * 停止下載 沒有目標 停止所有執行緒
     * @param {number} index 停止下載目標
     */
    stop(index = undefined) {
        if (index !== undefined) {
            this.controller[index] && this.controller[index].abort();
            return;
        }
        this.controller.forEach(controller => { controller.abort() });
        this.state = 'abort';
    }
    /**
     * 檢查對象是否錯誤列表內
     * @param {object} fragment 切片對像
     * @returns {boolean}
     */
    isErrorItem(fragment) {
        return this.errorList.has(fragment);
    }
    /**
     * 返回所有錯誤列表
     */
    get errorItem() {
        return this.errorList;
    }
    /**
     * 按照順序推送buffer數據
     */
    sequentialPush() {
        if (!this.events["sequentialPush"]) { return; }
        for (; this.pushIndex < this.fragments.length; this.pushIndex++) {
            if (this.buffer[this.pushIndex]) {
                this.emit('sequentialPush', this.buffer[this.pushIndex]);
                delete this.buffer[this.pushIndex];
                continue;
            }
            break;
        }
    }
    /**
     * 限定下載範圍
     * @param {number} start 下載範圍 開始索引
     * @param {number} end 下載範圍 結束索引
     * @returns {boolean}
     */
    range(start = 0, end = this.fragments.length) {
        if (start > end) {
            this.emit('error', 'start > end');
            return false;
        }
        if (end > this.fragments.length) {
            this.emit('error', 'end > total');
            return false;
        }
        if (start >= this.fragments.length) {
            this.emit('error', 'start >= total');
            return false;
        }
        if (start != 0 || end != this.fragments.length) {
            this.fragments = this.fragments.slice(start, end);
            // 更改過下載範圍 重新設定index
            this.fragments.forEach((fragment, index) => {
                fragment.index = index;
            });
        }
        // 總數為空 拋出錯誤
        if (this.fragments.length == 0) {
            this.emit('error', 'List is empty');
            return false;
        }
        return true;
    }
    /**
     * 獲取切片總數量
     * @returns {number}
     */
    get total() {
        return this.fragments.length;
    }
    /**
     * 獲取切片總時間
     * @returns {number}
     */
    get totalDuration() {
        return this.fragments.reduce((total, fragment) => total + fragment.duration, 0);
    }
    /**
     * 切片對像陣列的 setter getter
     */
    set fragments(fragments) {
        // 增加index參數 為多執行緒非同步下載 根據index屬性順序儲存
        this._fragments = fragments.map((fragment, index) => ({ ...fragment, index }));
    }
    get fragments() {
        return this._fragments;
    }
    /**
     * 獲取 #EXT-X-MAP 標籤的檔案url
     * @returns {string}
     */
    get mapTag() {
        if (this.fragments[0].initSegment && this.fragments[0].initSegment.url) {
            return this.fragments[0].initSegment.url;
        }
        return "";
    }
    /**
     * 新增一條新資源
     * @param {Object} fragment
     */
    push(fragment) {
        fragment.index = this.fragments.length;
        this.fragments.push(fragment);
    }
    /**
     * 下載器 使用fetch下載檔案
     * @param {object} fragment 重新下載的對象
     */
    downloader(fragment = null) {
        if (this.state === 'abort') { return; }
        // 是否直接下載對像
        const directDownload = !!fragment;

        // 非直接下載對像 從this.fragments獲取下一條資源 若不存在跳出
        if (!directDownload && !this.fragments[this.index]) { return; }

        // fragment是數字 直接從this.fragments獲取
        if (typeof fragment === 'number') {
            fragment = this.fragments[fragment];
        }

        // 不存在下載對像 從提取fragments
        fragment ??= this.fragments[this.index++];
        this.state = 'running';
        this.running++;

        // 資源已下載 跳過
        // if (this.buffer[fragment.index]) { return; }

        // 停止下載控制器
        const controller = new AbortController();
        this.controller[fragment.index] = controller;
        const options = { signal: controller.signal };

        // 下載前觸發事件
        this.emit('start', fragment, options);

        // 開始下載
        fetch(fragment.url, options)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.status, { cause: 'HTTPError' });
                }
                const reader = response.body.getReader();
                const contentLength = parseInt(response.headers.get('content-length')) || 0;
                fragment.contentType = response.headers.get('content-type') ?? 'null';
                let receivedLength = 0;
                const chunks = [];
                const pump = async () => {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) { break; }

                        // 流式下載
                        fragment.fileStream ? fragment.fileStream.write(new Uint8Array(value)) : chunks.push(value);

                        receivedLength += value.length;
                        this.emit('itemProgress', fragment, false, receivedLength, contentLength, value);
                    }
                    if (fragment.fileStream) {
                        return new ArrayBuffer();
                    }
                    const allChunks = new Uint8Array(receivedLength);
                    let position = 0;
                    for (const chunk of chunks) {
                        allChunks.set(chunk, position);
                        position += chunk.length;
                    }
                    this.emit('itemProgress', fragment, true);
                    return allChunks.buffer;
                }
                return pump();
            })
            .then(buffer => {
                this.emit('rawBuffer', buffer, fragment);
                // 存在解密函式 呼叫解密函式 否則直接返回buffer
                return this.decrypt ? this.decrypt(buffer, fragment) : buffer;
            })
            .then(buffer => {
                this.emit('decryptedData', buffer, fragment);
                // 存在轉碼函式 呼叫轉碼函式 否則直接返回buffer
                return this.transcode ? this.transcode(buffer, fragment) : buffer;
            })
            .then(buffer => {
                // 儲存解密/轉碼后的buffer
                this.buffer[fragment.index] = buffer;

                // 成功數+1 累計buffer大小和視訊時長
                this.success++;
                this.buffersize += buffer.byteLength;
                this.duration += fragment.duration ?? 0;

                // 下載對像來自錯誤列表 從錯誤列表內刪除
                this.errorList.has(fragment) && this.errorList.delete(fragment);

                // 推送順序下載
                this.sequentialPush();

                this.emit('completed', buffer, fragment);

                // 下載完成
                if (this.success == this.fragments.length) {
                    this.state = 'done';
                    this.emit('allCompleted', this.buffer, this.fragments);
                }
            }).catch((error) => {
                console.log(error);
                if (error.name == 'AbortError') {
                    this.emit('stop', fragment, error);
                    return;
                }
                this.emit('downloadError', fragment, error);

                // 儲存下載錯誤切片
                !this.errorList.has(fragment) && this.errorList.add(fragment);
            }).finally(() => {
                this.running--;
                // 下載下一個切片
                if (!directDownload && this.index < this.fragments.length) {
                    this.downloader();
                }
            });
    }
    /**
     * 開始下載 準備數據 呼叫下載器
     * @param {number} start 下載範圍 開始索引
     * @param {number} end 下載範圍 結束索引
     */
    start(start = 0, end = this.fragments.length) {
        // 檢查下載器狀態
        if (this.state == 'running') {
            this.emit('error', 'state running');
            return;
        }
        // 從下載範圍內 切出需要下載的部分
        if (!this.range(start, end)) {
            return;
        }
        // 初始化變數
        this.init();
        // 開始下載 多少執行緒開啟多少個下載器
        for (let i = 0; i < this.thread && i < this.fragments.length; i++) {
            this.downloader();
        }
    }
    /**
     * 銷燬 初始化所有變數
     */
    destroy() {
        this.stop();
        this._fragments = [];
        this.allFragments = [];
        this.thread = 6;
        this.events = {};
        this.decrypt = null;
        this.transcode = null;
        this.init();
    }
}