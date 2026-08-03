板橋戰情中心｜Milestone 1

【部署到 GitHub Pages】
1. 將本資料夾內所有檔案上傳到 GitHub Repository 最外層。
2. GitHub：Settings → Pages。
3. Source 選 Deploy from a branch。
4. Branch 選 main，資料夾選 /(root)，按 Save。
5. 等 GitHub 產生網址後開啟。

【每日使用】
1. 開啟網站。
2. 按「匯入業績追蹤.xlsx」。
3. 選擇固定格式的業績追蹤檔案。
4. 系統會讀取 Data、對應表、門號表、人員表。
5. 個人與全店實績會更新；目標與人員排序會保存在目前瀏覽器。

【固定欄位】
Data：A 日期、D 料號、G 銷售人員、H 數量。
對應表：A 料號、C 保險類別。
門號表：I 人員、J 總門號、K GA/NP、L 999以上；A-D 用於每週實績。
人員表：A 工號、C 顯示名稱。

【注意】
Excel 解析使用 SheetJS CDN。第一次開啟匯入功能時須有網路。
資料儲存在該裝置瀏覽器，手機與電腦不會自動同步。


匯入交易規則：一般交易、預購交易計入；作廢交易、預售交易、預售結帳不計。
