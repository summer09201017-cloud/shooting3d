import * as THREE from "three";
import { InputManager } from "./input.js";
import { loadSettings, saveSettings, loadSavedGame, saveGameState } from "./storage.js";

// —— 3D 射箭(archery3d)——
// 照抄 baseball3d / 籃球CO 的 3d-game-kit 骨架:renderer/scene/lights、makePerson 臉部鐵則、
// 相機視角檔 + lerp、單指蓄力放開。玩法核心:拉弓蓄力 → 準星晃動(屏息越久越晃)→ 順逆風偏移
// → 箭道拋物線 → 靶環計分。★判定=畫面(鐵則4):放箭當下先算出命中點(瞄準+晃動+風),
// 再把箭「演」到那個點——畫面說不通的分數=bug。

// ---------- 可調量值(開場 UI 可選,預設只是預設) ----------
// 量值經 2026-07-12 自我對戰校正(80 箭×2 玩家模型:生手 σ0.22 不補風/熟練 σ0.09 補風 55%):
// 目標梯度=生手在 kids 有成就感(平均 8 環+),熟練在 hard 有張力(平均 ~6.5、會脫靶)。
export const DIFFICULTY_PRESETS = {
  kids: { distance: 13, swayBase: 0.012, swayGrow: 0.1, wind: 0.015, drawDuration: 0.5, aimAssist: 0.68 },
  child: { distance: 15, swayBase: 0.03, swayGrow: 0.25, wind: 0.06, drawDuration: 0.58, aimAssist: 0.42 },
  easy: { distance: 18, swayBase: 0.07, swayGrow: 0.45, wind: 0.14, drawDuration: 0.64, aimAssist: 0.2 },
  normal: { distance: 22, swayBase: 0.12, swayGrow: 0.8, wind: 0.26, drawDuration: 0.7, aimAssist: 0.06 },
  hard: { distance: 30, swayBase: 0.2, swayGrow: 1.15, wind: 0.42, drawDuration: 0.78, aimAssist: 0 },
};

export const DIFFICULTY_LABELS = {
  kids: "幼兒(超簡單)",
  child: "兒童(簡單)",
  easy: "入門",
  normal: "標準",
  hard: "職業",
};

export const GAME_MODES = {
  practice: {
    label: "練習場",
    arrowsPerEnd: 3,
    endCount: 999,
    endless: true,
    description: "無限箭數,自由熟悉拉弓、抓風向、屏息時機。",
    goal: "純練手感,不計勝負",
  },
  standard: {
    label: "計分賽",
    arrowsPerEnd: 3,
    endCount: 6,
    description: "6 局 × 3 箭,滿分 180 分。",
    goal: "總分越高越好",
  },
  bullseye: {
    label: "紅心挑戰",
    arrowsPerEnd: 1,
    endCount: 10,
    description: "10 箭,盡量射進紅心(9、10 環)。",
    goal: "紅心數越多越好",
  },
};

export function getModeConfig(modeId) {
  return GAME_MODES[modeId] || GAME_MODES.standard;
}

// ---------- 靶 / 場地常數 ----------
const TARGET_R = 0.72; // 靶面半徑(世界單位)
const TARGET_CENTER_Y = 1.38; // 紅心高度(約眼平)
const BOW_TIP = new THREE.Vector3(-0.38, 1.6, 0.58); // 放箭起點=左手持弓處(過肩視角射手偏左,弓在其左側可見)
// 靶環顏色(World Archery 由外到內:白/黑/藍/紅/金),每色=2 環寬 0.2R
const RING_COLORS = [0xf3f4f6, 0x25272b, 0x3f9be0, 0xe8443c, 0xf6d743];

// ---------- 小工具 ----------
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
function randomSigned(scale) {
  return (Math.random() * 2 - 1) * scale;
}

// ---------- 人物(臉部鐵則:眼白+黑瞳+眉毛+微笑,貼頭前側 +z) ----------
// ★關節人物鐵則(07-12 拍板):肢體一律雙節——上段(上臂/大腿)+關節(肘/膝)+下段(前臂/小腿)+末端(手掌/腳掌)。
// pivot=肩/髖關節;joint=肘/膝關節(掛在上段末端,旋轉它=彎肘/彎膝)。
function createLimb({
  upperMaterial,
  lowerMaterial,
  endMaterial,
  upperLen,
  lowerLen,
  upperRadius,
  lowerRadius,
  end = "hand", // hand:五指手掌(07-12 拍板不要圓球手) | foot:腳掌(朝 +z)
  thumbSide = 1, // 拇指朝向(+1=局部 +x;左手傳 +1、右手傳 -1 → 拇指朝身體)
}) {
  const pivot = new THREE.Group();
  const upper = new THREE.Mesh(
    new THREE.CapsuleGeometry(upperRadius, upperLen, 4, 8),
    upperMaterial,
  );
  upper.position.y = -upperLen / 2;
  pivot.add(upper);

  const joint = new THREE.Group();
  joint.position.y = -upperLen;
  pivot.add(joint);

  const lower = new THREE.Mesh(
    new THREE.CapsuleGeometry(lowerRadius, lowerLen, 4, 8),
    lowerMaterial,
  );
  lower.position.y = -lowerLen / 2;
  joint.add(lower);

  let endMesh;
  if (end === "foot") {
    endMesh = new THREE.Mesh(
      new THREE.BoxGeometry(lowerRadius * 2.1, lowerRadius, lowerRadius * 3.4),
      endMaterial,
    );
    endMesh.position.set(0, -lowerLen - lowerRadius * 0.4, lowerRadius * 0.9);
  } else {
    // 五指手:掌心方塊+四指微彎+拇指斜出(低多邊形塊狀,同系列風格)
    const r = lowerRadius;
    endMesh = new THREE.Group();
    endMesh.position.y = -lowerLen - r * 0.2;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, r * 1.7, r * 1.0), endMaterial);
    palm.position.y = -r * 0.85;
    endMesh.add(palm);
    for (let i = 0; i < 4; i += 1) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(r * 0.44, r * 1.25, r * 0.55), endMaterial);
      finger.position.set((i - 1.5) * r * 0.54, -r * 2.1, 0);
      finger.rotation.x = 0.14; // 指尖微彎,放鬆手型
      endMesh.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 1.0, r * 0.55), endMaterial);
    thumb.position.set(thumbSide * r * 1.3, -r * 0.95, r * 0.1);
    thumb.rotation.z = thumbSide * -0.55;
    endMesh.add(thumb);
  }
  joint.add(endMesh);

  return { pivot, upper, joint, lower, end: endMesh };
}

