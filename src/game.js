import * as THREE from "three";
import { InputManager } from "./input.js";
import { loadSettings, saveSettings, loadSavedGame, saveGameState } from "./storage.js";

// —— 3D 射箭(archery3d)——
// 照抄 baseball3d / 籃球CO 的 3d-game-kit 骨架:renderer/scene/lights、makePerson 臉部鐵則、
// 相機視角檔 + lerp、單指蓄力放開。玩法核心:拉弓蓄力 → 準星晃動(屏息越久越晃)→ 順逆風偏移
// → 箭道拋物線 → 靶環計分。★判定=畫面(鐵則4):放箭當下先算出命中點(瞄準+晃動+風),
// 再把箭「演」到那個點——畫面說不通的分數=bug。

// ---------- 可調量值(開場 UI 可選,預設只是預設) ----------
// 射擊(10m 氣步槍,A1):室內無風,距離恆 10m(ISSF)——挑戰全在「呼吸」:
// 按住=屏息,晃動先收斂(steadyTime)→穩定窗(sweetTime)→屏太久缺氧晃動回升(swayGrow);
// heart=心跳脈動幅度(高難度連心跳都看得見)。
export const DIFFICULTY_PRESETS = {
  kids: { distance: 10, swayBase: 0.012, swayGrow: 0.25, steadyTime: 0.5, sweetTime: 2.4, heart: 0, aimAssist: 0.68 },
  child: { distance: 10, swayBase: 0.03, swayGrow: 0.5, steadyTime: 0.55, sweetTime: 1.9, heart: 0.05, aimAssist: 0.42 },
  easy: { distance: 10, swayBase: 0.065, swayGrow: 0.9, steadyTime: 0.6, sweetTime: 1.5, heart: 0.12, aimAssist: 0.2 },
  normal: { distance: 10, swayBase: 0.11, swayGrow: 1.4, steadyTime: 0.65, sweetTime: 1.15, heart: 0.2, aimAssist: 0.06 },
  hard: { distance: 10, swayBase: 0.17, swayGrow: 2.0, steadyTime: 0.7, sweetTime: 0.9, heart: 0.3, aimAssist: 0 },
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
    description: "無限發數,自由熟悉屏息節奏與穩定窗。",
    goal: "純練手感,不計勝負",
  },
  standard: {
    label: "計分賽",
    arrowsPerEnd: 3,
    endCount: 6,
    description: "6 組 × 3 發,滿分 180 分。",
    goal: "總分越高越好",
  },
  bullseye: {
    label: "十環挑戰",
    arrowsPerEnd: 1,
    endCount: 10,
    description: "10 發,盡量射進內圈(9、10 環)。",
    goal: "內圈數越多越好",
  },
  // 同機雙人輪流制(duel-2p-kit §7B):共用同一組鍵/滑鼠,輪到誰誰射
  duel2p: {
    label: "雙人同機(輪流)",
    arrowsPerEnd: 1,
    endCount: 20,
    duel: true,
    description: "兩位選手輪流射擊,各 10 發——總分高的獲勝!",
    goal: "P1(藍) vs P2(紅)",
  },
};

export function getModeConfig(modeId) {
  return GAME_MODES[modeId] || GAME_MODES.standard;
}

