板橋戰情中心 Milestone 1－每日快照版

部署方式：
1. 將本資料夾全部檔案上傳到 GitHub Repository 根目錄。
2. GitHub Settings → Pages → Deploy from a branch → main / root。
3. 開啟網址後，按「匯入業績追蹤.xlsx」。

匯入規則：
- Data：只計一般交易、預售結帳；不計預售交易、作廢交易。
- 四類保險會同步計入總保險；對應為「總保險」的料號只計總保險。
- 門號表 I～L：當日人員、總門號、GA／NP、999以上。
- 門號資料會存成每日快照：同一天重匯覆蓋，不同日期新增。
- 月累計、每週完成率、落後名單與月底預估會自動重新計算。
- 資料保存在目前裝置的瀏覽器 LocalStorage；不同裝置尚不會同步。

注意：首次 Excel 匯入需要網路連線載入 SheetJS。
