import "./styles.css";
import {
  BasketballGame,
  DIFFICULTY_LABELS,
  GAME_MODES,
  TEAM_THEMES,
} from "./game.js";
import { AudioManager } from "./audio.js";
import { speakLine, setVoiceEnabled } from "./voice.js";
import { hasSavedGame, loadSettings, saveSettings } from "./storage.js";

const ui = {
  canvas: document.querySelector("#gameCanvas"),
  cameraButton: document.querySelector("#cameraButton"),
  homeScore: document.querySelector("#homeScore"),
  awayScore: document.querySelector("#awayScore"),
  homeTeamName: document.querySelector("#homeTeamName"),
  awayTeamName: document.querySelector("#awayTeamName"),
  gameClock: document.querySelector("#gameClock"),
  shotClock: document.querySelector("#shotClock"),
  periodLabel: document.querySelector("#periodLabel"),
  modeCode: document.querySelector("#modeCode"),
  phaseLabel: document.querySelector("#phaseLabel"),
  statusMessage: document.querySelector("#statusMessage"),
  modeLabel: document.querySelector("#modeLabel"),
  possessionLabel: document.querySelector("#possessionLabel"),
  controlledLabel: document.querySelector("#controlledLabel"),
  difficultyLabel: document.querySelector("#difficultyLabel"),
  homeThemeLabel: document.querySelector("#homeThemeLabel"),
  awayThemeLabel: document.querySelector("#awayThemeLabel"),
  audioStatus: document.querySelector("#audioStatus"),
  saveStatus: document.querySelector("#saveStatus"),
  installButton: document.querySelector("#installButton"),
  installHint: document.querySelector("#installHint"),
  saveButton: document.querySelector("#saveButton"),
  loadButton: document.querySelector("#loadButton"),
  menuButton: document.querySelector("#menuButton"),
  audioButton: document.querySelector("#audioButton"),
  pauseButton: document.querySelector("#pauseButton"),
  touchControls: document.querySelector("#touchControls"),
  shotMeterFill: document.querySelector("#shotMeterFill"),
  shotMeterWindow: document.querySelector("#shotMeterWindow"),
  shotMeterText: document.querySelector("#shotMeterText"),
  staminaFill: document.querySelector("#staminaFill"),
  staminaValue: document.querySelector("#staminaValue"),
  matchOverlay: document.querySelector("#matchOverlay"),
  overlayEyebrow: document.querySelector("#overlayEyebrow"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayText: document.querySelector("#overlayText"),
  resumeButton: document.querySelector("#resumeButton"),
  overlayMenuButton: document.querySelector("#overlayMenuButton"),
  overlayLoadButton: document.querySelector("#overlayLoadButton"),
  homeScreen: document.querySelector("#homeScreen"),
  modeCardGrid: document.querySelector("#modeCardGrid"),
  modeDescription: document.querySelector("#modeDescription"),
  homeThemeSelect: document.querySelector("#homeThemeSelect"),
  awayThemeSelect: document.querySelector("#awayThemeSelect"),
  homeThemePreview: document.querySelector("#homeThemePreview"),
  awayThemePreview: document.querySelector("#awayThemePreview"),
  menuDifficultySelect: document.querySelector("#menuDifficultySelect"),
  teamSizeSelect: document.querySelector("#teamSizeSelect"),
  targetScoreInput: document.querySelector("#targetScoreInput"),
  targetScoreLabel: document.querySelector("#targetScoreLabel"),
  courtModeSelect: document.querySelector("#courtModeSelect"),
  audioSelect: document.querySelector("#audioSelect"),
  modeMetaTitle: document.querySelector("#modeMetaTitle"),
  modeMetaGoal: document.querySelector("#modeMetaGoal"),
  startMatchButton: document.querySelector("#startMatchButton"),
  commentaryBar: document.querySelector("#commentaryBar"),
  continueSavedButton: document.querySelector("#continueSavedButton"),
};

const settings = loadSettings();
const audio = new AudioManager();
audio.setEnabled(settings.audioEnabled !== false);

const game = new BasketballGame({
  canvas: ui.canvas,
  touchRoot: ui.touchControls,
});
window.__bball = game; // dev hook:Playwright 凍結畫面/數值驗證用(比照 baseball3d)

let selectedModeId = game.modeId;
let selectedHomeThemeId = game.homeThemeId;
let selectedAwayThemeId = game.awayThemeId;
let selectedDifficulty = game.difficulty;
let selectedTeamSize = game.teamSize;
let selectedTargetScore = game.targetScore;
let selectedCourtMode = game.courtMode;
let audioEnabled = settings.audioEnabled !== false;

function setMeterFill(element, value) {
  element.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
}

function setThemePreview(element, themeId) {
  const theme = TEAM_THEMES[themeId];
  element.innerHTML = `
    <span style="background:${theme.uiPrimary}"></span>
    <span style="background:${theme.uiSoft}"></span>
    <span style="background:${theme.uiAccent}"></span>
  `;
}

function applyCssTheme(homeThemeId, awayThemeId) {
  const root = document.documentElement;
  const home = TEAM_THEMES[homeThemeId];
  const away = TEAM_THEMES[awayThemeId];

  root.style.setProperty("--home", home.uiPrimary);
  root.style.setProperty("--home-soft", home.uiSoft);
  root.style.setProperty("--away", away.uiPrimary);
  root.style.setProperty("--away-soft", away.uiSoft);
  root.style.setProperty("--accent", home.uiAccent);
  root.style.setProperty("--good", away.uiAccent);

  setThemePreview(ui.homeThemePreview, homeThemeId);
  setThemePreview(ui.awayThemePreview, awayThemeId);
}

function setAudioState(enabled) {
  audioEnabled = enabled;
  audio.setEnabled(enabled);
  setVoiceEnabled(enabled);
  ui.audioStatus.textContent = enabled ? "開啟" : "靜音";
  ui.audioButton.textContent = enabled ? "音效開啟" : "音效靜音";
  ui.audioSelect.value = enabled ? "on" : "off";
  saveSettings({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    homeThemeId: selectedHomeThemeId,
    awayThemeId: selectedAwayThemeId,
    audioEnabled: enabled,
  });
}

function syncMenuCards() {
  for (const button of ui.modeCardGrid.querySelectorAll(".mode-card")) {
    button.classList.toggle("selected", button.dataset.mode === selectedModeId);
  }

  const mode = GAME_MODES[selectedModeId];
  ui.modeDescription.textContent = mode.description;
  ui.modeMetaTitle.textContent = mode.label;
  ui.modeMetaGoal.textContent = mode.goal;
}

function syncMenuControls() {
  ui.homeThemeSelect.value = selectedHomeThemeId;
  ui.awayThemeSelect.value = selectedAwayThemeId;
  ui.menuDifficultySelect.value = selectedDifficulty;
  ui.teamSizeSelect.value = String(selectedTeamSize);
  ui.targetScoreInput.value = String(selectedTargetScore);
  const isRace = selectedModeId === "raceto";
  ui.targetScoreInput.hidden = !isRace;
  ui.targetScoreLabel.hidden = !isRace;
  ui.courtModeSelect.value = selectedCourtMode;
  applyCssTheme(selectedHomeThemeId, selectedAwayThemeId);
  syncMenuCards();
}

function syncGameConfigurationToMenu() {
  selectedModeId = game.modeId;
  selectedHomeThemeId = game.homeThemeId;
  selectedAwayThemeId = game.awayThemeId;
  selectedDifficulty = game.difficulty;
  selectedTeamSize = game.teamSize;
  selectedCourtMode = game.courtMode;
  selectedTargetScore = game.targetScore;
  syncMenuControls();
}

function syncOverlay(overlay) {
  ui.matchOverlay.classList.toggle("visible", overlay.visible);
  ui.overlayEyebrow.textContent = overlay.eyebrow;
  ui.overlayTitle.textContent = overlay.title;
  ui.overlayText.textContent = overlay.text;
  ui.resumeButton.hidden = !overlay.canResume;
}

function openHomeScreen() {
  game.openHomeMenu();
  syncGameConfigurationToMenu();
  ui.homeScreen.classList.add("visible");
}

function closeHomeScreen() {
  ui.homeScreen.classList.remove("visible");
}

function unlockAudio() {
  audio.unlock();
}

// —— 中文播報(2026-07-10 使用者點名):畫面字幕條+語音同步唸 ——
// 詞庫隨機挑句,依比分情境加「反超/追平/拉開」;字幕條每次更新重播 pop 動畫。
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let lastLeadSign = 0; // 上一次的比分差正負(判斷反超/追平)

// spoken=實際唸出的固定句(預烤 mp3 人聲;含隊名/比分的字幕只唸固定部分)
function pushCommentary(text, tone = "info", spoken = text) {
  const bar = ui.commentaryBar;
  if (!bar || !text) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = text;
  // 重播動畫
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  speakLine(spoken);
}

function scoreCommentary(event) {
  const t = event.teamLabel;
  // 字幕帶隊名,唸稿用固定句(對應 voicePhrases 預烤 mp3)
  const bank = event.points === 3
    ? [
        { sub: `三分線外開火——唰!${t} 三分命中!`, say: "三分線外開火——唰!三分命中!" },
        { sub: `好深的三分!${t} 手感發燙!`, say: "好深的三分!手感發燙!" },
        { sub: `${t} 冷靜出手,三分球應聲入網!`, say: "冷靜出手,三分球應聲入網!" },
      ]
    : [
        { sub: `${t} 切入上籃得手!`, say: "切入上籃得手!" },
        { sub: `${t} 中距離跳投,穩穩命中!`, say: "中距離跳投,穩穩命中!" },
        { sub: `漂亮的配合,${t} 輕鬆拿下 2 分!`, say: "漂亮的配合,輕鬆拿下兩分!" },
      ];
  const chosen = pick(bank);
  const diff = event.homeScore - event.awayScore;
  const sign = Math.sign(diff);
  let tail = "", tailSay = "";
  if (sign === 0) { tail = `雙方 ${event.homeScore} 平,戰成拉鋸!`; tailSay = "戰成拉鋸!"; }
  else if (lastLeadSign !== 0 && sign !== lastLeadSign) { tail = `${t} 反超了!${event.homeScore} 比 ${event.awayScore}!`; tailSay = "反超了!"; }
  else if (Math.abs(diff) >= 10) { tail = `分差拉開到 ${Math.abs(diff)} 分。`; tailSay = "分差拉開了!"; }
  else tail = `${event.homeScore} 比 ${event.awayScore}。`;
  lastLeadSign = sign;
  void tailSay; // 一次只唸一句(主句);情境尾聲交給字幕
  return { sub: `${chosen.sub} ${tail}`, say: chosen.say };
}

function handleGameEvent(event) {
  switch (event.type) {
    case "match-start": {
      audio.whistle();
      audio.vibrate(18);
      lastLeadSign = 0;
      const line = pick(["比賽開始!雙方跳球爭搶!", "哨聲響起,全場對決開打!", "球員就位——比賽開始!"]);
      pushCommentary(line);
      break;
    }
    case "period-start":
      audio.whistle();
      if (event.announce) pushCommentary(event.announce, "info", "新的一節,開始!");
      break;
    case "period-end": {
      audio.buzzer();
      audio.vibrate([70, 40, 90]);
      pushCommentary(`${event.period || "本節"}結束!`, "info", "本節結束!");
      break;
    }
    case "score": {
      audio.swish();
      audio.scoreSting();
      audio.vibrate([35, 25, 55]);
      if (event.dunk) {
        pushCommentary(`${event.teamLabel} 飛身暴扣!全場沸騰!`, event.team === "home" ? "hot" : "cool", "飛身暴扣!全場沸騰!");
        break;
      }
      if (event.freeThrow) {
        pushCommentary(`${event.teamLabel} 罰球命中,+1 分。(${event.homeScore}:${event.awayScore})`, event.team === "home" ? "hot" : "cool", "罰球命中!");
        break;
      }
      const line = scoreCommentary(event);
      pushCommentary(line.sub, event.team === "home" ? "hot" : "cool", line.say);
      break;
    }
    case "steal": {
      audio.steal();
      audio.vibrate(28);
      const line = pick([
        { sub: `漂亮的抄截!${event.teamLabel} 打出反擊!`, say: "漂亮的抄截!打出反擊!" },
        { sub: `${event.teamLabel} 眼明手快,把球抄走了!`, say: "眼明手快,把球抄走了!" },
        { sub: `一個閃神——${event.teamLabel} 抄截成功!`, say: "一個閃神,球被抄截了!" },
      ]);
      pushCommentary(line.sub, event.team === "home" ? "hot" : "cool", line.say);
      break;
    }
    case "rebound": {
      audio.rebound();
      const line = pick([
        { sub: `${event.teamLabel} 搶下籃板!`, say: "搶下籃板!" },
        { sub: `籃板球是 ${event.teamLabel} 的!`, say: "籃板球到手!" },
        { sub: `卡好位置,${event.teamLabel} 保護住籃板。`, say: "卡好位置,保護住籃板。" },
      ]);
      pushCommentary(line.sub, event.team === "home" ? "hot" : "cool", line.say);
      break;
    }
    case "out-of-bounds": {
      audio.whistle();
      pushCommentary(`${event.teamLabel} 帶球出界,交換球權!`, "info", "");
      break;
    }
    case "foul": {
      audio.whistle();
      audio.vibrate([40, 30, 40]);
      pushCommentary(`哨聲響起——防守犯規!${event.teamLabel} 獲得 ${event.count} 次罰球!`, "hot", "防守犯規,罰球兩次!");
      break;
    }
    case "steal-try":
      audio.thud(0.5);
      pushCommentary("出手抄截——差一點!", "info", "");
      break;
    case "contact":
      audio.thud(event.strength);
      break;
    case "ball-bounce":
      audio.thud(event.strength * 0.35);
      break;
    case "match-end": {
      audio.horn();
      audio.vibrate([110, 50, 120]);
      const line = `終場哨響!${event.winnerLabel} 獲勝,最終比分 ${event.homeScore} 比 ${event.awayScore}!`;
      pushCommentary(line, event.winnerTeam === "home" ? "hot" : "cool", "終場哨響!比賽結束!");
      break;
    }
    default:
      break;
  }
}

game.onEvent = handleGameEvent;

game.onHudUpdate = (state) => {
  ui.homeScore.textContent = String(state.homeScore);
  ui.awayScore.textContent = String(state.awayScore);
  ui.homeTeamName.textContent = state.homeLabel;
  ui.awayTeamName.textContent = state.awayLabel;
  ui.gameClock.textContent = state.gameClock;
  ui.shotClock.textContent = state.shotClock;
  ui.periodLabel.textContent = state.periodCode;
  ui.modeCode.textContent = state.modeCode;
  ui.phaseLabel.textContent = state.phaseLabel;
  ui.statusMessage.textContent = state.message;
  ui.modeLabel.textContent = state.modeLabel;
  ui.possessionLabel.textContent = state.possession;
  ui.controlledLabel.textContent = state.controlled;
  ui.difficultyLabel.textContent = state.difficulty;
  ui.homeThemeLabel.textContent = state.homeThemeLabel;
  ui.awayThemeLabel.textContent = state.awayThemeLabel;
  ui.shotMeterText.textContent = state.shotMeterText;
  ui.staminaValue.textContent = `${Math.round(state.stamina * 100)}%`;
  ui.pauseButton.textContent = state.pauseLabel;
  ui.shotMeterWindow.style.left = `${state.shotWindowStart * 100}%`;
  ui.shotMeterWindow.style.width = `${state.shotWindowSize * 100}%`;
  setMeterFill(ui.shotMeterFill, state.shotMeterValue);
  setMeterFill(ui.staminaFill, state.stamina);
  syncOverlay(state.overlay);
};

for (const [id, theme] of Object.entries(TEAM_THEMES)) {
  ui.homeThemeSelect.insertAdjacentHTML(
    "beforeend",
    `<option value="${id}">${theme.name}</option>`,
  );
  ui.awayThemeSelect.insertAdjacentHTML(
    "beforeend",
    `<option value="${id}">${theme.name}</option>`,
  );
}

syncGameConfigurationToMenu();
setAudioState(audioEnabled);
ui.saveStatus.textContent = hasSavedGame() ? "已有存檔" : "尚未存檔";

ui.modeCardGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".mode-card");
  if (!button) {
    return;
  }

  unlockAudio();
  audio.uiTap();
  selectedModeId = button.dataset.mode;
  syncMenuCards();
  const isRace = selectedModeId === "raceto";
  ui.targetScoreInput.hidden = !isRace;
  ui.targetScoreLabel.hidden = !isRace;
  saveSettings({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    homeThemeId: selectedHomeThemeId,
    awayThemeId: selectedAwayThemeId,
    audioEnabled,
  });
});