// ---------- 靶 / 場地常數 ----------
const TARGET_R = 0.3; // 靶面半徑(世界單位)——10m 氣步槍靶比射箭靶小得多
const TARGET_CENTER_Y = 1.38; // 靶心高度(約眼平)
const BOW_TIP = new THREE.Vector3(-0.16, 1.52, 0.55); // 槍口起點(過肩視角射手偏左,槍在其左側可見)
// 氣步槍靶環(由外到內:白紙+黑色瞄準區;內圈 9/10 環在黑區中心)
const RING_COLORS = [0xf3f4f6, 0xe7e7e2, 0x25272b, 0x1b1d20, 0xf6d743];

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
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.76, 0.32) /* 矩形身體(07-13 鐵則) */, shirtMat);
  chest.position.y = 1.42;
  rig.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 12), skinMat);
  neck.position.y = 1.88;
  rig.add(neck);
  const waist = new THREE.Group();
  waist.position.y = 1.16;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.27), shirtMat);
  belly.position.y = -0.05;
  waist.add(belly);
  const hip = new THREE.Mesh(
    gender === "f"
      ? new THREE.BoxGeometry(0.48, 0.22, 0.3) // 女:裙襬微張
      : new THREE.BoxGeometry(0.42, 0.2, 0.27), // 男:直筒褲頭,不要裙子
    pantsMat,
  );
  hip.position.y = -0.26;
  waist.add(hip);
  const beltLine = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.06, 0.28), new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.6 }));
  beltLine.position.y = -0.15;
  waist.add(beltLine);
  rig.add(waist);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 18), skinMat);
  head.position.y = 2.12;
  rig.add(head);

  // 耳朵(所有人物都要有,07-12 拍板):頭兩側膚色半橢球,壓扁貼頭
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), skinMat);
  earL.scale.set(0.45, 1, 0.8);
  earL.position.set(-0.245, 2.11, 0);
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
  hairCap.position.y = 2.13;
  hairCap.rotation.x = -0.22; // 微往後腦傾:露出額頭,但正面仍看得到瀏海線
  rig.add(hairCap);
  // 後腦帶:phi 只掃後半球(z<0),到耳線為止——耳朵前面完全無髮;男=俐落短髮,女=妹妹頭蓋後頸
  const hairBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.255, 16, 8, Math.PI, Math.PI, Math.PI * 0.35, Math.PI * (gender === "f" ? 0.38 : 0.22)),
    hairMat,
  );
  hairBack.position.y = 2.12;
  rig.add(hairBack);

  // 臉:貼 +z(與身體同向)
  const faceDark = new THREE.MeshBasicMaterial({ color: 0x25201a });
  const faceWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), faceWhite);
  eyeL.position.set(-0.09, 2.18, 0.21);
  rig.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.09;
  rig.add(eyeR);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), faceDark);
  pupilL.position.set(-0.09, 2.18, 0.25);
  rig.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.09;
  rig.add(pupilR);
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), faceDark);
  browL.position.set(-0.09, 2.26, 0.22);
  browL.rotation.z = 0.16;
  rig.add(browL);
  const browR = browL.clone();
  browR.position.x = 0.09;
  browR.rotation.z = -0.16;
  rig.add(browR);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 14, Math.PI), faceDark);
  smile.position.set(0, 2.04, 0.21);
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
    arm.pivot.position.set(x, 1.72, 0);
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
      upperLen: 0.40,
      lowerLen: 0.38,
      upperRadius: 0.09,
      lowerRadius: 0.072,
      end: "foot",
    });
    leg.pivot.position.set(x, 1.0, 0);
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

// ---------- 氣步槍 + 彈丸 ----------
function makeRifle() {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a4f28, roughness: 0.55 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.35 });
  // 槍托(後)
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.34), woodMat);
  stock.position.set(0, -0.04, -0.3);
  group.add(stock);
  // 機匣+護木(中)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.42), woodMat);
  body.position.set(0, 0, -0.02);
  group.add(body);
  // 槍管(前,沿 +z)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.62, 10), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.035, 0.42);
  group.add(barrel);
  // 覘孔照門(後)+準星護圈(前)——10m 氣步槍的招牌
  const diopter = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), metalMat);
  diopter.position.set(0, 0.085, -0.12);
  group.add(diopter);
  const frontSight = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 8, 14), metalMat);
  frontSight.position.set(0, 0.06, 0.7);
  group.add(frontSight);
  return { group };
}

