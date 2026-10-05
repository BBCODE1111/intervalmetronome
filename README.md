# Interval Metronome

吉他與樂器練習用間隔節拍器，保留原本的復古類比面板。

**線上使用：https://bbcode1111.github.io/intervalmetronome/**

原始專案：[Alecliu/intervalmetronome](https://github.com/Alecliu/intervalmetronome)。本倉庫保留完整原始 Git 歷史，作為 BBCODE1111 的發布版本。

## 使用方式

1. 設定 Tempo（30–400 BPM）、音量與拍號。BPM 以四分音符計算，選 `/8` 時，每個八分音符拍點的間隔為 `/4` 的一半。
2. **Beats / MSR** 直接輸入每小節拍數，例如 3、4、5、7、21；只接受大於 0 的整數，不接受小數。預設維持 **4/4**。播放中修改拍號，會在下一個完整小節或預備拍開始時套用。
3. 按 **START** 開始，按 **STOP** 停止。首次會先載入內建語音，準備完成後才一起播放第一聲報數與節拍；載入期間仍可按 STOP 取消。載入失敗會顯示提示，可按 START 重試。
4. 開啟 **Interval Training Engine**，設定每幾小節（Each）增加多少 BPM（Incr），以及目標速度（Target BPM）。達標後維持目標速度，不再計算新的加速次數。
5. 開啟 **Rest Logic Control**，設定每幾次實際加速休息、以及休息秒數。休息結束後以新速度繼續；間隔訓練關閉時不會自動休息。
6. **START CUE** 控制開始與休息結束時的預備拍；**TRANS CUE** 控制變速後的預備拍。使用隨網站提供的固定英文語音，和節拍共用 Web Audio 時鐘；不依賴系統語音服務。每個數字的播放長度會依當前速度調整，包含變速與休息後的預備拍。

報數加快時音高也會升高；在極高速度、八分音符或很長的數字下，語音仍會在下一拍前結束，但辨識度會降低。

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

## 音訊驗證

`npm test` 包含全部整數 BPM 30–400 × `/4`、`/8` 的 742 種組合，以及首次載入、取消、重試、變速、休息、自訂整數拍數、取樣率轉換與音量測試。

另可執行 `npm run qa:browser`、`npm run preview`，開啟：

- `/intervalmetronome/audio-qa.html`：按 Run waveform checks，以瀏覽器的 `OfflineAudioContext` 渲染實際音檔，分別測量語音和節拍聲道的起點、跨拍重疊、靜音與停止。包含 44.1 / 48 kHz、9 種 BPM、兩種音符值，以及 1–4、5、7、17、21、101、最大安全整數。
- `/intervalmetronome/live-qa.html`：本機測試版介面，在首次／再次 START 時顯示實際語音訊號峰值。報數應依序出現，且非靜音時每個數字的 peak 大於 0。

這些頁面只供本機測試；正常 `npm run build` 會移除，不會部署。波形驗證不等同於在所有手機、耳機與瀏覽器上逐一聆聽。拍數支援 JavaScript 可精確表示的正整數（至 9,007,199,254,740,991），只按需組合當前數字，音檔快取最多保留 64 組。

需要重建語音時執行 `npm run generate:voice`。產生器使用鎖定版本的 eSpeak NG，修剪起始／尾端靜音並統一音量；不會上傳文字或連線到語音服務。

## 檔案與打包

- `index.html`：介面與語意標籤。
- `src/app.js`：排程、間隔訓練、休息與輸入驗證。
- `src/audio.js`：同時鐘的節拍／語音播放、整數報數組合與音量控制。
- `public/audio/`：已生成的英文語音 WAV 與字詞位置表；一般建置不需重新生成。
- `src/styles.css`：原有面板樣式與 Tailwind 建置入口。
- `tests/`：排程與載入競態測試，以及瀏覽器實際波形和首次啟動檢查頁。
- `scripts/build.mjs`：產生可部署的 `dist/`。
- `.github/workflows/pages.yml`：測試、建置及發布流程。

`dist/` 包含網站、JavaScript、CSS、字型、語音、圖示與第三方授權文字，執行時不依賴 Tailwind CDN 或 Google Fonts。可將整個 `dist/` 上傳到任何靜態網站主機；網址子目錄不需額外設定。這不代表網站已具備離線安裝或背景播放功能。

GitHub Releases 提供可直接部署的網站 ZIP、原始碼下載與包含完整 Git 歷史的 `.bundle` 備份。還原 Git 備份：

```sh
git clone intervalmetronome-v1.1.0.bundle intervalmetronome
cd intervalmetronome
git remote set-url origin https://github.com/BBCODE1111/intervalmetronome.git
```

## GitHub Pages 部署

倉庫的 **Settings → Pages → Source** 使用 **GitHub Actions**。推送至 `main` 後會先執行測試與建置，成功後自動部署到上方網址；Pull Request 只驗證、不部署。

首次建立倉庫時需啟用 Pages。後續更新可在 **Actions → Test and deploy GitHub Pages** 檢查紀錄，亦可手動執行 workflow。

部署方式依 [GitHub Pages 官方文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。樣式使用鎖定版本的 Tailwind Node 編譯器，只編譯 `index.html` 中出現的 utility classes；動態狀態樣式寫在 `src/styles.css`，不需要監看檔案的服務。
