# Interval Metronome

吉他與樂器練習用間隔節拍器，保留原本的復古類比面板。

**線上使用：https://bbcode1111.github.io/intervalmetronome/**

原始專案：[Alecliu/intervalmetronome](https://github.com/Alecliu/intervalmetronome)。本倉庫保留完整原始 Git 歷史，作為 BBCODE1111 的發布版本。

## 使用方式

1. 設定 Tempo（30–400 BPM）、音量與拍號。BPM 以四分音符計算，選 `/8` 時，每個八分音符拍點的間隔為 `/4` 的一半。
2. 按 **START** 開始，按 **STOP** 停止。瀏覽器需要這次點擊才能啟用音訊。
3. 開啟 **Interval Training Engine**，設定每幾小節（Each）增加多少 BPM（Incr），以及目標速度（Target BPM）。達標後維持目標速度，不再計算新的加速次數。
4. 開啟 **Rest Logic Control**，設定每幾次實際加速休息、以及休息秒數。休息結束後以新速度繼續；間隔訓練關閉時不會自動休息。
5. **START CUE** 控制開始與休息結束時的預備拍；**TRANS CUE** 控制變速後的預備拍。語音依瀏覽器與系統提供的英文語音而定；不支援語音時節拍聲仍可運作。

練習時請保持頁面在前景、裝置螢幕開啟。切換分頁或鎖定手機時，瀏覽器可能暫停音訊或限制計時，不能保證背景節拍精度。Master Volume 同時控制節拍與語音提示；0% 會靜音。

## 本機開發與驗證

需要 Node.js 22 以上（建議 Node.js 24）。

```sh
npm ci
npm test
npm run build
npm run preview
```

開啟 http://127.0.0.1:4173/intervalmetronome/ 。可用 `PORT=8080 npm run preview` 指定其他連接埠。

## 檔案與打包

- `index.html`：介面與語意標籤。
- `src/app.js`：Web Audio 排程、間隔訓練、休息與輸入驗證。
- `src/styles.css`：原有面板樣式與 Tailwind 建置入口。
- `tests/`：以模擬時鐘驗證節拍間隔、輸入邊界與停止／重新開始。
- `scripts/build.mjs`：產生可部署的 `dist/`。
- `.github/workflows/pages.yml`：測試、建置及發布流程。

`dist/` 包含網站、JavaScript、CSS、字型、圖示與第三方授權文字，執行時不依賴 Tailwind CDN 或 Google Fonts。可將整個 `dist/` 上傳到任何靜態網站主機；網址子目錄不需額外設定。這不代表網站已具備離線安裝或背景播放功能。

GitHub Releases 提供可直接部署的網站 ZIP、原始碼下載與包含完整 Git 歷史的 `.bundle` 備份。還原 Git 備份：

```sh
git clone intervalmetronome-v1.0.0.bundle intervalmetronome
cd intervalmetronome
git remote set-url origin https://github.com/BBCODE1111/intervalmetronome.git
```

## GitHub Pages 部署

倉庫的 **Settings → Pages → Source** 使用 **GitHub Actions**。推送至 `main` 後會先執行測試與建置，成功後自動部署到上方網址；Pull Request 只驗證、不部署。

首次建立倉庫時需啟用 Pages。後續更新可在 **Actions → Test and deploy GitHub Pages** 檢查紀錄，亦可手動執行 workflow。

部署方式依 [GitHub Pages 官方文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。樣式使用鎖定版本的 Tailwind Node 編譯器，只編譯 `index.html` 中出現的 utility classes；動態狀態樣式寫在 `src/styles.css`，不需要監看檔案的服務。