// 彈丸:小亮點+短曳光(直線飛行,無拋物線——氣步槍 10m 幾乎瞬達)
function makePellet() {
  const group = new THREE.Group();
  const pellet = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  group.add(pellet);
  const tracer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.55 }),
  );
  tracer.rotation.x = Math.PI / 2;
  tracer.position.z = -0.26;
  group.add(tracer);
  return group;
}

// 彈孔:插在靶上的小黑點+白邊(取代箭桿)
function makeHole() {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.CircleGeometry(0.02, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
  group.add(rim);
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.013, 12),
    new THREE.MeshBasicMaterial({ color: 0x14151a, side: THREE.DoubleSide }),
  );
  hole.position.z = -0.001; // 面向射手(-z)那側疊在白邊前
  group.add(hole);
  group.rotation.y = Math.PI; // 正面朝射手
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

    // 每發狀態(drawT=屏息秒數;power 保留欄位=屏息品質,給 HUD 條用)
    this.drawT = 0;
    this.holdAtFull = 0;
    this.power = 0;
    this.recoilT = 9; // 擊發後座演出計時
    this.swayT = randomBetween(0, 10);
    this.aim = new THREE.Vector2(0, TARGET_CENTER_Y); // 瞄準點(靶面世界座標 x,y)
    this.pointerNDC = null; // 有滑鼠/觸控移動才更新
    this.reticleOffset = new THREE.Vector2(); // 當前晃動+偏移(顯示用)
    this.wind = new THREE.Vector2(); // 室內無風(恆 0;保留欄位相容 HUD)
    this.arrowFlight = null; // {mesh, from, to, t, dur}
    this.scoreTimer = 0;
    this.betweenTimer = 0;
    this.crowdAim = null; // 指到觀眾時={person, point}——★槍口紀律:指到人=禁擊發+安全提醒(不是玩具箭橋段)

    // 比賽計分
    this.totalScore = 0;
    this.endNumber = 1;
    this.endScore = 0;
    this.arrowInEnd = 0;
    this.arrowsShotTotal = 0;
    this.bullseyeCount = 0;
    this.lastRing = null;
    this.plantedArrows = [];
    // 雙人同機輪流(duel-2p-kit §7B):共用滑鼠/按鍵,輪到誰誰射
    this.turnSide = "p1";
    this.duelScore = { p1: 0, p2: 0 };
    this.duelShots = { p1: 0, p2: 0 };

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

  // ---------- 場景(室內 10m 氣步槍靶場) ----------
  setupScene() {
    const sun = new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 1.15);
    this.scene.add(sun);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 14, -4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd0ff, 0.6);
    rim.position.set(-6, 8, 10);
    this.scene.add(rim);
    // 靶端天花射燈(照亮遠處靶紙)
    const targetLamp = new THREE.PointLight(0xffffff, 12, 8);
    targetLamp.position.set(0, 3.2, this.distance || 10);
    this.scene.add(targetLamp);
    this._targetLamp = targetLamp;

    // 室內地板(膠地)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 40),
      new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 14;
    this.scene.add(floor);
    // 射道墊(藍色一長條)
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 40),
      new THREE.MeshStandardMaterial({ color: 0x2f5c8a, roughness: 0.9 }),
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.01, 14);
    this.scene.add(lane);
    // 射擊線(黃)
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xf6d743 }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.02, 0.4);
    this.scene.add(line);
    // 後牆+兩側牆(室內感,深色吸音牆)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x262a31, roughness: 1 });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), wallMat);
    backWall.position.set(0, 4, -4);
    this.scene.add(backWall);
    for (const sx of [-1, 1]) {
      const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), wallMat);
      sideWall.rotation.y = -sx * Math.PI / 2;
      sideWall.position.set(sx * 5, 4, 16);
      this.scene.add(sideWall);
    }
    // 靶後擋彈牆(靶紙掛在上面)
    this.backstop = new THREE.Mesh(
      new THREE.BoxGeometry(6, 6, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 1 }),
    );
    this.scene.add(this.backstop);

    // 射手(手繪向量人,站姿持槍)
    this.archer = makePerson({ shirt: 0x8a5a2b, pants: 0x38424f, scale: 1 });
    this.archer.group.position.set(0, 0, 0);
    this.scene.add(this.archer.group);
    // 站姿舉槍:左手托護木前伸、右手握把貼臉(覘孔瞄準)
    this.archer.leftArm.pivot.rotation.x = -Math.PI / 2 + 0.15;
    this.archer.leftArm.joint.rotation.x = -0.2;
    this.archer.rightArm.pivot.rotation.x = -Math.PI / 2 + 0.05;
    this.archer.rightArm.joint.rotation.x = -0.95;

    this.rifle = makeRifle();
    this.rifle.group.position.copy(BOW_TIP);
    this.scene.add(this.rifle.group);

    // 準星(覘孔式:細環)
    const retMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.reticle = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.045, 28), retMat);
    this.reticle.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), retMat);
    this.reticle.add(dot);
    this.scene.add(this.reticle);

    this.buildTarget();
    this.buildCrowd();

    // 最新一發標記(發光圈套在剛射中的彈孔上,update 內脈動——一眼看出剛射到哪)
    this.latestMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.008, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95 }),
    );
    this.latestMarker.visible = false;
    this.scene.add(this.latestMarker);
  }

  buildTarget() {
    if (this.targetGroup) this.scene.remove(this.targetGroup);
    if (this.plantedArrows) for (const h of this.plantedArrows) this.scene.remove(h); // 清舊彈孔
    if (this.latestMarker) this.latestMarker.visible = false;
    const group = new THREE.Group();
    // 白色靶紙(方形卡紙)
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(TARGET_R * 2.8, TARGET_R * 2.8),
      new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.95, side: THREE.DoubleSide }),
    );
    paper.position.z = 0.04;
    group.add(paper);
    // 氣步槍靶:黑色瞄準區(covers 4~10 環的黑圈)+內圈細白線分環+紅點靶心
    // 計分是連續半徑(見 resolveImpact),這裡只是「看得懂」的視覺分環
    const bull = new THREE.Mesh(
      new THREE.CircleGeometry(TARGET_R * 0.62, 40),
      new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8, side: THREE.DoubleSide }),
    );
    bull.position.z = 0.042;
    group.add(bull);
    // 分環白線(2~9 環邊界):在黑圈上畫細白環
    for (let i = 1; i <= 8; i += 1) {
      const rr = TARGET_R * (i / 10);
      const lineC = new THREE.Mesh(
        new THREE.RingGeometry(rr - 0.0015, rr + 0.0015, 48),
        new THREE.MeshBasicMaterial({ color: rr <= TARGET_R * 0.62 ? 0xf6f4ee : 0x1b1d20, side: THREE.DoubleSide }),
      );
      lineC.position.z = 0.043 + i * 0.0005;
      group.add(lineC);
    }
    // 紅點靶心(10 環,看得見的目標)
    const center = new THREE.Mesh(
      new THREE.CircleGeometry(TARGET_R * 0.05, 20),
      new THREE.MeshBasicMaterial({ color: 0xe8443c, side: THREE.DoubleSide }),
    );
    center.position.z = 0.05;
    group.add(center);

    this.targetGroup = group;
    // ★判定=畫面:靶「畫面中心」=計分中心 TARGET_CENTER_Y
    if (this.distance) group.position.set(0, TARGET_CENTER_Y, this.distance - 0.15); // 貼在擋彈牆前
    this.scene.add(group);
    this.plantedArrows = [];
  }

  buildCrowd() {
    // 相鄰靶位的其他選手(室內靶場氛圍;★槍口紀律:準星掃到人=禁止擊發+安全提醒,不是喜劇橋段)
    this.crowd = new THREE.Group();
    const shirts = [0x3d78d9, 0x4fae6a, 0xc94f8f];
    for (const [i, sx] of [[0, -1], [1, 1], [2, -1]].entries()) {
      const p = makePerson({
        shirt: shirts[i % shirts.length],
        pants: 0x2c3340,
        hair: HAIR_COLORS[(i * 2 + 1) % HAIR_COLORS.length],
        gender: i % 2 === 0 ? "m" : "f",
        scale: 1,
      });
      p.group.position.set(sx * 1.7 * (1 + Math.floor(i / 2)), 0, 0.1);
      p.group.rotation.y = 0; // 與玩家同向朝靶(相鄰射位)
      // 相鄰選手也舉槍朝前(靜態姿勢)
      p.leftArm.pivot.rotation.x = -Math.PI / 2 + 0.15;
      p.rightArm.pivot.rotation.x = -Math.PI / 2 + 0.05;
      p.rightArm.joint.rotation.x = -0.95;
      this.crowd.add(p.group);
    }
    this.scene.add(this.crowd);
  }

  setDistance(dist) {
    this.distance = dist;
    if (this.targetGroup) this.targetGroup.position.set(0, TARGET_CENTER_Y, dist - 0.15);
    if (this.backstop) this.backstop.position.set(0, TARGET_CENTER_Y - 0.2, dist + 0.05);
    if (this._targetLamp) this._targetLamp.position.set(0, 3.2, dist);
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
    this.turnSide = "p1";
    this.duelScore = { p1: 0, p2: 0 };
    this.duelShots = { p1: 0, p2: 0 };
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
    this.crowdAim = null;
    this.aim.set(0, TARGET_CENTER_Y);
    this.wind.set(0, 0); // 室內無風
    const who = this.mode.duel ? (this.turnSide === "p1" ? "P1(藍)" : "P2(紅)") + " 的回合——" : "";
    this.message = `${who}移動滑鼠瞄準,按住屏息穩定,放開擊發。`;
    this.pushHud();
  }

  rollWind() { this.wind.set(0, 0); } // 室內無風(保留呼叫相容)

  beginDraw() {
    // 計分停留中:點一下=玩家決定繼續(開下一發)
    if (this.phase === "scored") {
      this.advanceAfterScore();
      return;
    }
    if (this.phase !== "ready") return;
    // ★槍口紀律:準星掃到人=禁止擊發+安全提醒(取代舊「射觀眾」喜劇)
    if (this.crowdAim) {
      this.message = "槍口不可對人!移開準星,只朝靶射擊。";
      this.emitEvent("muzzle-safety");
      this.pushHud();
      return;
    }
    this.phase = "drawing";
    this.drawT = 0;
    this.holdAtFull = 0;
    this.emitEvent("draw-start");
    this.message = "屏息中……穩定時放開擊發!";
  }

  releaseDraw() {
    if (this.phase !== "drawing") return;
    // 擊發前若準星滑到人身上=中止(安全)
    if (this.crowdAim) {
      this.phase = "ready";
      this.message = "槍口對到人了——已中止擊發。移開準星再射。";
      this.emitEvent("muzzle-safety");
      this.pushHud();
      return;
    }
    this.fireArrow();
  }

  // ★判定=畫面:先算命中點(瞄準+擊發當下的晃動),再把彈丸「直線瞬達」演到那個點(無拋物線)
  fireArrow() {
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    // 屏息品質:steadyTime 前晃大、sweet 窗最穩、之後缺氧回升——擊發當下的 sway 就是散佈
    const swayNow = this.currentSway();
    let impactX = this.aim.x + swayNow.x;
    let impactY = this.aim.y + swayNow.y;
    // 幼兒/兒童瞄準輔助:把命中點往靶心拉一點
    if (preset.aimAssist > 0) {
      impactX += (0 - impactX) * preset.aimAssist * 0.35;
      impactY += (TARGET_CENTER_Y - impactY) * preset.aimAssist * 0.35;
    }
    const impact = new THREE.Vector3(impactX, impactY, this.distance);

    const arrow = makePellet();
    const from = BOW_TIP.clone();
    arrow.position.copy(from);
    this.scene.add(arrow);
    const dist = from.distanceTo(impact);
    this.arrowFlight = {
      mesh: arrow,
      from,
      to: impact,
      t: 0,
      dur: dist / 120, // 氣步槍極快,幾乎瞬達
      arc: 0, // 10m 直線彈道,無拋物線
    };
    this.phase = "flying";
    this.recoilT = 0; // 觸發後座+槍口火光演出
    this.emitEvent("release", { power: this.power });
    this.message = "擊發!";
    this.pushHud();
  }

  // 屏息晃動:ready(未屏息)晃最大;drawing 期間 steadyTime 內收斂→sweet 窗最穩→之後缺氧回升;
  // heart=心跳脈動(高難度連心跳都看得見)。擊發當下的回傳值=彈著散佈。
  currentSway() {
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    let steadyFactor;
    if (this.phase !== "drawing") {
      steadyFactor = 1; // 尚未屏息:自然晃動最大
    } else {
      const t = this.drawT;
      if (t < preset.steadyTime) {
        steadyFactor = 1 - 0.85 * (t / preset.steadyTime); // 收斂:1 → 0.15
      } else if (t < preset.steadyTime + preset.sweetTime) {
        steadyFactor = 0.15; // sweet 窗:最穩
      } else {
        const over = t - (preset.steadyTime + preset.sweetTime);
        steadyFactor = 0.15 + over * preset.swayGrow; // 缺氧:回升
      }
    }
    const amp = TARGET_R * preset.swayBase * steadyFactor;
    const heart = TARGET_R * preset.heart * 0.12 * Math.sin(this.swayT * 7.5); // 心跳脈動(垂直為主)
    return new THREE.Vector2(
      Math.sin(this.swayT * 2.1) * amp,
      Math.sin(this.swayT * 3.3 + 1.3) * amp * 0.82 + heart,
    );
  }

  resolveImpact() {
    const impact = this.arrowFlight.to;
    this.scene.remove(this.arrowFlight.mesh); // 彈丸消失,靶上留彈孔
    // 靶上留彈孔
    const hole = makeHole();
    hole.position.set(impact.x, impact.y, this.distance - 0.14);
    this.scene.add(hole);
    this.plantedArrows.push(hole);
    if (this.plantedArrows.length > 15) {
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
    if (this.mode.duel) { this.duelScore[this.turnSide] += ring; this.duelShots[this.turnSide] += 1; }

    this.emitEvent("impact", {
      ring,
      isBull: ring >= 10,
      isGold: ring >= 9,
      miss: ring === 0,
      totalScore: this.totalScore,
    });

    // 靶面特寫停留:不自動跳下一發——玩家點一下畫面才繼續
    this.phase = "scored";
    this.cameraView = 1;
    if (ring > 0) {
      this.latestMarker.position.set(impact.x, impact.y, this.distance - 0.13);
      this.latestMarker.visible = true;
    } else {
      this.latestMarker.visible = false;
    }
    const ringText =
      ring === 0 ? "脫靶了……調整呼吸再來。" : ring >= 10 ? "正中靶心!十環!" : `${ring} 環!`;
    this.message = `${ringText}(點一下畫面,繼續下一發)`;
    this.pushHud();
  }

  advanceAfterScore() {
    const arrowsPerEnd = this.mode.arrowsPerEnd;
    // 雙人輪流:每發打完換手(用 duelShots 判斷是否兩人都打完)
    if (this.mode.duel) {
      const done = this.duelShots.p1 + this.duelShots.p2;
      if (done >= this.mode.endCount) { this.finishMatch(); return; }
      this.turnSide = this.turnSide === "p1" ? "p2" : "p1";
      this.beginArrow();
      return;
    }
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
    if (this.mode.duel) {
      const { p1, p2 } = this.duelScore;
      const winner = p1 > p2 ? "P1(藍)" : p2 > p1 ? "P2(紅)" : "平手";
      this.overlay = {
        visible: true,
        eyebrow: "雙人賽結束",
        title: winner === "平手" ? `平手!${p1} : ${p2}` : `${winner} 獲勝!`,
        text: `P1 ${p1} 分,P2 ${p2} 分。再比一場!`,
        canResume: false,
      };
      this.emitEvent("match-end", { duel: true, p1, p2, winner });
      this.message = `雙人賽結束——P1 ${p1} : P2 ${p2}。`;
      this.pushHud();
      return;
    }
    const possible = this.mode.endless ? this.arrowsShotTotal * 10 : this.mode.endCount * this.mode.arrowsPerEnd * 10;
    const pct = possible > 0 ? this.totalScore / possible : 0;
    const grade = pct >= 0.9 ? "A+" : pct >= 0.78 ? "A" : pct >= 0.62 ? "B" : pct >= 0.45 ? "C" : "D";
    const detail =
      this.modeId === "bullseye"
        ? `內圈 ${this.bullseyeCount} / ${this.arrowsShotTotal} 發`
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
      this.overlay = { visible: true, eyebrow: "暫停中", title: "深呼吸一下", text: "準備好再繼續射擊。", canResume: true };
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
    this.recoilT += delta;
    const paused = this.overlay.visible;

    if (!paused) {
      if (this.phase === "ready" || this.phase === "drawing") {
        this.updateAim(delta);
      }
      if (this.phase === "drawing") {
        this.drawT += delta; // 屏息秒數;currentSway 依此算穩定度
      }
      if (this.phase === "flying") this.updateFlight(delta);
      // scored:停在靶面特寫等玩家點擊,不自動進下一發
    }

    // 最新一發標記脈動
    if (this.latestMarker && this.latestMarker.visible) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.18;
      this.latestMarker.scale.setScalar(pulse);
    }

    // 鍵盤輸入(空白鍵屏息/擊發、方向鍵微調瞄準、V 視角)
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
    // ★槍口紀律:準星掃到相鄰選手=標記 crowdAim(beginDraw/releaseDraw 會擋下擊發+安全提醒)
    const crowdHits = this.crowd ? this.raycaster.intersectObjects(this.crowd.children, true) : [];
    if (crowdHits.length) {
      let root = crowdHits[0].object;
      while (root.parent && root.parent !== this.crowd) root = root.parent;
      this.crowdAim = { person: root, point: crowdHits[0].point.clone() };
      return;
    }
    this.crowdAim = null;
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
    const pos = new THREE.Vector3().lerpVectors(f.from, f.to, t); // 直線(arc=0)
    const ahead = new THREE.Vector3().lerpVectors(f.from, f.to, Math.min(1, t + 0.02));
    f.mesh.position.copy(pos);
    f.mesh.lookAt(ahead);
    if (f.t >= 1) {
      this.resolveImpact();
    }
  }

  updateReticle() {
    const aiming = this.phase === "ready" || this.phase === "drawing";
    this.reticle.visible = aiming;
    if (!aiming) return;
    if (this.crowdAim) {
      // 準星掃到人:準星轉紅貼在他身上(視覺警告,擊發會被擋)
      this.reticle.position.copy(this.crowdAim.point);
      this.reticle.position.z -= 0.15;
      this.reticle.scale.setScalar(1.3);
      for (const c of this.reticle.children) c.material.color.setHex(0xff3020);
      this.reticle.lookAt(this.camera.position);
      return;
    }
    for (const c of this.reticle.children) c.material.color.setHex(0xffe14d);
    const sway = this.currentSway();
    this.reticleOffset.copy(sway);
    this.reticle.position.set(this.aim.x + sway.x, this.aim.y + sway.y, this.distance - 0.12);
    this.reticle.scale.setScalar(1);
    this.reticle.lookAt(this.camera.position);
  }

  updateArcherPose() {
    // 後座:擊發後 0.25s 內槍身+上身微微後頂再回穩
    const recoil = this.recoilT < 0.25 ? (1 - this.recoilT / 0.25) * 0.12 : 0;
    // 屏息時上身極輕微前傾穩定(drawT 越久越沉)
    const steady = this.phase === "drawing" ? Math.min(1, this.drawT / 0.6) : 0;
    if (this.archer) {
      this.archer.rightArm.pivot.rotation.x = -Math.PI / 2 + 0.05;
      this.archer.rightArm.joint.rotation.x = -0.95;
      this.archer.leftArm.pivot.rotation.x = -Math.PI / 2 + 0.15;
      this.archer.leftArm.joint.rotation.x = -0.2;
      this.archer.rig.rotation.x = steady * 0.03 - recoil * 0.5;
    }
    if (this.rifle) {
      // 槍隨瞄準左右轉一點+後座向後頂
      this.rifle.group.rotation.y = clamp(this.aim.x * 0.1, -0.18, 0.18);
      this.rifle.group.position.set(BOW_TIP.x, BOW_TIP.y, BOW_TIP.z - recoil);
    }
  }

  updateCamera(delta) {
    let desiredPos;
    let desiredLook;
    const aiming = this.phase === "ready" || this.phase === "drawing";

    if (aiming || this.cameraView === 0) {
      // 過肩瞄準視角(核心,鎖):相機在右肩後上方,射手偏左、靶與準星在畫面中央
      desiredPos = new THREE.Vector3(this.aim.x * 0.1 + 0.55, 1.95, -1.9);
      desiredLook = new THREE.Vector3(this.aim.x * 0.7, TARGET_CENTER_Y, this.distance);
    } else if (this.cameraView === 1) {
      // 靶面特寫(靶面幾乎滿框,看清每個彈孔;10m 靶小,要更近)
      desiredPos = new THREE.Vector3(0, TARGET_CENTER_Y - 0.15, this.distance - 1.1);
      desiredLook = new THREE.Vector3(0, TARGET_CENTER_Y - 0.02, this.distance);
    } else if (this.cameraView === 2) {
      // 高空俯瞰
      desiredPos = new THREE.Vector3(2.4, 12, this.distance * 0.5);
      desiredLook = new THREE.Vector3(0, 0.4, this.distance * 0.5);
    } else {
      // 側面轉播(看整條射道)
      desiredPos = new THREE.Vector3(5.5, 3.0, this.distance * 0.5);
      desiredLook = new THREE.Vector3(0, 1.4, this.distance * 0.5);
    }

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
      drawing: "屏息",
      flying: "擊發",
      scored: "計分",
      ended: "結束",
    };
    // 屏息品質:sweet 窗=穩定條滿;steadiness 直接給 HUD 大條用
    const steadiness = clamp(1 - this.currentSway().length() / (TARGET_R * 0.32), 0, 1);
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
      drawPower: steadiness, // 大條=穩定度(取代拉弓力度)
      canFire: this.phase === "drawing" && !this.crowdAim,
      steadiness,
      windText: this.mode.duel ? `P1 ${this.duelScore.p1} : P2 ${this.duelScore.p2}` : this.steadyText(),
      lastRing: this.lastRing,
      bullseyeCount: this.bullseyeCount,
      overlay: { ...this.overlay },
    });
  }

  steadyText() {
    if (this.phase !== "drawing") return "按住屏息穩定準星";
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const t = this.drawT;
    if (t < preset.steadyTime) return "屏息中……準星正在收斂";
    if (t < preset.steadyTime + preset.sweetTime) return "★穩定窗!就是現在放開擊發!";
    return "屏太久了——準星回晃,快擊發或重新瞄準";
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