const HAIR_COLORS = [0x2b2119, 0x4a3120, 0x151515, 0x5e4630, 0x7a5636, 0x3a3a45];

// gender(07-12 拍板「一半男生,不要穿裙子」):m=直筒褲頭+短髮;f=裙襬微張+妹妹頭
function makePerson({ shirt = 0x2f6f4e, pants = 0x2a3550, skin = 0xf3cca6, hair = 0x2b2119, gender = "m", scale = 1 } = {}) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.72 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.8 });
  // 膚色加 emissive,否則臉在光背面看不清(臉部鐵則)
  const skinMat = new THREE.MeshStandardMaterial({
    color: skin,
    roughness: 0.78,
    emissive: 0x8a7355,
    emissiveIntensity: 0.5,
  });

  // 身體雙節:胸腔(上)+腰部(下)——腰要收進去(07-12 使用者點名不要水桶腰):
  // 胸寬 0.3 → 腰最細 0.21 → 髖再放回 0.27,側影有曲線
  // 比例(07-12 拍板):上身短一點、下半身/腿長一點、頭胸之間有脖子
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.34, 6, 12), shirtMat);
  chest.position.y = 1.3;
  rig.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 12), skinMat);
  neck.position.y = 1.76;
  rig.add(neck);
  const waist = new THREE.Group();
  waist.position.y = 1.04;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.3, 14), shirtMat);
  belly.position.y = -0.05;
  waist.add(belly);
  const hip = new THREE.Mesh(
    gender === "f"
      ? new THREE.CylinderGeometry(0.22, 0.29, 0.22, 14) // 女:裙襬微張
      : new THREE.CylinderGeometry(0.22, 0.235, 0.2, 14), // 男:直筒褲頭,不要裙子
    pantsMat,
  );
  hip.position.y = -0.26;
  waist.add(hip);
  const beltLine = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.6 }));
  beltLine.position.y = -0.15;
  waist.add(beltLine);
  rig.add(waist);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 18), skinMat);
  head.position.y = 2.0;
  rig.add(head);

  // 耳朵(所有人物都要有,07-12 拍板):頭兩側膚色半橢球,壓扁貼頭
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), skinMat);
  earL.scale.set(0.45, 1, 0.8);
  earL.position.set(-0.245, 1.99, 0);
  rig.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.245;
  rig.add(earR);

  // 頭髮(07-12 拍板):球冠罩頭頂(收窄到耳朵上緣,耳朵前面不留髮)+後腦半球帶(只蓋耳後)
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.85 });
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.265, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.46),
    hairMat,
  );
  hairCap.position.y = 2.01;
  hairCap.rotation.x = -0.22; // 微往後腦傾:露出額頭,但正面仍看得到瀏海線
  rig.add(hairCap);
  // 後腦帶:phi 只掃後半球(z<0),到耳線為止——耳朵前面完全無髮;男=俐落短髮,女=妹妹頭蓋後頸
  const hairBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.255, 16, 8, Math.PI, Math.PI, Math.PI * 0.35, Math.PI * (gender === "f" ? 0.38 : 0.22)),
    hairMat,
  );
  hairBack.position.y = 2.0;
  rig.add(hairBack);

  // 臉:貼 +z(與身體同向)
  const faceDark = new THREE.MeshBasicMaterial({ color: 0x25201a });
  const faceWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), faceWhite);
  eyeL.position.set(-0.09, 2.06, 0.21);
  rig.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.09;
  rig.add(eyeR);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), faceDark);
  pupilL.position.set(-0.09, 2.06, 0.25);
  rig.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.09;
  rig.add(pupilR);
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), faceDark);
  browL.position.set(-0.09, 2.14, 0.22);
  browL.rotation.z = 0.16;
  rig.add(browL);
  const browR = browL.clone();
  browR.position.x = 0.09;
  browR.rotation.z = -0.16;
  rig.add(browR);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 14, Math.PI), faceDark);
  smile.position.set(0, 1.92, 0.21);
  smile.rotation.z = Math.PI;
  rig.add(smile);

  // 手臂:上臂穿短袖(衣色)+前臂與手掌(膚色);肘關節可彎
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85 });
  const mkArm = (x) => {
    const arm = createLimb({
      upperMaterial: shirtMat,
      lowerMaterial: skinMat,
      endMaterial: skinMat,
      upperLen: 0.27,
      lowerLen: 0.26,
      upperRadius: 0.07,
      lowerRadius: 0.058,
      end: "hand",
      thumbSide: x < 0 ? 1 : -1, // 拇指朝身體側
    });
    arm.pivot.position.set(x, 1.6, 0);
    // 自然垂放時肘微彎,不要筆直樂高手
    arm.joint.rotation.x = -0.18;
    rig.add(arm.pivot);
    return arm;
  };
  const leftArm = mkArm(-0.4);
  const rightArm = mkArm(0.4);

  // 腿:大腿+小腿(褲色)+腳掌(鞋);膝關節可彎
  const mkLeg = (x) => {
    const leg = createLimb({
      upperMaterial: pantsMat,
      lowerMaterial: pantsMat,
      endMaterial: shoeMat,
      upperLen: 0.34,
      lowerLen: 0.32,
      upperRadius: 0.09,
      lowerRadius: 0.072,
      end: "foot",
    });
    leg.pivot.position.set(x, 0.88, 0);
    // 站姿:大腿微前、膝微彎,重心自然
    leg.pivot.rotation.x = -0.05;
    leg.joint.rotation.x = 0.1;
    rig.add(leg.pivot);
    return leg;
  };
  const leftLeg = mkLeg(-0.15);
  const rightLeg = mkLeg(0.15);

  group.scale.setScalar(scale);
  return { group, rig, head, waist, leftArm, rightArm, leftLeg, rightLeg };
}

