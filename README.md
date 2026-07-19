# 3D 射擊(shooting3d・10m 氣步槍)

> 室內靶場,10 公尺氣步槍。移動滑鼠瞄準、按住屏息讓準星收斂、在「穩定窗」放開擊發——
> 室內無風,挑戰全在呼吸節奏。正中十環靶心!

## 玩法

- **練習場**:無限發數,自由熟悉屏息節奏。
- **計分賽**:6 組 × 3 發,滿分 180。
- **十環挑戰**:10 發,盡量射進 9、10 環。
- **雙人同機**:兩人輪流用同一組鍵/滑鼠,各 10 發比總分(P1 藍 vs P2 紅)。

滑鼠瞄準、方向鍵微調;按住畫面/空白鍵屏息,準星先收斂變穩,屏太久會缺氧回晃——
在穩定窗放開擊發最準。難度六檔(幼兒~職業),越難晃越大、穩定窗越短、還看得見心跳脈動。

★安全:準星掃到相鄰選手=禁止擊發(槍口紀律),不是遊戲橋段。

## 開發

```bash
npm install && npm run dev
npm run build && npx vite preview --port 4191
node scripts/gen-voice.mjs                                    # 烤語音(msedge-tts,累加式)
node scripts/verify-shooting.mjs http://localhost:4191 scratch # 四關端到端驗收
```

## 部署(Cloudflare Pages)

```bash
npx wrangler pages deploy dist --project-name hfpc-shooting3d
```
