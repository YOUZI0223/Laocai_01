import { Color, _decorator, Enum } from 'cc';
const { ccclass, property } = _decorator;

export enum DishType {
    Cabbage = 0,    // 卷心菜  浅绿
    Broccoli = 1,   // 西兰花  深绿
    BokChoy = 2,    // 小白菜  翠绿+白
    Cilantro = 3,   // 香菜    碎深绿
    Okra = 4,       // 秋葵    长条绿
    Avocado = 5,    // 牛油果  棕黄
    Scallion = 6,   // 葱      白+绿
    BambooShoot = 7,// 竹笋    米黄
    GreenPepper = 8,// 青椒    中绿
    Lettuce = 9,    // 生菜叶  浅绿
}

export const DISH_COUNT = 10;

export interface DishMeta {
    type: DishType;
    name: string;
    color: Color;
    radius: number;
    /** 重量。占位分离时按 weight 比分配位移。 */
    weight: number;
    /** 弹性 0~1。被推后压缩+回弹幅度。 */
    elasticity: number;
    /** 阻尼 0~1。回弹晃动衰减速度（越大越快回稳）。 */
    damping: number;
    /** 旋转范围（度）。碰撞或上浮时的角度变化幅度。 */
    rotationRange: number;
    /** 上浮动画时长（秒）。越小越快。 */
    upSpeed: number;
    /** 上浮过程横向漂移幅度（像素）。 */
    upDrift: number;
    // ── 碰撞反馈动效参数（对应策划案第九节）──
    /** 被碰撞时视觉压缩比例 [0~1]，如 0.12 = 压缩 12%，作用于 visualNode */
    hitSquishScale: number;
    /** 压缩 + 回弹完整动效时长（秒） */
    hitSquishDuration: number;
    /** 碰撞后摇摆最大角度（度） */
    hitSwingAngle: number;
    /** 摇摆衰减持续时间（秒） */
    hitSwingDuration: number;
    /** 显示 Z 偏移（视觉层级微调）。大食材给负值（沉底），小食材给正值（浮顶）。默认 0 */
    displayZOffset: number;
}

// 三级定档：大型 / 中型 / 小型
// 大食材重、稳、晃动小、上浮慢；小食材轻、容易被挤开、上浮快晃动明显。
export const DISH_META: ReadonlyArray<DishMeta> = [
    { type: DishType.Cabbage,     name: '卷心菜',   color: new Color(168, 222, 130, 255), radius: 72,
      weight: 3.0, elasticity: 0.18, damping: 0.65, rotationRange: 6,  upSpeed: 0.55, upDrift: 10,
      hitSquishScale: 0.10, hitSquishDuration: 0.20, hitSwingAngle: 6,  hitSwingDuration: 0.40,
      displayZOffset: -5 },
    { type: DishType.Broccoli,    name: '西兰花',   color: new Color( 56, 122,  58, 255), radius: 70,
      weight: 3.0, elasticity: 0.16, damping: 0.70, rotationRange: 5,  upSpeed: 0.55, upDrift: 9,
      hitSquishScale: 0.09, hitSquishDuration: 0.18, hitSwingAngle: 5,  hitSwingDuration: 0.38,
      displayZOffset: -5 },
    { type: DishType.BokChoy,     name: '小白菜',   color: new Color(180, 226, 140, 255), radius: 60,
      weight: 2.4, elasticity: 0.22, damping: 0.55, rotationRange: 10, upSpeed: 0.48, upDrift: 14,
      hitSquishScale: 0.13, hitSquishDuration: 0.22, hitSwingAngle: 12, hitSwingDuration: 0.48,
      displayZOffset: -1 },
    { type: DishType.Cilantro,    name: '香菜',     color: new Color( 78, 138,  62, 255), radius: 55,
      weight: 1.8, elasticity: 0.28, damping: 0.40, rotationRange: 18, upSpeed: 0.40, upDrift: 20,
      hitSquishScale: 0.06, hitSquishDuration: 0.14, hitSwingAngle: 28, hitSwingDuration: 0.65,
      displayZOffset: 4 },
    { type: DishType.Okra,        name: '秋葵',     color: new Color(108, 168,  78, 255), radius: 47,
      weight: 1.6, elasticity: 0.26, damping: 0.45, rotationRange: 15, upSpeed: 0.40, upDrift: 18,
      hitSquishScale: 0.08, hitSquishDuration: 0.16, hitSwingAngle: 22, hitSwingDuration: 0.58,
      displayZOffset: 2 },
    { type: DishType.Avocado,     name: '牛油果',   color: new Color(196, 168,  76, 255), radius: 62,
      weight: 2.6, elasticity: 0.20, damping: 0.55, rotationRange: 8,  upSpeed: 0.50, upDrift: 12,
      hitSquishScale: 0.11, hitSquishDuration: 0.20, hitSwingAngle: 8,  hitSwingDuration: 0.42,
      displayZOffset: -3 },
    { type: DishType.Scallion,    name: '葱',       color: new Color(238, 240, 196, 255), radius: 50,
      weight: 1.5, elasticity: 0.30, damping: 0.40, rotationRange: 22, upSpeed: 0.38, upDrift: 22,
      hitSquishScale: 0.07, hitSquishDuration: 0.14, hitSwingAngle: 32, hitSwingDuration: 0.70,
      displayZOffset: 4 },
    { type: DishType.BambooShoot, name: '竹笋',     color: new Color(236, 222, 168, 255), radius: 60,
      weight: 2.5, elasticity: 0.18, damping: 0.60, rotationRange: 8,  upSpeed: 0.50, upDrift: 12,
      hitSquishScale: 0.10, hitSquishDuration: 0.19, hitSwingAngle: 9,  hitSwingDuration: 0.43,
      displayZOffset: -3 },
    { type: DishType.GreenPepper, name: '青椒',     color: new Color(110, 174,  86, 255), radius: 57,
      weight: 2.3, elasticity: 0.22, damping: 0.50, rotationRange: 10, upSpeed: 0.45, upDrift: 15,
      hitSquishScale: 0.12, hitSquishDuration: 0.21, hitSwingAngle: 11, hitSwingDuration: 0.47,
      displayZOffset: 0 },
    { type: DishType.Lettuce,     name: '生菜叶',   color: new Color(174, 220, 138, 255), radius: 57,
      weight: 2.2, elasticity: 0.24, damping: 0.50, rotationRange: 12, upSpeed: 0.45, upDrift: 16,
      hitSquishScale: 0.13, hitSquishDuration: 0.22, hitSwingAngle: 14, hitSwingDuration: 0.50,
      displayZOffset: 0 },
];