ui.homeThemeSelect.addEventListener("change", (event) => {
  selectedHomeThemeId = event.target.value;
  applyCssTheme(selectedHomeThemeId, selectedAwayThemeId);
  saveSettings({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    homeThemeId: selectedHomeThemeId,
    awayThemeId: selectedAwayThemeId,
    audioEnabled,
  });
});

ui.awayThemeSelect.addEventListener("change", (event) => {
  selectedAwayThemeId = event.target.value;
  applyCssTheme(selectedHomeThemeId, selectedAwayThemeId);
  saveSettings({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    homeThemeId: selectedHomeThemeId,
    awayThemeId: selectedAwayThemeId,
    audioEnabled,
  });
});

ui.menuDifficultySelect.addEventListener("change", (event) => {
  selectedDifficulty = event.target.value;
  saveSettings({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    homeThemeId: selectedHomeThemeId,
    awayThemeId: selectedAwayThemeId,
    audioEnabled,
  });
});

ui.targetScoreInput.addEventListener("change", (event) => {
  selectedTargetScore = Math.max(5, Math.min(99, Math.round(Number(event.target.value) || 21)));
  event.target.value = String(selectedTargetScore);
});

ui.teamSizeSelect.addEventListener("change", (event) => {
  selectedTeamSize = Number(event.target.value);
});