// ---------- 弓 + 箭 ----------
function makeBow() {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.5, metalness: 0.1 });
  // 弓身:半圓弧(繞 z 開口朝向 -x,握把在中央)
  const limb = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 8, 20, Math.PI * 1.1), woodMat);
  limb.rotation.z = Math.PI / 2 - 0.15;
  group.add(limb);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), woodMat);
  group.add(grip);
  // 弓弦:三點折線(上弦耳 → 搭箭點 → 下弦耳),搭箭點會隨拉弓後移
  const stringMat = new THREE.LineBasicMaterial({ color: 0xf4f0e4 });
  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.4, 0),
    new THREE.Vector3(0, 0, 0.02),
    new THREE.Vector3(0, -0.4, 0),
  ]);
  const string = new THREE.Line(stringGeo, stringMat);
  group.add(string);
  return { group, string, stringGeo };
}

function makeArrow(scale = 1) {
  const group = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: 0.6 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.92, 8), shaftMat);
  shaft.rotation.x = Math.PI / 2; // 沿 +z 躺平
  shaft.position.z = 0;
  group.add(shaft);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.022, 0.09, 8),
    new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.5, roughness: 0.4 }),
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.5;
  group.add(tip);
  const fletchMat = new THREE.MeshStandardMaterial({ color: 0xd8433c, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i += 1) {
    const fletch = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.07), fletchMat);
    fletch.position.z = -0.4;
    fletch.rotation.z = (i / 3) * Math.PI * 2;
    fletch.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    fletch.rotation.z = 0;
    fletch.position.set(0, 0.05, -0.4);
    holder.add(fletch);
    group.add(holder);
  }
  group.scale.setScalar(scale);
  return group;
}

export class ArcheryGame {
  constructor({ canvas, touchRoot }) {
    this.canvas = canvas;
    this.touchRoot = touchRoot;

    const settings = loadSettings();
    this.difficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "normal";
    this.modeId = GAME_MODES[settings.modeId] ? settings.modeId : "standard";
    this.mode = getModeConfig(this.modeId);

    this.input = new InputManager();
    this.input.bindTouchButtons(this.touchRoot);

    this.onHudUpdate = null;
    this.onEvent = null;

    this.running = false;
    this.time = 0;
    this.phase = "menu"; // menu | ready | drawing | flying | scored | ended
    this.message = "在首頁選擇模式與難度後開始。";
    this.cameraView = 0; // 0 射手後方(瞄準,鎖) 1 靶面特寫 2 高空俯瞰 3 側面轉播
    this.autoSaveTimer = 0;

    // 每箭狀態
    this.drawT = 0;
    this.holdAtFull = 0;
    this.power = 0;
    this.swayT = randomBetween(0, 10);
    this.aim = new THREE.Vector2(0, TARGET_CENTER_Y); // 瞄準點(靶面世界座標 x,y)
    this.pointerNDC = null; // 有滑鼠/觸控移動才更新
    this.reticleOffset = new THREE.Vector2(); // 當前晃動+偏移(顯示用)
    this.wind = new THREE.Vector2(); // 未補償時的漂移量(世界單位)
    this.arrowFlight = null; // {mesh, from, to, t, dur}
    this.scoreTimer = 0;
    this.betweenTimer = 0;

    // 比賽計分
    this.totalScore = 0;
    this.endNumber = 1;
    this.endScore = 0;
    this.arrowInEnd = 0;
    this.arrowsShotTotal = 0;
    this.bullseyeCount = 0;
    this.lastRing = null;
    this.plantedArrows = [];

    this.overlay = { visible: false, eyebrow: "", title: "", text: "", canResume: false };

    // ---- three ----
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc4e8);
    this.scene.fog = new THREE.Fog(0x9fd0ee, 34, 72);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
    this.camPos = new THREE.Vector3(0.02, 2.05, -3.4);
    this.camLook = new THREE.Vector3(0, TARGET_CENTER_Y, 12);
    this.camera.position.copy(this.camPos);

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this._targetPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // z = distance,下面 setDistance 更新