@ccclass('OrderSpec')
export class OrderSpec {
    @property({ type: Enum(DishType), tooltip: '订单要求的食材类型' })
    type: DishType = DishType.Cabbage;

    @property({ tooltip: '订单需要的数量' })
    need: number = 3;
}

export enum PoolPickStrategy {
    Sequential = 0,
    Random = 1,
}

export interface LevelData {
    // ── 基础 ───────────────────────────────────────────────
    id: number;

    // ── 订单系统 ───────────────────────────────────────────
    /** 开局桌面 4 个固定订单 */
    initialOrders: OrderSpec[];

    /**
     * 订单池：除 initialOrders 外的剩余订单
     * 完成一单从池里抽 1 个补到空缺位，抽完即移除（不重复）
     */
    orderPool: OrderSpec[];

    /**
     * 池子抽取策略
     * Sequential：按池中顺序依次抽取
     * Random：随机抽（已抽过不再抽）
     */
    poolPickStrategy: PoolPickStrategy;

    // ── 锅体 ──────────────────────────────────────────────
    /** 锅的物理半径（像素）。同时决定可视绘图尺寸、UI 容器、边界推回与散点基准。默认 320 */
    bowlRadius: number;

    // ── 食材生成 ───────────────────────────────────────────
    /**
     * 开局一次性投入锅内的食材数量
     * 总食材 = (initialOrders.length + orderPool.length) × DEFAULT_ORDER_NEED
     * 剩余食材 = 总食材 - initialBowlSpawnCount，分多次 refill 补完
     */
    initialBowlSpawnCount: number;

    /** 每次补料投入的食材数量（达到 refillThreshold 时触发） */
    refillBatchSize: number;

    /** 锅内剩余食材 ≤ 此值时触发一次 refill */
    refillThreshold: number;