ui.courtModeSelect.addEventListener("change", (event) => {
  selectedCourtMode = event.target.value;
});

ui.audioSelect.addEventListener("change", (event) => {
  unlockAudio();
  audio.uiTap();
  setAudioState(event.target.value === "on");
});

ui.startMatchButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  game.applyPresentation({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    homeThemeId: selectedHomeThemeId,
    awayThemeId: selectedAwayThemeId,
    teamSize: selectedTeamSize,
    courtMode: selectedCourtMode,
    targetScore: selectedTargetScore,
  });
  game.startSelectedMatch();
  closeHomeScreen();
  ui.saveStatus.textContent = "開始新比賽";
});

function loadIntoUi() {
  const loaded = game.loadGame();
  if (loaded) {
    syncGameConfigurationToMenu();
    closeHomeScreen();
  }
  ui.saveStatus.textContent = loaded ? "已讀取存檔" : "沒有可讀取的存檔";
}

ui.continueSavedButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  loadIntoUi();
});

ui.loadButton.addEventListener("click", loadIntoUi);
ui.overlayLoadButton.addEventListener("click", loadIntoUi);

ui.menuButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  openHomeScreen();
});

ui.overlayMenuButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  openHomeScreen();
});

ui.cameraButton.addEventListener("click", () => {
  game.cycleCameraView();
});

