## 更新說明

### 2.6.0

[Added] 全新的彈出頁面(`彈出`按鈕) 檔案預覽/篩選幫助你下載需要的檔案 (設定`feat newPopup`關閉新版)

[Changed] 增強數據發送功能，現在能自定義發送數據 感謝 @helson-lin 的支援

[Changed] 正則匹配 現在能獲取到請求頭

[Changed] 支援夸克瀏覽器 (部分功能不可用)

[Updated] 深度搜索指令碼 找到更多資源

[Fixed] Fifefox 匯入功能 bug 導致擴充套件不可用

[Fixed] 偶爾會彈出多個 ffmpeg 頁面的 bug

[Fixed] 下載器 打開`邊下邊存` 無法自動關閉的 bug

### 2.5.9

[Added] 增加遮蔽網址功能 新增不希望開啟擴充套件的網站 (可設為白名單, 只允許新增網址開啟擴充套件)

[Fixed] 新版下載器 下載大檔案時 出錯 #610

[Changed] 限制每頁面最大儲存 9999 條資源

[Changed] 設定增加導航欄

[Changed] 自動下載 允許自定義儲存檔名

### 2.5.8

[Changed] 如果資源 url 不存在檔名 嘗試使用頁面標題作為檔名

### 2.5.7

[Fixed] 自定義儲存檔名使用 `/` 無法建立目錄

[Changed] firefox 升級 manifest v3

[Changed] firefox 128 以上版本 支援使用深度搜索 快取錄製 等指令碼功能

[Fixed] firefox 無法發送到線上 ffmpeg 問題

[Added] 重構 貓抓下載器 如需舊版本請在設定 關閉 `Test version` 選項

[Added] `URL Protocol m3u8dl` `呼叫程式` 增加下載前確認參數設定

[Added] m3u8 為疑似金鑰增加驗證金鑰功能

[Changed] 增強 深度搜索 現在能找到更多疑似金鑰

### 2.5.6

[Fixed] m3u8 解析器 自動關閉 bug #531

[Fixed] chrome 130 自定義 url 新規範導致 `m3u8dl://` 呼叫失敗 #528

[Fixed] m3u8 解析器 檔案不正確無法解析 造成死循環佔用 CPU 問題

[Changed] 貓抓下載器 新增更多請求頭 增加下載成功率

### 2.5.5

[Fixed] 修復一個嚴重 bug #483

[Added] 線上 ffmpeg 提供伺服器選擇

[Fixed] m3u8 解析器 檔名存在`|`字元 無法下載問題

[Changed] 發送數據 提供完整請求頭

### 2.5.4

