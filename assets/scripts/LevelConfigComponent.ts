import { _decorator, Component, Enum } from 'cc';
import {
    LevelData, OrderSpec, PoolPickStrategy,
} from './LevelConfig';

const { ccclass, property } = _decorator;

/**
 * 关卡配置组件
 * 把所有关卡参数暴露到 Cocos Inspector，方便策划可视化调整
 * 挂载方式：在场景中新建空节点 "LevelConfig"，挂上此组件，再由 PlayableSceneBuilder 引用
 */
@ccclass('LevelConfigComponent')
export class LevelConfigComponent extends Component {

    // ───────── 基础 ─────────
    @property({ tooltip: '关卡编号' })
    levelId: number = 1;

    // ───────── 订单系统 ─────────
    @property({
        type: [OrderSpec],
        tooltip: '开局桌面 4 个固定订单（数组长度建议保持 4）',
    })
    initialOrders: OrderSpec[] = [];

    @property({
        type: [OrderSpec],
        tooltip: '订单池：完成一单后从此池抽取补到空缺位置（抽完即移除，不重复）',
    })
    orderPool: OrderSpec[] = [];

    @property({
        type: Enum(PoolPickStrategy),
        tooltip: '订单池抽取策略：Sequential=按顺序抽，Random=随机抽',
    })
    poolPickStrategy: PoolPickStrategy = PoolPickStrategy.Sequential;

    // ───────── 锅体 ─────────
    @property({
        tooltip: '锅物理半径（像素）。决定可视尺寸、UI 容器、边界推回与散点基准。建议 240~420',
        range: [200, 450, 5],
        slide: true,
    })
    bowlRadius: number = 320;

    // ───────── 碰撞结算 ─────────
    @property({
        tooltip: '每帧占位分离迭代次数 [2~6]',
        range: [1, 8, 1],
        slide: true,
    })
    resolveIterations: number = 2;

    @property({
        tooltip: '单次迭代单颗食材最大位移上限（像素）',
        range: [1, 50, 1],
        slide: true,
    })
    maxPushPerIter: number = 4;

    @property({ tooltip: '允许的轻微重叠量（像素）' })
    overlapTolerance: number = 18;

    @property({ tooltip: '锅体有效区域内缩量（像素）' })
    bowlEdgeInset: number = 4;

    @property({
        tooltip: '中心引力 [0~0.02]。每帧把食材位置向锅心拽 g 倍。拉力随距离线性渐变（中心 0、边缘 g）',
        range: [0, 0.02, 0.001],
        slide: true,
    })
    centerGravity: number = 0.006;

    @property({
        tooltip: '视觉堆叠高度（像素）。每食材 Y 偏移 = -displayZOffset × 此值。大食材沉底（屏幕高 Y），小食材压顶（屏幕低 Y），形成多层堆叠视感。0=禁用纯靠排序',
        range: [0, 40, 1],
        slide: true,
    })
    stackHeightFactor: number = 18;

    @property({
        tooltip: '跨层碰撞跳过阈值。两颗食材 displayZOffset 差 ≥ 此值时不再相互推开，允许小食材完全压在大食材上面。1=最激进，3~5=推荐，999=禁用',
        range: [1, 10, 1],
        slide: true,
    })
    crossLayerSkipThreshold: number = 3;

    @property({
        tooltip: '汤面分层阈值。displayZOffset ≥ 此值的食材渲染在汤面之上，小于此值的食材渲染在汤面之下。默认 2 → 香菜/大葱/黄瓜片/茄子/红椒浮在汤面之上',
        range: [-5, 5, 1],
        slide: true,
    })
    soupLayerCutoff: number = 2;

    @property({
        tooltip: '汤面之上（浮层）至少保留的食材数量。汤上层少于此值时，下层食材（越接近汤面越先）会自动浮上来补足',
        range: [0, 30, 1],
        slide: true,
    })
    surfaceMinCount: number = 6;

    // ───────── 生成节奏 ─────────
    @property({
        tooltip: '初始投放时相邻食材上浮动画错开间隔（秒）',
        range: [0, 0.2, 0.005],
        slide: true,
    })
    spawnStagger: number = 0.025;

    @property({
        tooltip: '初始投放散点时食材间最小距离系数',
        range: [0.3, 1.2, 0.05],
        slide: true,
    })
    scatterMinDistFactor: number = 0.55;

    @property({
        tooltip: '初始投放有效半径系数（乘以 bowlRadius）',
        range: [0.3, 1.0, 0.02],
        slide: true,
    })
    spawnRadiusFactor: number = 0.78;

    // ───────── 锅内氛围与浮动感 ─────────
    @property({
        tooltip: 'Idle 微动幅度（像素）。0 = 关闭。建议 0.5~2',
        range: [0, 6, 0.1],
        slide: true,
    })
    idleBobAmplitude: number = 1.2;

    @property({
        tooltip: 'Idle 微动频率（Hz）。建议 0.3~0.7',
        range: [0, 2, 0.05],
        slide: true,
    })
    idleBobFrequency: number = 0.5;

    @property({
        tooltip: '常驻气泡间隔（秒）。0 = 关闭。建议 1~3',
        range: [0, 5, 0.1],
        slide: true,
    })
    ambientBubbleInterval: number = 1.5;

    @property({
        tooltip: '弹簧硬度 [0.05~0.30]。值越大回弹越快',
        range: [0.05, 0.30, 0.01],
        slide: true,
    })
    springStiffness: number = 0.18;

    @property({
        tooltip: '弹簧阻尼 [0.5~0.95]。值越大震荡越小',
        range: [0.5, 0.95, 0.01],
        slide: true,
    })
    springDamping: number = 0.82;

    // ───────── 道具 ─────────
    @property({
        tooltip: '关卡内可使用的 Shuffle 道具次数',
        range: [0, 10, 1],
        slide: true,
    })
    shuffleUses: number = 3;

    /**
     * 将 Inspector 数据组装成 LevelData 对象
     * 供 PlayableSceneBuilder 启动时调用
     */
    toLevelData(): LevelData {
        return {
            id: this.levelId,
            initialOrders: this.initialOrders,
            orderPool: this.orderPool,
            poolPickStrategy: this.poolPickStrategy,
            bowlRadius: this.bowlRadius,
            resolveIterations: this.resolveIterations,
            maxPushPerIter: this.maxPushPerIter,
            overlapTolerance: this.overlapTolerance,
            bowlEdgeInset: this.bowlEdgeInset,
            centerGravity: this.centerGravity,
            stackHeightFactor: this.stackHeightFactor,
            crossLayerSkipThreshold: this.crossLayerSkipThreshold,
            soupLayerCutoff: this.soupLayerCutoff,
            surfaceMinCount: this.surfaceMinCount,
            spawnStagger: this.spawnStagger,
            scatterMinDistFactor: this.scatterMinDistFactor,
            spawnRadiusFactor: this.spawnRadiusFactor,
            idleBobAmplitude: this.idleBobAmplitude,
            idleBobFrequency: this.idleBobFrequency,
            ambientBubbleInterval: this.ambientBubbleInterval,
            springStiffness: this.springStiffness,
            springDamping: this.springDamping,
            shuffleUses: this.shuffleUses,
        };
    }
}