    this.setupScene();
    this.setDistance(DIFFICULTY_PRESETS[this.difficulty].distance);
    this.setupInput();

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.pushHud();
  }

  emitEvent(type, payload = {}) {
    if (this.onEvent) this.onEvent({ type, ...payload });
  }

  // ---------- 場景 ----------
  setupScene() {
    const sun = new THREE.HemisphereLight(0xffffff, 0x557040, 1.35);
    this.scene.add(sun);
    const key = new THREE.DirectionalLight(0xfff2d4, 2.0);
    key.position.set(6, 16, -6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ccbff, 0.7);
    rim.position.set(-8, 10, 8);
    this.scene.add(rim);

    // 草地跑道
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 120),
      new THREE.MeshStandardMaterial({ color: 0x4f8a44, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.z = 30;
    this.scene.add(grass);
    // 射道(淺色帶)
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 120),
      new THREE.MeshStandardMaterial({ color: 0x6ba85c, roughness: 1 }),
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.01, 30);
    this.scene.add(lane);
    // 射擊線
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.02, 0.4);
    this.scene.add(line);

    // 射手(手繪向量人,持弓)
    this.archer = makePerson({ shirt: 0x2f6f4e, pants: 0x38424f, scale: 1 });
    this.archer.group.position.set(0, 0, 0);
    this.scene.add(this.archer.group);
    // 左臂前伸持弓(肘幾乎打直)、右臂搭弦(上臂水平朝前;draw 時前臂沿箭線往「後」折=真實開弓)
    this.archer.leftArm.pivot.rotation.x = -Math.PI / 2;
    this.archer.leftArm.joint.rotation.x = -0.08;
    this.archer.rightArm.pivot.rotation.x = -Math.PI / 2 + 0.08;
    this.archer.rightArm.joint.rotation.x = -0.7;

    this.bow = makeBow();
    this.bow.group.position.copy(BOW_TIP);
    this.scene.add(this.bow.group);

    // 搭在弦上的箭(未放時顯示)
    this.nockedArrow = makeArrow(1);
    this.scene.add(this.nockedArrow);

    // 準星
    const retMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.reticle = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 24), retMat);
    this.reticle.add(ring);
    for (let i = 0; i < 4; i += 1) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.05), retMat);
      tick.position.set(Math.cos((i * Math.PI) / 2) * 0.1, Math.sin((i * Math.PI) / 2) * 0.1, 0);
      tick.rotation.z = (i * Math.PI) / 2;
      this.reticle.add(tick);
    }
    this.scene.add(this.reticle);

    // 風旗(靶邊)
    this.flag = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xcccccc }),
    );
    pole.position.y = 1.6;
    this.flag.add(pole);
    this.flagCloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff7043, roughness: 0.8, side: THREE.DoubleSide }),
    );
    this.flagCloth.position.set(0.45, 3.0, 0);
    this.flag.add(this.flagCloth);
    this.scene.add(this.flag);

    this.buildTarget();
    this.buildCrowd();

    // 最新一箭標記(07-12 拍板):發光圈套在剛射中的箭上,update 內脈動——玩家一眼看出剛射到哪
    this.latestMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.014, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95 }),
    );
    this.latestMarker.visible = false;
    this.scene.add(this.latestMarker);
  }

  buildTarget() {
    if (this.targetGroup) this.scene.remove(this.targetGroup);
    const group = new THREE.Group();
    // 背板
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(TARGET_R * 2.35, TARGET_R * 2.35, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.9 }),
    );
    group.add(backing);
    // 五色環(外→內):白/黑/藍/紅/金,每色寬 0.2R
    for (let i = 0; i < 5; i += 1) {
      const outer = TARGET_R * (1 - i * 0.2);
      const inner = TARGET_R * (1 - (i + 1) * 0.2);
      const geo = i === 4
        ? new THREE.CircleGeometry(outer, 40)
        : new THREE.RingGeometry(Math.max(inner, 0.001), outer, 44);
      const ring = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: RING_COLORS[i], roughness: 0.75, side: THREE.DoubleSide }),
      );
      // group 之後會 rotation.y=PI 朝向射手:局部 +z 才是「面向射手」那側,環要放背板前(+0.041)
      ring.position.z = 0.041 + i * 0.001; // 內圈略微前疊避免 z-fighting
      ring.rotation.y = Math.PI; // CircleGeometry 正面朝局部 +z,翻半圈讓正面隨 group 朝射手
      group.add(ring);
    }
    // 立架(從靶底接到地面)
    const standH = TARGET_CENTER_Y - TARGET_R;
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, standH, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2a }),
    );
    stand.position.y = -(TARGET_R + standH / 2);
    group.add(stand);

    group.rotation.y = Math.PI; // 靶面朝向射手(-z)
    this.targetGroup = group;
    // ★判定=畫面:靶「畫面中心」必須=計分中心 TARGET_CENTER_Y(修 07-12 bug:視覺靶被抬高 0.65,
    // 害「射中下方黑環卻算高分、黃心算低分」——計分沒錯,是畫面騙人)
    if (this.distance) group.position.set(0, TARGET_CENTER_Y, this.distance);
    this.scene.add(group);
    this.plantedArrows = [];
  }

  buildCrowd() {
    // 少量有臉觀眾在射道兩側(臉朝射道);半徑 > 相機距離,避免擋鏡頭
    this.crowd = new THREE.Group();
    const shirts = [0xd98a3d, 0x3d78d9, 0xc94f8f, 0x4fae6a, 0xb0552f];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        const p = makePerson({
          shirt: shirts[(i + (side > 0 ? 2 : 0)) % shirts.length],
          pants: 0x2c3340,
          hair: HAIR_COLORS[(i * 2 + (side > 0 ? 3 : 0)) % HAIR_COLORS.length],
          gender: (i + (side > 0 ? 1 : 0)) % 2 === 0 ? "m" : "f", // 一半男生一半女生(07-12 拍板)
          scale: 0.9,
        });
        p.group.position.set(side * 4.2, 0, 1.5 + i * 2.1);
        p.group.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2; // 臉朝射道
        this.crowd.add(p.group);
      }
    }
    this.scene.add(this.crowd);
  }

  setDistance(dist) {
    this.distance = dist;
    if (this.targetGroup) this.targetGroup.position.set(0, TARGET_CENTER_Y, dist);
    if (this.flag) this.flag.position.set(-(TARGET_R + 1.4), 0, dist - 0.5);
    this._targetPlane.constant = dist; // plane normal (0,0,-1): -z + d = 0 → z = d
  }

  // ---------- 輸入(單指:按住拉弓、放開放箭;移動=瞄準) ----------
  setupInput() {
    const setNDCFromEvent = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerNDC = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
    };
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setNDCFromEvent(event);
      this.beginDraw();
    });
    this.canvas.addEventListener("pointermove", (event) => {
      setNDCFromEvent(event);
    });
    const releaseHandler = (event) => {
      if (event) setNDCFromEvent(event);
      this.releaseDraw();
    };
    this.canvas.addEventListener("pointerup", releaseHandler);
    this.canvas.addEventListener("pointerleave", () => {
      // 指標離開畫布時放箭(避免卡在拉滿)
      if (this.phase === "drawing") this.releaseDraw();
    });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  // ---------- 局面控制 ----------
  applyPresentation({ difficulty, modeId }) {
    if (difficulty && DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
    if (modeId && GAME_MODES[modeId]) {
      this.modeId = modeId;
      this.mode = getModeConfig(modeId);
    }
    this.setDistance(DIFFICULTY_PRESETS[this.difficulty].distance);
    saveSettings({ difficulty: this.difficulty, modeId: this.modeId });
    this.message = `${this.mode.label} · ${DIFFICULTY_LABELS[this.difficulty]} 已設定。`;
    this.pushHud();
  }

  openHomeMenu() {
    this.phase = "menu";
    this.message = "在首頁選擇模式與難度後開始。";
    this.overlay.visible = false;
    this.pushHud();
  }

  startSelectedMatch() {
    this.totalScore = 0;
    this.endNumber = 1;
    this.endScore = 0;
    this.arrowInEnd = 0;
    this.arrowsShotTotal = 0;
    this.bullseyeCount = 0;
    this.lastRing = null;
    this.setDistance(DIFFICULTY_PRESETS[this.difficulty].distance);
    this.buildTarget();
    this.emitEvent("match-start", { mode: this.mode.label });
    this.beginArrow();
  }

  beginArrow() {
    this.phase = "ready";
    this.drawT = 0;
    this.holdAtFull = 0;
    this.power = 0;
    this.aim.set(0, TARGET_CENTER_Y);
    this.rollWind();
    this.message = "按住拉弓,移動瞄準,放開放箭。";
    this.pushHud();
  }

  rollWind() {
    const w = DIFFICULTY_PRESETS[this.difficulty].wind * TARGET_R;
    this.wind.set(randomSigned(w), randomSigned(w * 0.55));
  }

  beginDraw() {
    // 計分停留中:點一下=玩家決定繼續(回射手後方、開下一箭)
    if (this.phase === "scored") {
      this.advanceAfterScore();
      return;
    }
    if (this.phase !== "ready") return;
    this.phase = "drawing";
    this.drawT = 0;
    this.holdAtFull = 0;
    this.emitEvent("draw-start");
    this.message = "拉弓中……穩住,抓準風向。";
  }

  releaseDraw() {
    if (this.phase !== "drawing") return;
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    this.power = clamp(this.drawT / preset.drawDuration, 0, 1);
    if (this.power < 0.22) {
      // 拉力不足:不算一箭,回到 ready
      this.phase = "ready";
      this.message = "拉力不足——再拉滿一點再放。";
      this.pushHud();
      return;
    }
    this.fireArrow();
  }

  // ★判定=畫面:先算命中點,再把箭演到那個點
  fireArrow() {
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const powerFactor = 0.6 + this.power * 0.9; // 拉越滿→箭越快→風/晃影響越小
    // 命中點 = 瞄準 + 放箭當下的晃動 + 風漂(可被反向瞄準補償)
    const swayNow = this.currentSway();
    let impactX = this.aim.x + swayNow.x + this.wind.x / powerFactor;
    let impactY = this.aim.y + swayNow.y + this.wind.y / powerFactor;
    // 拉不滿額外下墜(箭偏弱)
    if (this.power < 0.6) impactY -= (0.6 - this.power) * TARGET_R * 0.5;
    // 幼兒/兒童瞄準輔助:把命中點往紅心拉一點
    if (preset.aimAssist > 0) {
      impactX += (0 - impactX) * preset.aimAssist * 0.35;
      impactY += (TARGET_CENTER_Y - impactY) * preset.aimAssist * 0.35;
    }
    const impact = new THREE.Vector3(impactX, impactY, this.distance);

    const arrow = makeArrow(1);
    const from = BOW_TIP.clone();
    arrow.position.copy(from);
    this.scene.add(arrow);
    const dist = from.distanceTo(impact);
    this.arrowFlight = {
      mesh: arrow,
      from,
      to: impact,
      t: 0,
      dur: dist / (30 + this.power * 26),
      arc: dist * 0.03 * (1.25 - this.power),
    };
    this.phase = "flying";
    this.nockedArrow.visible = false;
    this.emitEvent("release", { power: this.power });
    this.message = "放箭!";
    this.pushHud();
  }

  currentSway() {
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const amp = TARGET_R * preset.swayBase * (1 + this.holdAtFull * preset.swayGrow);
    return new THREE.Vector2(
      Math.sin(this.swayT * 2.1) * amp,
      Math.sin(this.swayT * 3.3 + 1.3) * amp * 0.82,
    );
  }

  resolveImpact() {
    const impact = this.arrowFlight.to;
    // 把箭插在靶上
    const planted = this.arrowFlight.mesh;
    planted.position.copy(impact);
    this.plantedArrows.push(planted);
    if (this.plantedArrows.length > 12) {
      const old = this.plantedArrows.shift();
      this.scene.remove(old);
    }
    this.arrowFlight = null;

    const dx = impact.x - 0;
    const dy = impact.y - TARGET_CENTER_Y;
    const r = Math.hypot(dx, dy);
    let ring = 0;
    if (r <= TARGET_R) ring = Math.max(1, 10 - Math.floor(r / (TARGET_R / 10)));
    this.lastRing = ring;
    this.endScore += ring;
    this.totalScore += ring;
    this.arrowInEnd += 1;
    this.arrowsShotTotal += 1;
    if (ring >= 9) this.bullseyeCount += 1;

    this.emitEvent("impact", {
      ring,
      isBull: ring >= 10,
      isGold: ring >= 9,
      miss: ring === 0,
      totalScore: this.totalScore,
    });

    // 靶面特寫停留(07-12 拍板):不自動跳回射手後方——玩家點一下畫面才繼續下一箭
    this.phase = "scored";
    this.cameraView = 1;
    // 最新一箭標記移到剛中的位置(脫靶時箭不在靶上,不標)
    if (ring > 0) {
      this.latestMarker.position.set(impact.x, impact.y, this.distance - 0.07);
      this.latestMarker.visible = true;
    } else {
      this.latestMarker.visible = false;
    }
    const ringText =
      ring === 0 ? "脫靶了……調整一下再來。" : ring >= 10 ? "正中紅心!十環!" : `${ring} 環!`;
    this.message = `${ringText}(點一下畫面,繼續下一箭)`;
    this.pushHud();
  }

  advanceAfterScore() {
    const arrowsPerEnd = this.mode.arrowsPerEnd;
    if (this.arrowInEnd >= arrowsPerEnd) {
      this.emitEvent("end-complete", { endNumber: this.endNumber, endScore: this.endScore });
      const isLastEnd = !this.mode.endless && this.endNumber >= this.mode.endCount;
      if (isLastEnd) {
        this.finishMatch();
        return;
      }
      this.endNumber += 1;
      this.endScore = 0;
      this.arrowInEnd = 0;
    }
    this.beginArrow();
  }

  finishMatch() {
    this.phase = "ended";
    const possible = this.mode.endless ? this.arrowsShotTotal * 10 : this.mode.endCount * this.mode.arrowsPerEnd * 10;
    const pct = possible > 0 ? this.totalScore / possible : 0;
    const grade = pct >= 0.9 ? "A+" : pct >= 0.78 ? "A" : pct >= 0.62 ? "B" : pct >= 0.45 ? "C" : "D";
    const detail =
      this.modeId === "bullseye"
        ? `紅心 ${this.bullseyeCount} / ${this.arrowsShotTotal} 箭`
        : `總分 ${this.totalScore} / ${possible}`;
    this.overlay = {
      visible: true,
      eyebrow: "比賽結束",
      title: `評等 ${grade}`,
      text: `${detail}。再來一場,挑戰更高分!`,
      canResume: false,
    };
    this.emitEvent("match-end", { total: this.totalScore, grade, bullseye: this.bullseyeCount });
    this.message = `比賽結束——${detail}。`;
    this.pushHud();
  }

  togglePause() {
    if (this.phase === "menu" || this.phase === "ended") return;
    if (this.overlay.visible) {
      this.resume();
    } else {
      this.overlay = { visible: true, eyebrow: "暫停中", title: "深呼吸一下", text: "準備好再繼續射箭。", canResume: true };
      this.pushHud();
    }
  }

  resume() {
    if (!this.overlay.canResume) return;
    this.overlay.visible = false;
    this.pushHud();
  }

  cycleCameraView() {
    this.cameraView = (this.cameraView + 1) % 4;
    const names = ["射手後方", "靶面特寫", "高空俯瞰", "側面轉播"];
    this.message = `複查視角:${names[this.cameraView]}(瞄準時自動回射手後方)。`;
    this.pushHud();
  }

  // ---------- 主迴圈 ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      const delta = Math.min(this.clock.getDelta(), 0.05);
      this.update(delta);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height || 1.6;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  update(delta) {
    this.time += delta;
    this.swayT += delta;
    const paused = this.overlay.visible;

    // 風旗飄動 + 依風向擺角
    if (this.flagCloth) {
      const windMag = this.wind.length();
      this.flagCloth.rotation.y = Math.sin(this.time * 6) * 0.25 + clamp(this.wind.x * 6, -1.1, 1.1);
      this.flagCloth.scale.x = 0.7 + Math.min(1, windMag * 3);
    }

    if (!paused) {
      if (this.phase === "ready" || this.phase === "drawing") {
        this.updateAim(delta);
      }
      if (this.phase === "drawing") {
        const preset = DIFFICULTY_PRESETS[this.difficulty];
        this.drawT += delta;
        this.power = clamp(this.drawT / preset.drawDuration, 0, 1);
        if (this.power >= 1) this.holdAtFull += delta;
        // 鍵盤:方向鍵微調瞄準
      }
      if (this.phase === "flying") this.updateFlight(delta);
      // scored:停在靶面特寫等玩家點擊(beginDraw 處理),不自動進下一箭
    }

    // 最新一箭標記脈動
    if (this.latestMarker && this.latestMarker.visible) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.18;
      this.latestMarker.scale.setScalar(pulse);
    }

    // 鍵盤輸入(空白鍵拉弓/放箭、方向鍵瞄準、V 視角)
    this.handleKeys(delta);

    this.updateArcherPose();
    this.updateReticle();
    this.updateCamera(delta);

    this.autoSaveTimer += delta;
    if (this.autoSaveTimer > 5) {
      this.autoSaveTimer = 0;
      this.saveGame(true);
    }

    this.input.endFrame();
    this.pushHud();
  }

  handleKeys(delta) {
    if (this.input.consumePress("camera")) this.cycleCameraView();
    if (this.input.consumePress("pause")) this.togglePause();
    if (this.overlay.visible) return;
    if (this.input.consumePress("shoot")) this.beginDraw();
    if (this.input.consumeRelease("shoot")) this.releaseDraw();
    // 方向鍵微調瞄準(世界單位)
    if (this.phase === "ready" || this.phase === "drawing") {
      const spd = TARGET_R * 0.9 * delta;
      const mv = this.input.getMovementVector(); // x:上下(前後) z:左右
      if (mv.z) this.aim.x = clamp(this.aim.x + mv.z * spd, -TARGET_R * 1.7, TARGET_R * 1.7);
      if (mv.x) this.aim.y = clamp(this.aim.y + mv.x * spd, TARGET_CENTER_Y - TARGET_R * 1.7, TARGET_CENTER_Y + TARGET_R * 1.7);
    }
  }

  updateAim(delta) {
    if (!this.pointerNDC) return;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this._targetPlane, hit)) {
      this.aim.x = clamp(hit.x, -TARGET_R * 1.7, TARGET_R * 1.7);
      this.aim.y = clamp(hit.y, TARGET_CENTER_Y - TARGET_R * 1.7, TARGET_CENTER_Y + TARGET_R * 1.7);
    }
  }

  updateFlight(delta) {
    const f = this.arrowFlight;
    if (!f) return;
    f.t += delta / f.dur;
    const t = clamp(f.t, 0, 1);
    const pos = new THREE.Vector3().lerpVectors(f.from, f.to, t);
    pos.y += Math.sin(Math.PI * t) * f.arc; // 拋物線視覺
    // 朝向 = 切線方向
    const ahead = new THREE.Vector3().lerpVectors(f.from, f.to, Math.min(1, t + 0.02));
    ahead.y += Math.sin(Math.PI * Math.min(1, t + 0.02)) * f.arc;
    f.mesh.position.copy(pos);
    f.mesh.lookAt(ahead);
    if (f.t >= 1) this.resolveImpact();
  }

  updateReticle() {
    const aiming = this.phase === "ready" || this.phase === "drawing";
    this.reticle.visible = aiming;
    if (!aiming) return;
    const sway = this.currentSway();
    this.reticleOffset.copy(sway);
    this.reticle.position.set(this.aim.x + sway.x, this.aim.y + sway.y, this.distance - 0.06);
    this.reticle.scale.setScalar(Math.max(1, this.distance / 7)); // 遠靶時放大,不然 22m 外小到看不見
    this.reticle.lookAt(this.camera.position);
  }

  updateArcherPose() {
    // 搭箭的弓弦與箭隨拉弓後移;右臂拉、左臂持弓
    const drawFrac = this.phase === "drawing" ? this.power : this.phase === "ready" ? 0 : 0;
    const back = drawFrac * 0.36;
    // 弦中點後移
    const pts = this.bow.stringGeo.attributes.position;
    pts.setXYZ(1, 0, 0, 0.02 + back * 0.6);
    pts.needsUpdate = true;
    // 搭箭:未放箭時顯示,位置從弓往後拉
    if (this.phase === "ready" || this.phase === "drawing") {
      this.nockedArrow.visible = true;
      this.nockedArrow.position.set(BOW_TIP.x, BOW_TIP.y, BOW_TIP.z - back);
      this.nockedArrow.rotation.set(0, 0, 0);
    } else {
      this.nockedArrow.visible = false;
    }
    // 拉弓姿勢隨 draw:上臂維持水平,前臂沿箭線往「後」折(07-12 拍板:不是往上拉是往後拉),
    // 拉滿時前臂幾乎折平=手拉回臉頰旁;左臂持弓打直,腰微前傾
    if (this.archer) {
      this.archer.rightArm.pivot.rotation.x = -Math.PI / 2 + 0.08;
      this.archer.rightArm.joint.rotation.x = -0.7 - drawFrac * 2.0;

      this.archer.leftArm.pivot.rotation.x = -Math.PI / 2;
      this.archer.leftArm.joint.rotation.x = -0.08;
      this.archer.rig.rotation.x = drawFrac * 0.05;
      // 弓略隨瞄準左右轉
      this.bow.group.rotation.y = clamp((this.aim.x) * 0.12, -0.2, 0.2);
    }
  }

  updateCamera(delta) {
    let desiredPos;
    let desiredLook;
    const aiming = this.phase === "ready" || this.phase === "drawing";
    const centerLook = new THREE.Vector3(0, TARGET_CENTER_Y, this.distance);

    if (aiming || this.cameraView === 0) {
      // 過肩瞄準視角(核心,鎖):相機在右肩後上方,射手偏左、靶與準星在畫面中央不被身體擋住
      desiredPos = new THREE.Vector3(this.aim.x * 0.12 + 0.9, 2.15, -2.3);
      desiredLook = new THREE.Vector3(this.aim.x * 0.75, TARGET_CENTER_Y, this.distance);
    } else if (this.cameraView === 1) {
      // 靶面特寫(07-12 拍板再拉近:靶面幾乎滿框,看清每支箭)
      // 看點抬高→靶在畫面下半,不被頂部計分板/字幕擋住(07-12 拍板;數值隨靶心=1.38 重校)
      desiredPos = new THREE.Vector3(0, TARGET_CENTER_Y - 0.35, this.distance - 2.3);
      desiredLook = new THREE.Vector3(0, TARGET_CENTER_Y - 0.03, this.distance);
    } else if (this.cameraView === 2) {
      // 高空俯瞰
      desiredPos = new THREE.Vector3(2.4, 15, this.distance * 0.5);
      desiredLook = new THREE.Vector3(0, 0.4, this.distance * 0.5);
    } else {
      // 側面轉播(看箭道弧線)
      desiredPos = new THREE.Vector3(7.5, 3.4, this.distance * 0.5);
      desiredLook = new THREE.Vector3(0, 1.4, this.distance * 0.5);
    }

    // 飛行中若在複查視角,側面看弧線更好
    this.camPos.lerp(desiredPos, 1 - Math.exp(-delta * 3.0));
    this.camLook.lerp(desiredLook, 1 - Math.exp(-delta * 3.0));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  // ---------- HUD ----------
  pushHud() {
    if (!this.onHudUpdate) return;
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const swayNorm = clamp((this.currentSway().length()) / (TARGET_R * 0.35), 0, 1);
    const phaseLabels = {
      menu: "主選單",
      ready: "瞄準",
      drawing: "拉弓",
      flying: "放箭",
      scored: "計分",
      ended: "結束",
    };
    const windMag = this.wind.length() / (TARGET_R * 0.32);
    this.onHudUpdate({
      totalScore: this.totalScore,
      endScore: this.endScore,
      endNumber: this.endNumber,
      endCount: this.mode.endless ? "∞" : this.mode.endCount,
      arrowInEnd: this.arrowInEnd,
      arrowsPerEnd: this.mode.arrowsPerEnd,
      modeLabel: this.mode.label,
      difficultyLabel: DIFFICULTY_LABELS[this.difficulty],
      distanceLabel: `${this.distance} m`,
      phaseLabel: phaseLabels[this.phase] || "",
      message: this.message,
      drawPower: this.power,
      canFire: this.power >= 0.22,
      steadiness: 1 - swayNorm,
      windX: this.wind.x,
      windY: this.wind.y,
      windStrength: clamp(windMag, 0, 1),
      windText: this.windText(),
      lastRing: this.lastRing,
      bullseyeCount: this.bullseyeCount,
      overlay: { ...this.overlay },
    });
  }

  windText() {
    const cross = this.wind.x;
    const vert = this.wind.y;
    const mag = this.wind.length() / TARGET_R;
    if (mag < 0.03) return "幾乎無風";
    const dir = cross > 0.01 ? "→ 右風" : cross < -0.01 ? "← 左風" : "";
    const ud = vert > 0.01 ? " ↑上升" : vert < -0.01 ? " ↓下沉" : "";
    const level = mag > 0.22 ? "強" : mag > 0.1 ? "中" : "微";
    return `${level}風 ${dir}${ud}(往反方向瞄準補償)`;
  }

  // ---------- 存讀檔 ----------
  saveGame(silent = false) {
    const snapshot = {
      difficulty: this.difficulty,
      modeId: this.modeId,
      phase: this.phase === "flying" || this.phase === "drawing" ? "ready" : this.phase,
      totalScore: this.totalScore,
      endNumber: this.endNumber,
      endScore: this.endScore,
      arrowInEnd: this.arrowInEnd,
      arrowsShotTotal: this.arrowsShotTotal,
      bullseyeCount: this.bullseyeCount,
    };
    saveGameState(snapshot);
    if (!silent) {
      this.message = "已存檔。";
      this.pushHud();
    }
  }

  loadGame() {
    const snap = loadSavedGame();
    if (!snap) return false;
    if (DIFFICULTY_PRESETS[snap.difficulty]) this.difficulty = snap.difficulty;
    if (GAME_MODES[snap.modeId]) {
      this.modeId = snap.modeId;
      this.mode = getModeConfig(snap.modeId);
    }
    this.totalScore = snap.totalScore || 0;
    this.endNumber = snap.endNumber || 1;
    this.endScore = snap.endScore || 0;
    this.arrowInEnd = snap.arrowInEnd || 0;
    this.arrowsShotTotal = snap.arrowsShotTotal || 0;
    this.bullseyeCount = snap.bullseyeCount || 0;
    this.setDistance(DIFFICULTY_PRESETS[this.difficulty].distance);
    this.buildTarget();
    if (snap.phase === "menu" || snap.phase === "ended") {
      this.openHomeMenu();
    } else {
      this.beginArrow();
    }
    return true;
  }
}