ui.saveButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  game.saveGame();
  ui.saveStatus.textContent = "已手動存檔";
});

ui.audioButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  setAudioState(!audioEnabled);
});

ui.pauseButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  game.togglePause();
});

ui.resumeButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  game.resume();
});

window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ui.installButton.hidden = false;
  ui.installHint.textContent = "已偵測到可安裝版本，點一下就能加入主畫面。";
});

ui.installButton.addEventListener("click", async () => {
  unlockAudio();
  audio.uiTap();
  if (!deferredInstallPrompt) {
    ui.installHint.textContent = "如果是 iPhone，請用分享選單的「加入主畫面」。";
    return;
  }

  deferredInstallPrompt.prompt();
  const outcome = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  ui.installButton.hidden = true;
  ui.installHint.textContent =
    outcome.outcome === "accepted" ? "安裝要求已送出。" : "你可以之後再安裝。";
});

window.addEventListener("appinstalled", () => {
  ui.installButton.hidden = true;
  ui.installHint.textContent = "已安裝到裝置。";
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.saveGame(true);
  }
});

// dev(localhost)不註冊 SW——SW 快取會讓每次改動都吃到「上一版」,害測試誤判(07-11 踩雷)
if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      ui.installHint.textContent = "Service Worker 註冊失敗，但仍可直接遊玩。";
    });
  });
}

game.start();
