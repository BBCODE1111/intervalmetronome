# 開發與維護說明

原始專案：[Alecliu/intervalmetronome](https://github.com/Alecliu/intervalmetronome)。本倉庫保留完整 Git 歷史，作為 BBCODE1111 的發布版本。

素材來源與授權請見 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

## 本機開發與驗證

需要 Node.js 22 以上（建議 Node.js 24）。

```sh
npm ci
npm test
npm run build
npm run preview
```

開啟 http://127.0.0.1:4173/intervalmetronome/ 。可用 `PORT=8080 npm run preview` 指定其他連接埠。

## 語音起音處理

1–10 錄音會先縮短過長的氣音與輕聲開頭，保留約 25 ms 的子音。two 與 ten 另外保留 t 的起始爆破音；主要母音維持原本波形，必要的長度版本仍在發布前處理。播放時固定提前 20 ms 開始子音，讓較明顯的字音靠近拍點；每個數字使用相同提前量，避免變速時前後重疊。

`attack.mjs` 使用低頻與全頻 RMS 的持續上升判定字音主體，並非把第一個非零樣本當成發音。這是可重現的聲學檢查，不能等同於每位聽者的主觀節奏感。背景可參考 [John Morton 的 P-centres 說明](https://johnmorton.co.uk/professional-life/theories/perceptual-centres/)。

## 音訊驗證

`npm test` 包含全部整數 BPM 30–400 × `/4`、`/8` 的 742 種組合，以及首次載入、取消、重試、變速、休息、自訂整數拍數、取樣率轉換與音量測試，另驗證時間壓縮前後的音高與未壓縮音訊的一致性。

另可執行 `npm run qa:browser`、`npm run preview`，開啟：

- `/intervalmetronome/audio-qa.html`：按 Run waveform checks，以瀏覽器的 `OfflineAudioContext` 渲染實際音檔，分別測量排程誤差、字音主體與拍點的相對位置、跨拍重疊、靜音與停止。包含 44.1 / 48 kHz、9 種 BPM、兩種音符值，以及 1–10、17、21、101、最大安全整數。
- `/intervalmetronome/live-qa.html`：本機測試版介面，在首次／再次 START 時顯示實際語音訊號峰值、頁面到常用語音準備完成時間，以及按鈕到第一個音訊訊號時間（不含硬體輸出延遲）。報數應依序出現，且非靜音時每個數字的 peak 大於 0。

這些頁面只供本機測試；正常 `npm run build` 會移除，不會部署。波形驗證不等同於在所有手機、耳機與瀏覽器上逐一聆聽。拍數支援 JavaScript 可精確表示的正整數（至 9,007,199,254,740,991），只按需組合當前數字，音檔快取最多保留 64 組。

v1.3.1 驗證：26 項自動測試通過；Chrome 實際 AAC 解碼後共 36 組、504 次報數，排程誤差最大 0.292 ms，1–10 字音主體與拍點的偏差最大 20.03 ms。預設 120 BPM /4 的 one 到 four 偏差約為 0、+5、0、−10 ms。首次 START 與再次 400 BPM 7/8 都有完整報數訊號。常用語音資料 gzip 為 69,766 bytes；播放時沒有新增起音分析。

重建真人錄音長度版本：在 macOS 安裝開發依賴後，執行 `npm ci --prefix scripts/recorded-voice`、`npm run generate:recorded`。使用已包含授權的原始 OGG 錄音與系統 `afconvert` 製作 AAC；正常建置不需要音訊轉檔工具。

需要重建補充合成語音時，先執行 `npm ci --prefix scripts/voice-generator`，再執行 `npm run generate:voice`。產生器使用 Kokoro-82M 的 `af_sarah` 女聲，在本機產生並修剪靜音、統一音量。首次會下載約 320 MB 模型到已忽略的 `artifacts/voice-model/`；模型與產生器依賴不會部署。生成文字不會上傳到語音服務，語音資訊表記錄模型與聲音的 SHA-256。

## 檔案與打包

- `index.html`：介面與語意標籤。
- `src/app.js`：排程、間隔訓練、休息與輸入驗證。
- `src/audio.js`：同時鐘的節拍／語音播放、整數報數組合與音量控制。
- `src/stretch.js`：以 SoundTouch WSOLA 保留音高的時間壓縮，只用於超過 10 的補充合成報數；常用真人報數不需執行此運算。
- `public/audio/`：真人報數 AAC、分段資訊、首包 JavaScript 及補充語音來源；一般建置不需重新生成。
- `src/styles.css`：原有面板樣式與 Tailwind 建置入口。
- `tests/`：排程與載入競態測試，以及瀏覽器實際波形和首次啟動檢查頁。
- `scripts/build.mjs`：產生可部署的 `dist/`。
- `.github/workflows/pages.yml`：測試、建置及發布流程。

`dist/` 包含網站、JavaScript、CSS、字型、語音、圖示與第三方授權文字，執行時不依賴 Tailwind CDN 或 Google Fonts。可將整個 `dist/` 上傳到任何靜態網站主機；網址子目錄不需額外設定。這不代表網站已具備離線安裝或背景播放功能。

GitHub Releases 提供可直接部署的網站 ZIP、原始碼下載與包含完整 Git 歷史的 `.bundle` 備份。還原 Git 備份：

```sh
git clone intervalmetronome-v1.3.1.bundle intervalmetronome
cd intervalmetronome
git remote set-url origin https://github.com/BBCODE1111/intervalmetronome.git
```

## GitHub Pages 部署

倉庫的 **Settings → Pages → Source** 使用 **GitHub Actions**。推送至 `main` 後會先執行測試與建置，成功後自動部署到上方網址；Pull Request 只驗證、不部署。

首次建立倉庫時需啟用 Pages。後續更新可在 **Actions → Test and deploy GitHub Pages** 檢查紀錄，亦可手動執行 workflow。

部署方式依 [GitHub Pages 官方文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。樣式使用鎖定版本的 Tailwind Node 編譯器，只編譯 `index.html` 中出現的 utility classes；動態狀態樣式寫在 `src/styles.css`，不需要監看檔案的服務。
