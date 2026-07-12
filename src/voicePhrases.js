// 播報詞庫(固定句,全部預烤 mp3)+key 函式——scripts/gen-voice.mjs 與 runtime voice.js 共用。
// ★字幕可以帶環數/分數等動態字,「唸出來的」一律用這裡的固定句(人聲鐵律:不用 Web Speech 機器聲)。
export function voiceKey(text) {
  const s = String(text).replace(/\s+/g, "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const PHRASES = [
  // 開賽/局間/終場
  "比賽開始!拉弓,瞄準,穩住呼吸!",
  "歡迎來到射箭場!比賽開始!",
  "本局結束!",
  "比賽結束!",
  // 紅心(10 環)
  "十環!正中紅心!",
  "好一箭正中靶心,太漂亮了!",
  // 金心區(9 環)
  "九環!命中金心!",
  "漂亮的一箭!",
  // 一般命中
  "好箭!穩穩命中!",
  "上靶了,再往中心修正。",
  // 失手
  "脫靶了,調整呼吸再來。",
  "可惜,偏了一點。",
];
