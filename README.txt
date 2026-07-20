部署方式（GitHub Pages）
1. 建立一個新的 GitHub Repository。
2. 將本資料夾內的 index.html、manifest.json、sw.js 上傳到 Repository 根目錄。
3. 到 Settings > Pages。
4. Source 選 Deploy from a branch。
5. Branch 選 main，資料夾選 /root，按 Save。
6. 等待 GitHub 產生網址後，用 Safari 開啟。
7. Safari 點分享 > 加入主畫面。

Netlify 部署
1. 登入 Netlify。
2. 選 Add new site > Deploy manually。
3. 將整個 sales-widget-deploy 資料夾拖入上傳區。

注意：目前資料儲存在瀏覽器 LocalStorage，同一台裝置與同一瀏覽器才會保留；不同手機或電腦不會自動同步。
