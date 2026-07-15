# roadmap — HFPC 3D 系列(2026-07-15 深夜 對齊,agape250 機收工)

## ✅ 已完成(別重做)

- **聖經 3D 佇列全清**:約拿單/大衛甩石/彼得走海/參孫打獅子/大衛躲槍/雅各摔跤/基甸三百勇士/**約阿施的得勝箭**(打地不揭示次數,≥5=完全得勝)
- **騎乘引擎家族(07-15 一天三款)**:equestrian3d 馬術障礙賽(引擎的家:四模式含**雙騎競速 vs AI+小地圖**、七色馬、零罰分彩花、已加難)・horsearchery3d 騎射(騎乘×射箭混搭首例,三輪校正=「靶好瞄但馬要快」)・jousting3d 騎士比武(對衝變體,無 KO,武鬥館)
- **奧運頁 32 主賽+示範賽**;武鬥館 9 卡;大廳 114 關 sw v72;portfolio 93
- 籃球CO 四修:每節3分/灌籃 6m 拍板/**灌籃鍵 F/Alt**/AI 抄截調弱/我方命中提高——皆上線
- 馬體鐵則:長腿 v3+鬃毛三件套+七色換色(沉澱在 mount-riding-kit skill)
- 工具鏈:mount-riding-kit、/new-mount3d、timing-meter-kit、/new-bible3d、/new-sport3d;gh CLI 兩機皆可用
- ★skills repo CI 連環紅已修(教訓:加 skill/command 必跑 gen-catalog+sync-doc-counts 再 push)

## 🔜 真正待做(CP 值 × 開發時間排序)

| # | 事項 | ★價值 | ⏱估時 | 做法 |
|---|------|-------|-------|------|
| 1 | 騎驢進耶路撒冷(太21,棕枝主日) | ★★★★★ | 1.5-2h | `/new-mount3d palm-donkey course 太21:1-11`;玩家=小驢駒(拍板,不操控耶穌) |
| 2 | 巴蘭騎驢躲避天使(民22) | ★★★★★ | 2h | `/new-mount3d balaam-donkey course 民22:21-33`;玩家=驢(唯一看見天使的),三次閃避+開口結局 |
| 3 | 全系列 [hidden] CSS 蟲掃 | ★★★★ | 1h | 19 關的大力道條從沒真正藏過(joash 已修);一行 CSS 每關補 |
| 4 | 射擊(10m 氣步槍) | ★★★★ | 1.5h | `/new-sport3d shooting3d archery3d 射擊` |
| 5 | 跳遠/速滑 | ★★★★ | 各1.5h | athletics 皮(timing-meter-kit) |
| 6 | 航海引擎(帆船+保羅海難/約拿風暴船) | ★★★★★ | 4-5h | 新引擎一魚四吃;首發皮建議保羅海難(徒27) |
| 7 | 大衛牧羊趕獅熊/耶利哥城牆 | ★★★★ | 1.5-2h | samson 皮 / peter-sea 節奏皮 |

## 💡 建議新增(功能與跨專案工具,CP 值 × 開發時間排序;07-15 晚提案,給下一手挑)

| # | 提案 | 類型 | ★CP | ⏱ | 為什麼 |
|---|------|------|-----|----|--------|
| 1 | **/add-game-card 一鍵加卡** | command | ★★★★★ | 1.5h | 每款上線要手改 3-5 個入口頁(大廳/奧運/武鬥館/portfolio/gamefleet)——07-15 重複做 4 次=最痛點;吃「名稱/網址/分類」自動五處同步+部署 |
| 2 | **/entry-drift-check 入口頁對賬** | command | ★★★★ | 0.5h | 07-15 兩次抓到「只部署沒 push」漂移(奧運頁/武鬥館);curl 線上 diff repo 一鍵掃全部入口頁 |
| 3 | **difficulty-tune skill(調參手冊)** | skill | ★★★★ | 0.5h | 「太難/太容易」的標準旋鈕順序(窗→速→輔助→幾何→預設檔;先查狀態殘留如準星歸中)——騎射三輪/馬術一輪的沉澱 |
| 4 | **馬蹄聲 clip-clop(procedural)** | 功能 | ★★★★ | 0.5h | 騎乘三款共用,audio.js 一函式,沉浸感大增 |
| 5 | **競速多馬同場(4-6 匹)** | 功能 | ★★★ | 1h | RACE_AI 陣列化+多 LANE;效能見 mount-riding-kit(建議 4,上限 8) |
| 6 | **比武錦標賽(侍從→騎士→冠軍三連戰)** | 功能 | ★★★ | 1.5h | 武鬥七家 boss 進階慣例 |
| 7 | **gamefleet 雙寫 hook** | hook | ★★★ | 0.5h | sites.json reference↔live 自動同步兩處(07-15 手動雙寫 5 次) |
| 8 | **catalog-keeper hook 裝機**(已存在) | hook | ★★★★ | 5m | HFP 機跑 `node scripts/install-hooks.mjs`——07-14 CI 連環紅就是沒裝它 |
| 9 | 新 MCP | MCP | ★ | — | 暫無高 CP 缺口(cuv/gamefleet/github/llm 已覆蓋);先不做 |

## 🚫 刻意不做

- 3D 取代 2D(並列鐵則);Web Speech 機器聲;聖經皮用勇次郎;操控耶穌(小驢駒/彼得走海範式);大規模騎兵互砍(競技不嗜血);啟6 四騎士做兒童遊戲。
