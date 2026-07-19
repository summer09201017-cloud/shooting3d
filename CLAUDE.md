# CLAUDE.md — shooting3d(3D 射擊・10m 氣步槍)

> 2026-07-19 換皮自 archery3d(大表 A1「射擊 10m 氣步槍」)。帳號 summer09201017-cloud。
> ★上架平台=Cloudflare Pages(新站鐵則,見 [[netlify-to-cloudflare-migrate]]):hfpc-shooting3d.pages.dev。

## 這是什麼

archery3d 的射箭→射擊換皮。**核心機制大改**(不只換模型):

- **拉弓蓄力 → 屏息穩定窗**:按住=屏息,準星先收斂(steadyTime)→ 最穩的 sweetTime 窗 →
  屏太久缺氧回晃(swayGrow)。放開=擊發。DIFFICULTY_PRESETS 用 steadyTime/sweetTime/swayGrow/heart
  取代 wind/drawDuration;距離恆 10m(ISSF)。
- **去拋物線**:彈丸直線瞬達(arrowFlight.arc=0,dur=dist/120);判定=畫面不變(先算命中點再演)。
- **室內無風**:wind 恆 0;挑戰全在呼吸節奏+心跳脈動(hard 難度連心跳都看得見)。
- **槍口紀律(取代射觀眾喜劇)**:準星掃到相鄰選手=禁止擊發+安全提醒(emit muzzle-safety),
  絕不做成「射人」橋段——兒童安全紅線。
- **雙人同機輪流賽**(duel-2p-kit §7B):modeId=duel2p,turnSide 輪替,共用同一組滑鼠/鍵,
  各 10 發比總分(P1 藍/P2 紅)。

## 模型(makeRifle / makePellet / makeHole 取代 makeBow/makeArrow)

氣步槍=槍托+機匣+槍管+覘孔照門+準星護圈;彈丸=小亮點+短曳光;靶上留黑色彈孔(白邊)。
靶=白靶紙+黑色瞄準區+細白分環線+紅點靶心;TARGET_R=0.3(比射箭靶小)。

## 驗證

`npm run build && npx vite preview --port 4191`;
`node scripts/verify-shooting.mjs http://localhost:4191 scratch`——四關全綠+0 pageerror:
①standard 屏息擊發 3 發得分>0+彈道 arc=0 ②bullseye kids 有內圈命中 ③duel2p 換手+勝負
④槍口安全(crowdAim 時擊發被擋)。語音 13 句(雲哲)已烤。

## dev hook

`window.__shooting3d`(+`__archery3d` 引擎舊名雙掛)+`window.__game`(/smoke3d 通用)。

## 上架收尾(Cloudflare Pages)

`wrangler pages deploy dist --project-name hfpc-shooting3d`;收尾三件套=奧運頁入口卡
(hfpc-olympics)→作品集 add-work(sports3d)→sites.json(運動3D,兩份)+Worker NAMES。
psPing 已是雙平台版(只擋 localhost)。
