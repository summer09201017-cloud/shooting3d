# roadmap — HFPC 3D 系列(2026-07-14 對齊)

## ✅ 已完成(別重做)

- 3D 運動 19+ 關全上線(射箭/田徑四項/保齡/冰壺/冰球/12碼PK/棒球/撞球/足球/網羽…)+武鬥七家(命中感全套/地獄勇次郎/裝束寫實/長腿 v2)
- 聖經 3D:約拿單、大衛甩石、彼得走海、參孫打獅子(+五招)、大衛躲槍、雅各摔跤——全數上線+大廳/作品集/站名冊同步
- PK/冰球:七鍵守門(六式撲救+挑射)、倒數 5 秒排隊蓄力、鏡像修正、預承諾撲救
- 八色主題 theme-kit v3 套五入口頁;聖經大廳 113 關 sw v70;portfolio 85 站
- 工具:3d-figure-kit(28 patches)/figure-check/theme-kit skills、/mirror-check、/new-bible3d、figure-rules-checker agent、gamefleet MCP、netlify-deploy-guard hook——已推 hfpc-claude-skills
- athletics 100 公尺三輪修(凍結/力道條/按住衝刺+擺臂)

## 🔜 待做(CP 值 × 開發時間排序)

| # | 事項 | ★價值 | ⏱估時 | 說明 |
|---|------|-------|-------|------|
| 1 | 約阿施射箭 3D | ★★★★★ | 2-3h | 聖經佇列最後一項;`/new-bible3d joash-arrows archery3d 王下13:18-19`(不揭示次數的擊打機制) |
| 2 | 籃球CO 觀眾臉+聲 | ★★★★ | 30m | agape250 07-12 交辦殘項,檔在 HFP 機桌面;規格見 racket3d HANDOFF |
| 3 | /mirror-check 掃全系列 | ★★★★ | 1h | PK/冰球/大衛已修;其餘 3D(棒球盜壘/足球/武鬥視角)未逐視角驗過 |
| 4 | loop-freeze 冒煙進 /smoke3d | ★★★★ | 1h | this.running 撞名事故固化:每模式進場後驗「RAF 活著+狀態有前進」 |
| 5 | gamefleet fleet_smoke | ★★★ | 1h | MCP 加一鍵全站 200+sw 版本+title 對照(現有 fleet_check 只查清單) |
| 6 | 冬奧第二彈:滑雪跳台 | ★★★ | 2h | archery「蓄力+拋物線」家族直接換皮;奧運頁+1 |
| 7 | 武鬥七家難度量化 | ★★ | 1h | difficulty-balancer agent 自我對戰跑通關率,校 hell 檔勸退度 |
| 8 | lesson-prep 串新 3D 關 | ★★ | 30m | 主日學課表把大衛躲槍/雅各摔跤排進「靠神得勝」主題 |

## 🚫 刻意不做

- 3D 版取代 2D(鐵則:並列);Web Speech 機器聲 fallback;聖經皮用勇次郎當敵人。
