# Gaia Flow 成本計算器

手機網頁：口述或輸入「食材＋克數」，自動對應食材總表，算出總成本、每克成本、單份成本。

## 檔案
- `index.html` — 網頁
- `matcher.js` — 拆句與食材對應（拆克數、中文數字、別名、部分符合、同音比對）
- `data/ingredients.json` — 由食材總表轉出（只有 ID、類別、品項、每克價格，不含廠商與進貨價）
- `data/aliases.json` — 預設別名（例如「鹽」→ ID126）。食材總表若加了「別名」欄位，也會一起轉出
- `data/pinyin.json` — 同音比對用的字表，由 [pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT）的字典產生
- `tools/fetch_onedrive.py` — 從 OneDrive 分享連結下載 食材總表.xlsx
- `tools/convert.py` — 食材總表.xlsx → ingredients.json
- `tools/test.js` — 用過去食譜確認過的對應做測試：`node tools/test.js`

## 資料更新
`.github/workflows/sync.yml` 每小時執行一次（也可在 Actions 頁面手動執行）：
用 repository secret `ONEDRIVE_URL`（食材總表的 OneDrive 分享連結）下載最新的 食材總表.xlsx，
轉成 `data/ingredients.json` 後發佈到 GitHub Pages。下載失敗時沿用 repository 裡現有的資料。

GitHub Pages 的 Source 要設成 **GitHub Actions**。
