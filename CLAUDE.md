# CLAUDE.md — archery3d(3D 射箭)+ HFPC 3D 系列樞紐資料夾

> 本資料夾=archery3d 遊戲快照,同時是 /sit-down 的系列樞紐(記憶檔綁這個路徑)。
> **GitHub 是唯一真相**;桌面 zip 只是備援快照。帳號 summer09201017-cloud。

## 現況(2026-07-15 晚)

- **佇列全清**:籃球CO 轉線上(hfpc-basketball3d)+整輪平衡、基甸三百勇士(hfpc-gideon300-3d)、
  沙灘排球 2v2(hfpc-volleyball3d,AI 重介入範式)、滑雪跳台(hfpc-skijump3d)全部上線+四同步。
- 大廳 114 關 sw v71;奧運頁 23 主賽;portfolio 89;gamefleet 18 站 fleet_smoke 全綠。
- 兩條新雷固化在 timing-meter-kit skill:選單期 NaN 鏡頭中毒、edge-tts 短句斷流。
- 未拍板:籃球灌籃距離(現 5m,建議 6.5m 折衷)。
- 🔜 見 roadmap.md(第一列=約阿施射箭;/new-bible3d、/new-sport3d 一條龍可用)。

## 前一輪現況(2026-07-14 晚)

- **archery3d 本體**:可玩、上線(hfpc-archery3d)、關節人物鐵則活範例;本日無改動。
- **系列本日大收割(細節見 讀我-HANDOFF.txt ★07-14 段)**:
  - ✅ 新上線:david-spear3d(大衛躲槍+雙手齊擲加難)、jacob-wrestle3d(雅各摔跤+瘸腿結局)
  - ✅ hockey3d/penalty3d 七鍵守門+倒數 5 秒+預承諾撲救;samson 五招;athletics 100 公尺三輪修
  - ✅ 八色主題(theme-kit v3)套五入口頁;聖經大廳預設墨綠夜(sw v70,113 關)
  - ✅ 工具全數固化並推上 hfpc-claude-skills(120 skills/57 commands/15 agents)
- 🔜 待做:見 roadmap.md(第一列=約阿施射箭 3D)。

## 鐵則(細節在記憶與 hfpc-claude-skills)

1. 關節人物/長腿 v2/矩形身體——活範例=本 repo makePerson+3d-figure-kit patches。
2. 鏡像視角輸入必翻轉(/mirror-check);經文必 cuv 查驗;人聲=預烤 mp3 分聲(雲哲/曉臻)。
3. 保留 2D 加 3D;入口頁都要八色主題;fork 必清 .netlify;deploy 必 --site;大廳 build 產物在 **site/**。
4. 跟使用者溝通一律繁體中文。

## 本機地雷

- lobby/portfolio data.js 是 CRLF(錨點用 \r\n;中文字直打勿用 \uXXXX)。
- `this.running` 之類的狀態名要先 grep 再用(athletics 主迴圈旗標撞名=整個遊戲凍結事故)。
- Playwright 分頁背景化 RAF 假凍結→先 bringToFront;WebGL 截圖用 canvas.toDataURL 同步渲染後讀。