    // ── 碰撞结算全局参数（驱动 BowlController）──────────────
    /** 每帧占位分离迭代次数 [2~6]，越大越稳定越耗 CPU。默认 3 */
    resolveIterations: number;
    /** 单次迭代单颗食材最大位移上限（像素），防止连锁推挤乱飞。默认 14 */
    maxPushPerIter: number;
    /** 允许的轻微重叠量（像素），让食材看起来更"挤"。默认 2 */
    overlapTolerance: number;
    /** 锅体有效区域内缩量（像素）。默认 4 */
    bowlEdgeInset: number;
    /** 中心引力 [0~0.02]。每帧把每颗食材位置向锅心拽 g 倍，模拟"碗底凹陷"的物理堆叠效果。0=关闭。默认 0.006 */
    centerGravity: number;
    /**
     * 视觉堆叠高度系数（像素）。每颗食材的最终 Y = 散点 Y - displayZOffset × 此值。
     * 大食材（zOff 负）→ 视觉上移到屏幕远端（高 Y），小食材（zOff 正）→ 视觉下移到屏幕近端（低 Y），
     * 配合 Y 排序自动形成"大食材沉底、小食材压顶"的多层堆叠视感。0=禁用，纯靠排序。默认 18
     */
    stackHeightFactor: number;

    // ── 生成节奏参数（驱动 BowlSpawner）─────────────────────
    /** 初始投放时相邻食材上浮动画错开间隔（秒）。默认 0.025 */
    spawnStagger: number;
    /** 补料时相邻食材上浮动画错开间隔（秒）。默认 0.08 */
    refillStagger: number;
    /** 初始投放散点时食材间最小距离系数 [0.5~1.2]。默认 0.85 */
    scatterMinDistFactor: number;
    /** 初始投放有效半径系数（乘以 bowlRadius）。默认 0.78 */
    spawnRadiusFactor: number;
    /** 补料有效半径系数（乘以 bowlRadius）。默认 0.60 */
    refillRadiusFactor: number;

    // ── 锅内氛围与浮动感参数（驱动 BowlController + DishItem）─────
    /** Idle 微动幅度（像素）。每个食材独立 sin 波摆动幅度。0 = 关闭。默认 1.8 */
    idleBobAmplitude: number;
    /** Idle 微动基础频率（Hz）。每个食材会在此基础上 ±30% 随机。默认 0.6 */
    idleBobFrequency: number;
    /** 常驻气泡间隔（秒）。锅心每隔此时间冒一个气泡。0 = 关闭。默认 1.5 */
    ambientBubbleInterval: number;
    /** 弹簧回稳硬度 [0.05~0.30]。值越大回弹越快。默认 0.18 */
    springStiffness: number;
    /** 弹簧回稳阻尼 [0.5~0.95]。值越大震荡越小。默认 0.82 */
    springDamping: number;

    // ── 道具 ───────────────────────────────────────────────
    shuffleUses: number;
}

/** 每单默认需求数量 */
export const DEFAULT_ORDER_NEED = 3;

export const LEVEL_1: LevelData = {
    id: 1,

    // 开局 4 个订单
    initialOrders: [
        Object.assign(new OrderSpec(), { type: DishType.Cabbage,  need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.Broccoli, need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.Avocado,  need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.Cilantro, need: 3 }),
    ],

    // 订单池 6 单，按顺序抽取
    orderPool: [
        Object.assign(new OrderSpec(), { type: DishType.BokChoy,     need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.Okra,        need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.Scallion,    need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.BambooShoot, need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.GreenPepper, need: 3 }),
        Object.assign(new OrderSpec(), { type: DishType.Lettuce,     need: 3 }),
    ],
    poolPickStrategy: PoolPickStrategy.Sequential,

    // 锅半径
    bowlRadius: 320,

    // 总食材 30 = 开局 18 + 补料 12（每次 4，共 3 次）
    initialBowlSpawnCount: 18,
    refillBatchSize: 4,
    refillThreshold: 8,

    // 碰撞结算：moderate 推力 + 中等重叠 + 中心引力 → 多颗+堆叠感
    resolveIterations: 2,
    maxPushPerIter: 4,
    overlapTolerance: 18,
    bowlEdgeInset: 4,
    centerGravity: 0.006,
    stackHeightFactor: 18,

    // 生成节奏
    spawnStagger: 0.025,
    refillStagger: 0.08,
    scatterMinDistFactor: 0.55,
    spawnRadiusFactor: 0.78,
    refillRadiusFactor: 0.55,

    // 锅内氛围与浮动感
    idleBobAmplitude: 1.2,
    idleBobFrequency: 0.5,
    ambientBubbleInterval: 1.5,
    springStiffness: 0.18,
    springDamping: 0.82,

    shuffleUses: 3,
};

export const SLOT_COUNT = 6;
export const FAIL_SLOT_FILL = 5;
export const ORDER_COUNT = 4;