[Added] m3u8DL 增加切換 RE 版本 (RE 版 需[URLProtocol](https://github.com/xifangczy/URLProtocol))

[Added] 錄製相關指令碼 增加位元速率設定

[Fixed] 深度搜索 指令碼錯誤導致無法使用

[Fixed] m3u8 解析器錄製直播 錄製時間顯示錯誤

### 2.5.3

[Added] 增加`彈出`模式 (以新視窗打開資源列表頁面)

[Added] 增加`呼叫本地程式`設定, 程式沒有呼叫協議, 可以使用[URLProtocol](https://github.com/xifangczy/URLProtocol)幫助程式註冊呼叫協議。具體使用方法檢視 [呼叫本地協議](https://o2bmm.gitbook.io/cat-catch/docs/invoke)

[Added] 下載器 增加`邊下邊存`選項 可以用來下載一些直播視訊鏈接

[Added] 現在使用`深度搜索` 或其他指令碼得到的疑似金鑰, 直接顯示在 popup 頁面 `疑似金鑰` 標籤內。

[Added] 增加 葡萄牙語

[Changed] 重寫 `錄製webRTC` 指令碼

[Changed] `m3u8解析器` `下載器`頁面內更改設定不會被儲存。所有設定更改統一到擴充套件設定頁面。

[Changed] storage.local 更改為 storage.session 以減少 IO 錯誤導致擴充套件無法使用.(要求 chrome 104 以上)

[Changed] 優化與 ffmpeg 網頁端的通訊, 避免多工時的數據錯亂。
(請提前打開 [線上 ffmpeg](https://ffmpeg.bmmmd.com/) ctrl+f5 重新整理頁面 避免頁面快取造成的問題)

[Changed] 稍微增大一些按鈕圖示 不再訓練大家的滑鼠精準度 🙄...如果你不喜歡想還原 設定-自定義 css 填入 `body{font-size:12px;width:550px;}.icon,.favicon{width:18px;height:18px;}.DownCheck{width:15px;height:15px;}`

### 2.5.2

[Added] 新增測試功能 數據發送 嗅探數據和金鑰發送到指定地址

[Added] 替換標籤 增加 `${origin}`

[Added] 顯示 圖示數字角標 開關

[Fixed] 貓抓下載器 小部分網站需要指定 range

[Fixed] 修復 標題作為檔名 檔名含有非法字元問題 #339

### 2.5.1

[Added] 多語言 增加繁體中文

[Fixed] 修復 深度搜索 死循環 bug

[Fixed] 相容低版本 chromium 缺少 API 導致擴充套件無法使用

[Changed] popup 頁面 現在能合併兩個 m3u8 檔案

### 2.5.0

[Added] 多語言支援

[Changed] m3u8 解析 新下載器 效能優化

[Fixed] 視訊捕捉 不使用`從頭捕獲`也會丟掉頭部數據的問題

[Changed] 深度搜索 現在能找到更多金鑰

### 2.4.9

[Fixed] `$url$` 標籤 修復(自動更新成`${url}`) #281

[Fixed] 修復 加密 m3u8 存在 EXT-X-MAP 標籤，解密會失敗的 bug

[Added] 設定頁面 新增自動合併 m3u8 選項 #286 (測試)

[Added] 增加錄製 webRTC 流指令碼 更多功能-錄製 webRTC (測試)

### 2.4.8

[Fixed] 修復 m3u8 新下載器 ${referer} 標籤問題 #272

[Fixed] 修復 m3u8 新下載器 全部重新下載 bug #274

[Fixed] 修復 m3u8 新下載器 下載失敗丟失執行緒 #276

[Fixed] 修復 m3u8 新下載器 勾選 ffmpeg 轉碼 下載超過 2G 大小 不會強制下載

[Changed] 完善 Aria2 Rpc 協議 增加金鑰 和 cookie 支援

[Added] 增加${cookie}標籤 如果資源存在 cookie

### 2.4.7

[Fixed] 快取捕獲 延遲獲取標題 #241

[Fixed] 特殊字元造成無法下載的問題 #253

[Fixed] m3u8 解析器 沒有解析出全部巢狀 m3u8 的 bug #265

[Added] firefox 增加 privacy 協議頁面 第一次安裝顯示

[Added] 增加 Aria2 Rpc 協議下載 感謝 @aar0u

[Changed] 重寫錄製指令碼

[Changed] 增強深度搜索

[Changed] m3u8 解析器 現在可以自定義頭屬性

[Changed] m3u8 解析器 最大下載執行緒調整為 6

[Changed] m3u8 解析器 預設開啟新下載器

### 2.4.6

[Fixed] 快取捕獲 多個視訊問題 #239

[Changed] 更新 mux m3u8-decrypt mpd-parser 版本

[Changed] 設定 重新整理跳轉清空當前標籤抓取的數據 現在可以調節模式

[Changed] firefox 版本要求 113+

[test] m3u8 解析器 增加測試項 `重構的下載器`

### 2.4.5

[Changed] 增強 深度搜索 解決"一次性"m3u8

[Changed] m3u8 解析器 下載範圍允許填寫時間格式 HH:MM:SS

[Added] 增加 快取捕獲 從頭捕獲、正則提取檔名、手動填寫檔名

[Added] 增加 設定 正則匹配 遮蔽資源功能

[Added] 增加 下載器 後臺打開頁面設定

[deleted] 刪除 "幽靈資源" 設定 不確定來源的資源歸於目前標籤

[Fixed] 修復 快取捕獲 清理快取

[Fixed] 修復 正則匹配 有時會匹配失效(lastIndex 沒有復位)

[Fixed] 修復 媒體控制 有時檢測不到媒體

[Fixed] 修復 重置所有設定 丟失配置

[Fixed] 修復 firefox 相容問題

### 2.4.4

[Changed] 增強 深度搜索

[Fixed] m3u8 解析器 無限觸發錯誤的 bug

### 2.4.3

[Fixed] 修復 快取捕獲 獲取檔名為空

[Changed] 增強 深度搜索 可以搜到更多金鑰

[Changed] 增強 注入指令碼 現在會注入到所有 iframe

[Changed] 刪除 youtube 支援 可以使用快取捕捉

### 2.4.2

[Added] 設定頁面增加 排除重複的資源 選項

[Added] popup 增加暫停抓取按鈕

[Changed] 超過 500 條資源 popup 可以中斷載入

[Changed] 調整預設配置 預設不啟用 ts 檔案 刪除多餘正則

[Changed] 正則匹配的效能優化

[Fixed] 修復 m3u8 解析器錄製功能 直播結束導致自動重新整理頁面丟失已下載數據的問題

[Fixed] 修復 m3u8 解析器邊下邊存和 mp4 轉碼一起使用 編碼不正確的 bug

[Fixed] 修復 擴充套件重新啟動后 造成的死循環

### 2.4.1

[Added] 捕獲指令碼 現在可以通過表達式獲取檔名

[Changed] 刪除 打開自動下載的煩人提示

[Changed] 優化 firefox 下 資源嚴重佔用問題

[Fixed] 貓抓下載器 不再限制 2G 檔案大小 #179

### 2.4.0

[Added] 加入自定義 css

[Added] 音訊 視訊 一鍵合併

[Added] popup 頁面正則篩選

[Added] 自定義快捷鍵支援

[Added] popup 頁面支援正則篩選

[Added] m3u8 碎片檔案自定義參數

[Changed] 篩選 現在能隱藏不要的數據 而不是取消勾選

[Changed] 重寫優化 popup 大部分程式碼

[Changed] 重寫初始化部分程式碼

[Changed] m3u8 解析器 預設設定改為 ffmpeg 轉碼 而不是 mp4 轉碼

[Changed] 刪除 除錯模式

[Fixed] 深度搜索 深度判斷的 bug

[Fixed] 很多 bug

### 2.3.3

[Changed] 解析器 m3u8DL 預設不載入設定參數 #149

[Changed] 可以同時打開多個捕獲指令碼

[Changed] popup 頁面 css 細節調整 #156

[Fixed] 清空不會刪除角標的 bug

[Fixed] 替換標籤中 參數內包含 "|" 字元處理不正確的 bug

### 2.3.2

[Changed] 設定 增加自定義檔名 刪除標題正則提取

[Added] 支援深色模式 #134

[Added] popup 增加篩選

[Fixed] 修復非加密的 m3u8 無法自定義金鑰下載

[Fixed] mp4 轉碼刪除 建立媒體日期 屬性 #142

### 2.3.1

[Added] 新的替換標籤

[Changed] 邊下邊存 支援 mp4 轉碼

[Fixed] 修復 BUG #123 #117 #114 #124

### 2.3.0

[Added] m3u8 解析器 邊下邊存

[Added] m3u8 解析器 線上 ffmpeg 轉碼

[Fixed] 特殊檔名 下載所選無法下載

[Fixed] m3u8 解析器 某些情況無法下載檔案

[Fixed] Header 屬性提取失敗

[Fixed] 新增抓取型別出錯 #109

[Changed] 修改 標題修剪 預設配置

### 2.2.9

[Fixed] 修復 m3u8DL 呼叫命令範圍參數 --downloadRange 不正確

[Added] 正則修剪標題 [#90](https://github.com/xifangczy/cat-catch/issues/94)

[Added] 下載前選擇儲存目錄 選項

[Fixed] m3u8 解析器 部分情況無法下載 ts 檔案

[Changed] `複製所選`按鈕 現在能被 `複製選項`設定影響

### 2.2.8

[Changed] m3u8 解析器現在會記憶你設定的參數

[Changed] 幽靈數據 更改為 其他頁面(幽靈數據同樣歸類其他頁面)

[Changed] popup 頁面的效能優化

[Changed] 增加 始終不啟用下載器 選項

[Fixed] 修復 使用第三方下載器貓抓下載器也會被呼叫

### 2.2.7

[Fixed] 修正 檔案大小顯示不正確

[Changed] 效能優化

[Fixed] 修復 沒有正確清理冗餘數據 導致 CPU 佔用問題

### 2.2.6

[Added] 深度搜索 嘗試收集 m3u8 檔案的金鑰 具體使用檢視 [使用者文件](https://o2bmm.gitbook.io/cat-catch/docs/m3u8parse#maybekey)

[Added] popup 資源詳情增加二維碼按鈕

[Added] m3u8 解析器 自定義檔名 只要音訊 另存為 m3u8DL 命令完善 部分程式碼來自 [#80](https://github.com/xifangczy/cat-catch/pull/80)

[Added] 非 Chrome 擴充套件商店版本 現在支援 Youtube

[Added] Firefox 版 現在支援 m3u8 視訊預覽

[Fixed] m3u8 解析器 超長名字無法儲存檔案 [#80](https://github.com/xifangczy/cat-catch/pull/80)

[Fixed] 修正 媒體控制 某些情況檢測不到視訊

### 2.2.5

[Fixed] 修復 mpd 解析器丟失音軌 [#70](https://github.com/xifangczy/cat-catch/issues/70)

[Changed] 優化在網路狀況不佳下的直播 m3u8 錄製

[Changed] 更新 深度搜索 search.js 進一步增加分析能力

[Changed] 減少 mp4 轉碼時記憶體佔用

[Changed] 自定義呼叫本地播放器的協議

### 2.2.4

[Changed] 更新 hls.js

[Changed] m3u8 檔案現在能顯示更多媒體資訊

[Added] 增加 Dash mpd 檔案解析

[Added] 增加 深度搜索 指令碼

[Fixed] 修復 捕獲按鈕偶爾失效

### 2.2.3

[Added] m3u8 解析器增加錄製直播

[Added] m3u8 解析器增加處理 EXT-X-MAP 標籤

[Added] 新增捕獲指令碼 recorder2.js 需要 Chromium 104 以上版本

[Added] 增加選項 重新整理、跳轉到新頁面 清空當前標籤抓取的數據

[Fixed] 修正 m3u8 解析器使用 mp4 轉碼產生的檔案，媒體時長資訊不正確

### 2.2.2

[Changed] m3u8 解析器使用 hls.js 替代，多項改進，自定義功能新增

[Changed] 分離下載器和 m3u8 解析器

[Fixed] 修復 m3u8 解析器`呼叫N_m3u8DL-CLI下載`按鈕失效

[Fixed] 修復幽靈數據隨機丟失問題

[Fixed] 修復 m3u8 解析器 key 下載器在某些時候無法下載的問題

### 2.2.1

[Fixed] 修復瀏覽器字型過大，按鈕遮擋資源列表的問題。

[Fixed] 調整關鍵詞替換

[Fixed] 修復 Firefox download API 無法下載 data URL 問題

[Changed] m3u8 解析器多個 KEY 顯示問題

[Changed] 視訊控制現在可以控制其他頁面的視訊

[Changed] 視訊控制現在可以對視訊截圖

[Changed] 自定義複製選項增加 其他檔案 選項

[Added] m3u8 解析器現在可以轉換成 mp4 格式

### 2.2.0

[Fixed] 修復檔名出現 "~" 符號 導致 chrome API 無法下載

[Fixed] 修復 Firefox 中 popup 頁面下載按鈕被滾動條遮擋

[Fixed] 儲存路勁有中文時 m3u8dl 協議呼叫錯誤

[Changed] 增加/刪除一些預設配置

[Added] 增加操控目前網頁視訊功能

[Added] 增加自定義複製選項

### 2.1.2

[Changed] 細節調整

### 2.1.1

[Changed] 調整正則匹配 現在能提取多個網址

[Fixed] 修復選擇指令碼在 m3u8 解析器里不起作用 並提高安全性

[Fixed] m3u8 解析器在 Firefox 中不能正常播放 m3u8 視訊

[Fixed] 修復 Firefox 中手機端模擬無法還原的問題

[Fixed] 修復初始化錯誤 BUG 導致擴充套件失效

### 2.1.0

[Changed] 新增 referer 獲取 不存在再使用 initiator 或者直接使用 url

[Changed] 重新支援 Firefox 需要 93 版本以上

[Changed] chromium 內核的瀏覽器最低要求降為 93 小部分功能需要 102 版本以上，低版本會隱藏功能按鈕

[Fixed] 部分 m3u8 key 檔案解析錯誤問題

[Fixed] 修復 儲存檔名使用網頁標題 選項在 m3u8 解析器里不起作用

### 2.0.0

[Changed] 模擬手機端，現在會修改 navigator.userAgent 變數

[Added] 視訊捕獲功能，解決被動嗅探無法下載視訊的問題

[Added] 視訊錄製功能，解決被動嗅探無法下載視訊的問題

[Added] 支援 N_m3u8DL-CLI 的 m3u8dl://協議

[Added] m3u8 解析器增強，現在能線上合併下載 m3u8 檔案

[Added] popup 頁面無法下載的視訊，會交給 m3u8 解析器修改 Referer 下載

[Added] popup 頁面和 m3u8 頁面可以線上預覽 m3u8

[Added] json 檢視工具，和 m3u8 解析器一樣在 popup 頁面顯示圖示進入

[Fixed] 無數 BUG

[Fixed] 解決 1.0.17 以來會丟失數據的問題

[Fixed] 該死的 Service Worker... 現在後臺被殺死能立刻喚醒自己... 繼續用骯髒的手段對抗 Manifest V3

### 1.0.26

[Fixed] 解決關閉網頁不能正確刪除目前頁面儲存的數據問題

### 1.0.25

[Changed] 正則匹配增強

[Changed] Heart Beat

[Added] 手機端模擬，手機環境下有更多資源可以被下載。

[Added] 自動下載

### 1.0.24

[Added] 匯入/導出配置

[Added] Heart Beat 解決 Service Worker 休眠問題

[Added] firefox.js 相容層 並上架 Firefox

### 1.0.23

[Added] 正則匹配

### 1.0.22

[Fixed] 一個嚴重 BUG，導致 Service Worker 無法使用 \*

### 1.0.21

[Added] 自定義抓取型別

[Refactor] 設定頁面新界面

### 1.0.20

[Added] 抓取 image/\*型別檔案選項

### 1.0.19

[Fixed] 重構導致的許多 BUG \*

### 1.0.18

[Added] 抓取 application/octet-stream 選項

[Refactor] 重構剩餘程式碼

### 1.0.17

[Refactor] Manifest 更新到 V3 部分程式碼

[Added] 使用 PotPlayer 預覽媒體
