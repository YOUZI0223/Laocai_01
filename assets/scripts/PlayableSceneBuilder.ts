import {
    _decorator, Component, Node, UITransform, Color, Label, Vec3, Graphics,
    tween, Tween, UIOpacity, EventTouch,
    Sprite, SpriteFrame, Prefab, instantiate,
    AudioClip, AudioSource,
} from 'cc';
import { DishSpriteVariants } from './ArtTypes';
import { GameManager, GameState } from './GameManager';
import { BowlController, BowlEvent } from './BowlController';
import { BowlSpawner } from './BowlSpawner';
import { SlotBar, SlotEvent } from './SlotBar';
import { OrderSystem, OrderEvent } from './OrderSystem';
import { DishItem } from './DishItem';
import { DishType, LEVEL_1, LevelData, ORDER_COUNT } from './LevelConfig';
import { LevelConfigComponent } from './LevelConfigComponent';

const { ccclass, property } = _decorator;

const DESIGN_W = 786;
const DESIGN_H = 1704;

@ccclass('PlayableSceneBuilder')
export class PlayableSceneBuilder extends Component {

    // ───────────────── 关卡配置槽 ─────────────────
    @property({
        type: LevelConfigComponent,
        tooltip: '关卡配置组件（拖入场景中挂载了 LevelConfigComponent 的节点）；留空则使用代码中的 LEVEL_1 默认值',
    })
    levelConfig: LevelConfigComponent | null = null;

    // ───────────────── 上方区域：用户预置 layout 节点 ─────────────────
    @property({ type: Node, tooltip: '顶部整片区域 layout 根节点（顾客 + 气泡 + 鸭厨师）。脚本本身不直接读它，留作场景层级整理用' })
    topAreaLayout: Node | null = null;

    @property({ type: Node, tooltip: '鸭厨师占位节点。脚本会把 chefPrefab/chefSprite 内容塞进去，已自带美术则保持空即可' })
    chefSlot: Node | null = null;

    @property({ type: [Node], tooltip: '4 个顾客根节点（0~3）。脚本读取其初始 local 位置作为 home，执行飞入飞出动画' })
    customerSlots: Node[] = [];

    @property({ type: [Sprite], tooltip: '4 个顾客肖像 Sprite（0~3，平行于 customerSlots）。脚本每次刷新随机从 customerSprites 抽一张赋上' })
    customerPortraits: Sprite[] = [];

    @property({ type: [Node], tooltip: '4 个气泡根节点（0~3）。订单关闭时脚本会设 active=false 隐藏整个气泡' })
    bubbleRoots: Node[] = [];

    @property({ type: [Sprite], tooltip: '4 个气泡内的食材图标 Sprite（0~3）' })
    bubbleIcons: Sprite[] = [];

    @property({ type: [Label], tooltip: '4 个气泡内的 ×N 文字 Label（0~3）' })
    bubbleLabels: Label[] = [];

    @property({ type: [Node], tooltip: '4 个订单盘子 cell 节点（0~3）。食材飞向它们；脚本只读位置，不画背景' })
    orderSlots: Node[] = [];

    @property({ type: [Node], tooltip: '5 个暂存槽 cell 节点（0~4）。位置/缩放/美术全部由场景中预置，脚本只用作落点和标记类型' })
    slotCells: Node[] = [];

    @property({
        tooltip: '锅中心的 Y 坐标（设计坐标系，正值往上、负值往下）。设计高度 1704，区间 [-852, 852]',
        range: [-852, 852, 5],
        slide: true,
    })
    bowlY: number = -312;

    @property({
        tooltip: '食材飞到订单格后，相对"刚好装满 cell"的缩放比例。1.0=贴 cell 边框，0.5~0.6=约占 cell 一半（便于三个食材共存不重叠太多）',
        range: [0.1, 1.5, 0.05],
        slide: true,
    })
    orderDishScale: number = 0.55;

    @property({
        tooltip: '食材飞到暂存槽后，相对"刚好装满 cell"的缩放比例。1.0=贴 cell 边框，0.8~0.9=留一点安全边',
        range: [0.1, 1.5, 0.05],
        slide: true,
    })
    slotDishScale: number = 0.85;

    @property({
        tooltip: '气泡里食材图标的目标外框边长（正方形）。图标以此为参考，按原图比例较长边贴合。完全不依赖场景中 bubbleIcons 节点尺寸，避免受任何父级 Layout / 非等比 scale 干扰',
        range: [20, 200, 2],
        slide: true,
    })
    bubbleIconBoxSize: number = 80;

    @property({ type: Node, tooltip: '打乱按钮根节点。位置/缩放/美术由场景中预置；脚本只挂点击事件和动态 ×N 数字。留空则脚本程序化建一个按钮' })
    shuffleBtnSlot: Node | null = null;

    // ───────────────── 美术槽（Inspector 中可拖入）─────────────────
    @property({ type: SpriteFrame, tooltip: '全屏背景 786×1704' })
    bgSprite: SpriteFrame | null = null;

    // 锅 / 水
    @property({ type: SpriteFrame, tooltip: '金属碗外圈（圆形或方形 PNG 都可，会缩放到碗尺寸）' })
    bowlSprite: SpriteFrame | null = null;

    @property({ type: Prefab, tooltip: '碗内汤水 Prefab（推荐：含 Sprite + Animation 序列帧组件），优先于 waterSprite' })
    waterPrefab: Prefab | null = null;

    @property({ type: SpriteFrame, tooltip: '碗内汤水静图（waterPrefab 为空时使用）' })
    waterSprite: SpriteFrame | null = null;

    @property({ type: Prefab, tooltip: '汤面中间带 Prefab（位于第二层与第三层食材之间，含 Sprite + Animation 序列帧组件）' })
    soupSurfacePrefab: Prefab | null = null;

    // 17 种食材按 DishType 顺序：0卷心菜 1西兰花 2花菜 3香菜 4黄瓜片 5南瓜 6大葱 7柠檬片 8青椒 9生菜叶
    //                          10青菜 11芹菜 12哈密瓜 13茄子 14甜菜 15红椒 16洋葱片
    @property([DishSpriteVariants])
    dishVariants: DishSpriteVariants[] = [];

    // 鸭厨师（二选一：填 Prefab 优先用于 Spine；只填 SpriteFrame 则用静图）
    @property({ type: Prefab, tooltip: '鸭厨师 Prefab（含 Spine 骨骼动画时填这个）' })
    chefPrefab: Prefab | null = null;

    @property({ type: SpriteFrame, tooltip: '鸭厨师静图（chefPrefab 为空时使用）' })
    chefSprite: SpriteFrame | null = null;

    // 顾客
    @property({ type: [SpriteFrame], tooltip: '顾客形象池，每次刷新随机抽一张设到 customerPortraits 上' })
    customerSprites: SpriteFrame[] = [];

    // 槽位
    @property({ type: SpriteFrame, tooltip: '暂存槽单元背景（建议 9-slice）。留空则槽位无背景' })
    slotCellSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '订单单元背景（建议 9-slice）。orderSlots 已自带美术时留空即可' })
    orderCellSprite: SpriteFrame | null = null;

    // 道具
    @property({ type: SpriteFrame, tooltip: '🔀 打乱按钮整张图（建议 9-slice）' })
    shuffleBtnSprite: SpriteFrame | null = null;

    // 新手引导：手指节点 + 目标个数 + 启动延迟 + 手指相对目标偏移
    @property({ type: Node, tooltip: '新手引导手指节点。运行时脚本 reparent 到脚本根，指向锅内高亮食材，做呼吸缩放动画引导玩家点击。留空则跳过引导' })
    tutorialFinger: Node | null = null;

    @property({
        tooltip: '新手引导：延迟启动时间（秒）。等待初始食材上浮动画结束。太小手指会指到还在飞的食材',
        range: [0, 5, 0.1],
        slide: true,
    })
    tutorialStartDelay: number = 1.6;

    @property({
        tooltip: '新手引导高亮食材数量。一般 = 首个订单的 need（默认 3）',
        range: [1, 5, 1],
        slide: true,
    })
    tutorialHighlightCount: number = 3;

    @property({
        tooltip: '手指相对目标食材的 X 偏移（像素）。正右负左',
        range: [-200, 200, 5],
        slide: true,
    })
    tutorialFingerOffsetX: number = 30;

    @property({
        tooltip: '手指相对目标食材的 Y 偏移（像素）。正上负下',
        range: [-200, 200, 5],
        slide: true,
    })
    tutorialFingerOffsetY: number = -40;

    @property({
        tooltip: '手指呼吸缩放动画：最大缩放值。1.15 = 放大到 115% 再回落',
        range: [1.0, 1.5, 0.02],
        slide: true,
    })
    tutorialFingerBreathScale: number = 1.15;

    @property({
        tooltip: '手指呼吸动画半个周期时长（秒）。0.5 = 每 1 秒完成一次放大回缩',
        range: [0.2, 1.5, 0.05],
        slide: true,
    })
    tutorialFingerBreathDur: number = 0.5;

    // 结算：预置在场景里的整个覆盖节点（含背景 Sprite / Label / 按钮等）
    @property({ type: Node, tooltip: '胜利覆盖屏节点。运行时初始隐藏；触发 Win 时脚本会 reparent 到脚本根最上层并播弹性动画' })
    winOverlay: Node | null = null;

    @property({ type: Node, tooltip: '失败覆盖屏节点。运行时初始隐藏；触发 Fail 时脚本会 reparent 到脚本根最上层并播弹性动画' })
    failOverlay: Node | null = null;

    @property({ type: Node, tooltip: '结算压暗遮罩节点（Win/Fail 共用）。用户设 Sprite color 的 alpha 决定最终暗度，脚本 fade in 到该值。位于 overlay 下方一层' })
    dimmerOverlay: Node | null = null;

    // ── 音效 ─────────────────────────────────────────────
    @property({ type: AudioClip, tooltip: '食材初始生成（整锅入场上浮）时的音效' })
    sfxDishSpawn: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: '点击锅内食材的音效' })
    sfxDishTap: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: '订单完成（消除）时的音效' })
    sfxOrderCompleted: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: '新订单刷新（补入订单池新单）时的音效。初始 4 个订单登场不触发' })
    sfxOrderRefreshed: AudioClip | null = null;

    @property({ tooltip: '新订单刷新音效的延迟播放时间（秒），避免和订单完成音效撞车', range: [0, 2, 0.05], slide: true })
    sfxOrderRefreshedDelay: number = 0.4;

    @property({ type: AudioClip, tooltip: '胜利结算音效' })
    sfxWin: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: '失败结算音效' })
    sfxFail: AudioClip | null = null;

    @property({ tooltip: '全局音效音量（不影响胜利/失败结算音效，它们各自独立）', range: [0, 1, 0.05], slide: true })
    sfxVolume: number = 0.8;

    @property({ tooltip: '胜利结算音效音量（独立控制，覆盖 sfxVolume）', range: [0, 1, 0.05], slide: true })
    sfxWinVolume: number = 0.8;

    @property({ tooltip: '失败结算音效音量（独立控制，覆盖 sfxVolume）', range: [0, 1, 0.05], slide: true })
    sfxFailVolume: number = 0.8;
    // ──────────────────────────────────────────────────────────────

    private _gm: GameManager | null = null;
    private _bowl: BowlController | null = null;
    private _spawner: BowlSpawner | null = null;
    private _slots: SlotBar | null = null;
    private _orders: OrderSystem | null = null;


    /** 顾客 home 位置（飞出飞入动画基准） */
    private _customerHomePos: Vec3[] = [];
    /** 挂在 this.node 下的气泡食材视觉节点（每个订单一个），彻底脱离气泡节点层级 */
    private _bubbleVisuals: (Node | null)[] = [];

    /** 挂在脚本节点上的 AudioSource，用 playOneShot 播放所有 SFX */
    private _audio: AudioSource | null = null;
    /** OrderSystem.init 完成后为 true；用来抑制初始 4 单登场时误触发"新订单刷新"音效 */
    private _ordersInitDone: boolean = false;

    /** 已落位在每个订单格里的食材数组（最多 need 个，三角分布） */
    private _orderDishes: DishItem[][] = [];

    /** 订单格三角分布 local 位置（idx 0/1/2 对应三角的三个落点；同时 sibling 顺序决定上下层级） */
    private static readonly _TRIANGLE_LOCAL: Vec3[] = [
        new Vec3(0, 18, 0),      // 第 1 颗：顶（最先入格，drawn 第一层 → 在底）
        new Vec3(-22, -12, 0),   // 第 2 颗：左下（drawn 第二层 → 中层）
        new Vec3(22, -12, 0),    // 第 3 颗：右下（drawn 第三层 → 最上）
    ];

    private _shuffleBtn: Node | null = null;
    private _shuffleLabel: Label | null = null;
    private _shuffleRemaining: number = 0;

    // ── 新手引导状态 ─────────────────────────────
    /** 引导激活中：剩余未点击的高亮食材列表。手指恒指 [0]，玩家可乱序点，点一颗就 splice 一颗 */
    private _tutorialActive: boolean = false;
    private _tutorialTargets: DishItem[] = [];

    private get _level(): LevelData {
        return this.levelConfig ? this.levelConfig.toLevelData() : LEVEL_1;
    }

    onLoad() {
        // AudioSource：全局 SFX 播放器，用 playOneShot 播每个 clip
        this._audio = this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);

        // 每个订单格各一组三角分布的食材容器
        this._orderDishes = [];
        for (let i = 0; i < ORDER_COUNT; i++) this._orderDishes.push([]);

        this._buildBackground();
        this._gm = this.node.addComponent(GameManager);

        this._setupTopArea();
        this._setupOrders();
        this._buildSlotBar();
        this._buildBowlAndSpawner();
        this._buildShuffleButton();
        this._buildEndScreens();

        this._hookEvents();
    }

    start() {
        const levelData = this._level;
        this._gm!.startLevel(levelData);
        // OrderSystem.init 会同步 emit ORDER_COUNT 次 OrderRefreshed（初始 4 单登场）
        // → 用 _ordersInitDone flag 抑制这段时间的音效，只在之后（补单）触发
        this._ordersInitDone = false;
        this._orders!.init(levelData);
        this._ordersInitDone = true;
        const allOrderTypes = this._orders!.getAllPendingTypes();
        this._spawner!.spawnInitial(levelData, allOrderTypes);
        this._playSfx(this.sfxDishSpawn);
        this._shuffleRemaining = levelData.shuffleUses;
        this._refreshShuffleLabel();

        // 初始化所有顾客头顶的需求气泡
        for (let i = 0; i < ORDER_COUNT; i++) {
            this._updateCustomerBubble(i);
        }

        // 新手引导：等初始食材上浮结束后再启动，避免手指指到还在飞行途中的食材
        if (this.tutorialFinger) {
            this.scheduleOnce(() => this._startTutorial(), this.tutorialStartDelay);
        }
    }

    /**
     * 气泡食材视觉挂在 this.node 下（脱离气泡节点层级），每帧同步锚点节点的
     * 世界位置、显隐、累积透明度，让飞入飞出的 opacity 动画依然生效。
     */
    protected update(dt: number) {
        for (let i = 0; i < ORDER_COUNT; i++) {
            const visual = this._bubbleVisuals[i];
            const anchor = this.bubbleIcons[i];
            const bubble = this.bubbleRoots[i];
            if (!visual || !anchor || !bubble) continue;

            // 位置：锚点 world position → visual 父容器的 local space
            const wp = anchor.node.getWorldPosition();
            const parentUI = this.node.getComponent(UITransform);
            if (parentUI) {
                const local = parentUI.convertToNodeSpaceAR(wp);
                visual.setPosition(local);
            } else {
                visual.setWorldPosition(wp);
            }

            // 显隐：跟随 bubbleRoots activeInHierarchy
            visual.active = bubble.activeInHierarchy;

            // 透明度：读锚点祖先链所有 UIOpacity 的累积值，写到 visual 的 UIOpacity
            const cumOp = this._cumulativeOpacity(anchor.node);
            const vop = visual.getComponent(UIOpacity);
            if (vop) vop.opacity = cumOp;
        }

        // 新手引导手指跟随剩余列表的第一颗（玩家可乱序点，点掉哪颗就 splice 哪颗）
        if (this._tutorialActive && this.tutorialFinger) {
            const cur = this._tutorialTargets[0];
            if (cur && cur.node && cur.node.isValid && !cur.isConsumed) {
                const wp = cur.node.getWorldPosition();
                const parentUI = this.node.getComponent(UITransform);
                if (parentUI) {
                    const local = parentUI.convertToNodeSpaceAR(wp);
                    this.tutorialFinger.setPosition(
                        local.x + this.tutorialFingerOffsetX,
                        local.y + this.tutorialFingerOffsetY,
                        0,
                    );
                }
            }
        }
    }

    /** 从节点自身到根，累乘 UIOpacity.opacity（0~255），返回 0~255 */
    private _cumulativeOpacity(node: Node): number {
        let mul = 1;
        let cur: Node | null = node;
        while (cur) {
            const uio = cur.getComponent(UIOpacity);
            if (uio) mul *= (uio.opacity / 255);
            cur = cur.parent;
        }
        return Math.max(0, Math.min(255, Math.round(mul * 255)));
    }

    // ─────────────── 工具方法 ───────────────

    private _addUI(parent: Node, name: string, w: number, h: number, y: number): Node {
        const n = new Node(name);
        n.layer = this.node.layer;
        parent.addChild(n);
        const ui = n.addComponent(UITransform);
        ui.setContentSize(w, h);
        n.setPosition(0, y, 0);
        return n;
    }

    /** sprite 有值则套上；为空则什么都不画（不再画 Graphics 占位） */
    private _applySprite(n: Node, sf: SpriteFrame | null, sliced = false) {
        if (!sf) return;
        const ui = n.getComponent(UITransform)!;
        const w = ui.width, h = ui.height;
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        sp.spriteFrame = sf;
        ui.setContentSize(w, h);
    }

    private _label(parent: Node, text: string, size: number, color: Color, x = 0, y = 0): Label {
        const n = new Node('label');
        n.layer = this.node.layer;
        parent.addChild(n);
        n.setPosition(x, y, 0);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.lineHeight = size + 4;
        lbl.color = color;
        return lbl;
    }

    private _buildBackground() {
        const bg = this._addUI(this.node, 'bg', DESIGN_W, DESIGN_H, 0);
        this._applySprite(bg, this.bgSprite);
    }

    // ─────────────── 顶部区域：消费用户预置的 layout 节点 ───────────────

    private _setupTopArea() {
        // 编辑器里可能为整理视图把节点隐藏了，运行时强制启用
        if (this.chefSlot) this.chefSlot.active = true;

        this._setupChef();
        // chefSlot 自身的占位背景（Sprite/Graphics）运行时不画，仅保留 Node 作为容器
        this._hideSlotBackground(this.chefSlot);

        // 4 个顾客：记录 home 位置 + 设置随机肖像 + 隐藏 slot 自身的占位背景 + 把气泡挂到顾客下面
        // 注意：若 customerPortraits[i] 指的就是 slot 自己的 Sprite（slot 节点同时承担 portrait），
        // 把该 Sprite 跳过不禁，避免连同骑手肖像一起消失
        for (let i = 0; i < ORDER_COUNT; i++) {
            const slot = this.customerSlots[i];
            if (slot) {
                slot.active = true;  // 编辑器可能为整理视图隐藏，运行时强制启用
                this._customerHomePos.push(slot.position.clone());
                this._setRandomPortrait(i);
                this._hideSlotBackground(slot, this.customerPortraits[i]);
                // 气泡绑到顾客下面，跟随顾客飞入飞出 + 透明度
                this._bindBubbleToCustomer(i);
            } else {
                this._customerHomePos.push(new Vec3());
            }
            // 禁用场景预置 bubbleIcons 自身的 Sprite（防止占位图残留，且节点只当锚点用）
            const icon = this.bubbleIcons[i];
            if (icon) icon.enabled = false;
            this._bubbleVisuals.push(null);
        }
    }

    /** 把 bubbleRoots[i] 重新作为 customerSlots[i] 的子节点，保留世界位置不变 */
    private _bindBubbleToCustomer(idx: number) {
        const bubble = this.bubbleRoots[idx];
        const slot = this.customerSlots[idx];
        if (!bubble || !slot) return;
        if (bubble.parent === slot) return;
        const wp = bubble.worldPosition.clone();
        bubble.removeFromParent();
        slot.addChild(bubble);
        bubble.worldPosition = wp;
    }

    /**
     * 禁掉节点自身的 Sprite/Graphics 组件，保留 Node 与子节点继续渲染。
     * 当 slot 节点同时承担 portrait（自身 Sprite 就是肖像）时，传入 portrait 引用避免被一起禁掉。
     */
    private _hideSlotBackground(node: Node | null, preserveSprite?: Sprite | null) {
        if (!node) return;
        const sp = node.getComponent(Sprite);
        if (sp && sp !== preserveSprite) sp.enabled = false;
        const gfx = node.getComponent(Graphics);
        if (gfx) gfx.enabled = false;
    }

    private _setupChef() {
        if (!this.chefSlot) return;
        if (this.chefPrefab) {
            const inst = instantiate(this.chefPrefab);
            inst.layer = this.chefSlot.layer;
            this.chefSlot.addChild(inst);
        } else if (this.chefSprite) {
            // 在 chefSlot 内找/造一个 portrait Sprite 节点
            let portrait = this.chefSlot.getChildByName('portrait');
            if (!portrait) {
                portrait = new Node('portrait');
                portrait.layer = this.chefSlot.layer;
                this.chefSlot.addChild(portrait);
                const ui = portrait.addComponent(UITransform);
                ui.setContentSize(120, 140);
                const sp = portrait.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.type = Sprite.Type.SIMPLE;
                sp.spriteFrame = this.chefSprite;
            } else {
                const sp = portrait.getComponent(Sprite);
                if (sp) sp.spriteFrame = this.chefSprite;
            }
        }
        // 无 prefab 无 sprite 时不画占位文字
    }

    private _setRandomPortrait(idx: number) {
        const sprite = this.customerPortraits[idx];
        if (!sprite) return;
        if (this.customerSprites.length === 0) return;
        const pick = this.customerSprites[Math.floor(Math.random() * this.customerSprites.length)];
        if (pick) sprite.spriteFrame = pick;
    }

    /** 用当前订单数据刷新指定索引的气泡 */
    private _updateCustomerBubble(idx: number) {
        if (!this._orders) return;
        if (idx < 0 || idx >= ORDER_COUNT) return;
        const spec = this._orders.getOrderSpec(idx);
        const root = this.bubbleRoots[idx];
        if (!spec || !spec.active) {
            if (root) root.active = false;
            return;
        }
        if (root) root.active = true;
        // 食材图标：视觉节点直接挂在 this.node（脚本根，绝对干净的容器）下。
        // 场景中的 bubbleIcons[idx] 节点只贡献 world position（位置锚点），
        // 一切 UITransform / Sprite / 父级 Layout / 非等比 scale 干扰在这里完全隔离。
        const variant = this.dishVariants.find(v => v && v.type === spec.type);
        if (variant && variant.sprites && variant.sprites.length > 0) {
            const sf = variant.sprites[0];
            let visual = this._bubbleVisuals[idx];
            if (!visual) {
                visual = new Node('_bubble_visual_' + idx);
                visual.layer = this.node.layer;
                this.node.addChild(visual);
                visual.addComponent(UITransform);
                visual.addComponent(Sprite);
                visual.addComponent(UIOpacity);
                this._bubbleVisuals[idx] = visual;
            }
            const vsp = visual.getComponent(Sprite)!;
            const vui = visual.getComponent(UITransform)!;
            vsp.sizeMode = Sprite.SizeMode.CUSTOM;
            vsp.type = Sprite.Type.SIMPLE;
            vsp.spriteFrame = sf;
            // UITransform = 原图 rect 尺寸（1:1 保比例）；视觉大小完全由等比 node.scale 控制
            const rect = sf.rect;
            vui.setContentSize(rect.width, rect.height);
            const box = this.bubbleIconBoxSize;
            const s = Math.min(box / rect.width, box / rect.height);
            visual.setScale(s, s, 1);
        }
        const label = this.bubbleLabels[idx];
        if (label) {
            const remaining = spec.need - spec.filled;
            label.string = '×' + remaining;
        }
    }

    private _replaceCustomer(idx: number) {
        const node = this.customerSlots[idx];
        if (!node) return;
        const home = this._customerHomePos[idx];
        if (!home) return;

        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacity);

        // 老顾客上滑 + 渐隐 → 换肖像 + 复位高处 → 新顾客回正
        tween(node)
            .to(0.32, { position: new Vec3(home.x, home.y + 180, 0) }, { easing: 'cubicIn' })
            .start();
        tween(opacity)
            .to(0.32, { opacity: 0 })
            .call(() => {
                this._setRandomPortrait(idx);
                node.setPosition(home.x, home.y + 180, 0);
                tween(node)
                    .to(0.32, { position: new Vec3(home.x, home.y, 0) }, { easing: 'backOut' })
                    .start();
                tween(opacity)
                    .to(0.28, { opacity: 255 })
                    .start();
                // 新订单气泡刷新
                this.scheduleOnce(() => this._updateCustomerBubble(idx), 0.05);
            })
            .start();
    }

    // ─────────────── 订单系统：复用用户预置盘子节点 ───────────────

    private _setupOrders() {
        // OrderSystem 当状态管理器；视觉由 orderSlots 节点承担
        const orderHost = new Node('order-system');
        orderHost.layer = this.node.layer;
        this.node.addChild(orderHost);
        orderHost.addComponent(UITransform);
        this._orders = orderHost.addComponent(OrderSystem);
        if (this.orderSlots && this.orderSlots.length > 0) {
            this._orders.useExternalCells(this.orderSlots);
        }
        // 用户已自带盘子美术就不再覆盖；填了 orderCellSprite 才会套
        if (this.orderCellSprite) {
            this._orders.applyCellSprite(this.orderCellSprite);
        }
    }

    private _buildShuffleButton() {
        let btn: Node;
        const useExternal = !!this.shuffleBtnSlot;
        if (useExternal) {
            btn = this.shuffleBtnSlot!;
            btn.active = true;  // 编辑器可能为整理视图隐藏，运行时强制启用
        } else {
            const y = DESIGN_H * 0.5 - 600;
            btn = this._addUI(this.node, 'shuffle', 200, 90, y);
            btn.setPosition(DESIGN_W * 0.5 - 130, y, 0);
        }

        // 用户提供 slot 时认为美术已在场景里摆好；脚本不再覆盖
        if (!useExternal) {
            this._applySprite(btn, this.shuffleBtnSprite, true);
        }

        // ×N 动态数字一律由脚本创建挂到 btn 下；slot 模式下挂到用户节点中心 +24 右偏
        this._shuffleLabel = this._label(btn, '×3', 32, new Color(255, 255, 255, 255), 24, 0);

        btn.on(Node.EventType.TOUCH_END, this._onShuffleTap, this);
        this._shuffleBtn = btn;
    }

    private _onShuffleTap(e: EventTouch) {
        if (!this._gm || this._gm.state !== GameState.Play) return;
        if (this._shuffleRemaining <= 0) return;
        e.propagationStopped = true;
        this._shuffleRemaining--;
        this._refreshShuffleLabel();
        this._bowl?.shuffle();
    }

    private _refreshShuffleLabel() {
        if (!this._shuffleLabel) return;
        this._shuffleLabel.string = '×' + this._shuffleRemaining;
        if (this._shuffleBtn) {
            const op = this._shuffleBtn.getComponent(UIOpacity) ?? this._shuffleBtn.addComponent(UIOpacity);
            op.opacity = this._shuffleRemaining > 0 ? 255 : 110;
        }
    }

    private _checkWin() {
        if (!this._gm || !this._orders) return;
        if (this._gm.state !== GameState.Play) return;
        if (this._orders.getRemainingOrderCount() === 0) {
            this._win();
        }
    }

    private _buildSlotBar() {
        // SlotBar 当状态管理器；视觉与位置由 slotCells 节点承担（与 orderSlots 同套路）
        const host = new Node('slot-bar');
        host.layer = this.node.layer;
        this.node.addChild(host);
        host.addComponent(UITransform);
        this._slots = host.addComponent(SlotBar);
        if (this.slotCells && this.slotCells.length > 0) {
            this._slots.useExternalCells(this.slotCells);
        }
        // 用户已自带槽位美术就不再覆盖；填了 slotCellSprite 才会套
        if (this.slotCellSprite) {
            this._slots.applyCellSprite(this.slotCellSprite);
        }
    }

    private _buildBowlAndSpawner() {
        const levelData = this._level;
        const radius = levelData.bowlRadius;
        const host = this._addUI(this.node, 'bowl', radius * 2 + 30, radius * 2 + 30, this.bowlY);
        const bowl = host.addComponent(BowlController);
        bowl.radius = radius;
        bowl.applyLevelConfig(levelData);
        this._bowl = bowl;
        bowl.applyBowlSkin(this.bowlSprite, this.waterSprite, this.waterPrefab);
        bowl.applySoupSurface(this.soupSurfacePrefab);

        const spawnerHost = new Node('spawner');
        spawnerHost.layer = this.node.layer;
        this.node.addChild(spawnerHost);
        const sp = spawnerHost.addComponent(BowlSpawner);
        sp.bowl = bowl;
        sp.dishVariants = this.dishVariants;
        this._spawner = sp;
    }

    private _buildEndScreens() {
        // 场景中预置的 overlay 节点：初始隐藏，等待 _win/_fail 触发时 reparent + 弹性入场
        if (this.winOverlay) this.winOverlay.active = false;
        if (this.failOverlay) this.failOverlay.active = false;
        if (this.dimmerOverlay) this.dimmerOverlay.active = false;
        // 新手引导手指：初始隐藏，等 _startTutorial 触发时激活
        if (this.tutorialFinger) this.tutorialFinger.active = false;
    }

    /** 播放一次 SFX。clip 为空时静默跳过。volume 未传时用 sfxVolume 全局音量。 */
    private _playSfx(clip: AudioClip | null, volume?: number) {
        if (!clip || !this._audio) return;
        this._audio.playOneShot(clip, volume !== undefined ? volume : this.sfxVolume);
    }

    /**
     * 启用压暗遮罩：reparent 到脚本根末尾（会被之后 setSiblingIndex 的 overlay 压到其上），fade in。
     * 最终透明度由用户在场景中 Sprite color.alpha 控制，脚本只把 UIOpacity 从 0 tween 到 255。
     */
    private _showDimmer() {
        const d = this.dimmerOverlay;
        if (!d) return;
        d.setParent(this.node, true);
        d.setSiblingIndex(this.node.children.length);
        d.active = true;
        const op = d.getComponent(UIOpacity) ?? d.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        tween(op).to(0.25, { opacity: 255 }, { easing: 'sineOut' }).start();
    }

    /**
     * 触发结算覆盖屏：reparent 到脚本根节点末尾（保证渲染在最上层，不被任何 UI 覆盖），
     * 播放缩小 → 超大 → 回落的弹性入场 + 淡入。
     */
    private _showOverlayWithBounce(node: Node | null) {
        if (!node) return;
        node.setParent(this.node, true);                            // 保留 world transform
        node.setSiblingIndex(this.node.children.length);            // clamp 到最后 → 最上层
        node.active = true;

        Tween.stopAllByTarget(node);
        node.setScale(0.2, 0.2, 1);
        tween(node)
            .to(0.32, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.14, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineOut' })
            .start();

        const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        tween(op).to(0.20, { opacity: 255 }, { easing: 'sineOut' }).start();
    }

    private _hookEvents() {
        const bowl = this._bowl!;
        const slots = this._slots!;
        const orders = this._orders!;
        const gm = this._gm!;

        bowl.node.on(BowlEvent.DishTapped, (dish: DishItem) => {
            if (gm.state !== GameState.Play) return;
            this._playSfx(this.sfxDishTap);
            this._handleDishTap(dish);
        }, this);

        slots.node.on(SlotEvent.Full, () => {
            this._fail();
        }, this);

        orders.node.on(OrderEvent.OrderCompleted, (_oldType: DishType, _newType: DishType, idx: number) => {
            this._playSfx(this.sfxOrderCompleted);
            // 老订单的三角食材清空，给新订单腾位
            this._clearOrderDishes(idx);
            this._replaceCustomer(idx);
        }, this);

        orders.node.on(OrderEvent.NeedScanSlot, (type: DishType) => {
            // 新订单需要的类型，把暂存槽里同类食材逐颗飞到订单格
            const orderIdx = orders.findOrderIdx(type);
            if (orderIdx < 0) return;
            const taken = slots.takeAllOfType(type);
            for (const { dish } of taken) {
                if (!dish || !dish.node || !dish.node.isValid) continue;
                // 立即从暂存槽 cell 剥离到脚本根节点（中立飞行容器），保留世界坐标 →
                // 暂存槽 cell 视觉即刻清空，dish 独立飞行不再挂在原 cell 下
                dish.node.setParent(this.node, true);
                if (this._orderDishes[orderIdx].length >= 3) {
                    // 订单已满（三角占满），剩余的退回销毁——理论上不太会发生
                    dish.node.destroy();
                    continue;
                }
                this._flyDishToOrder(dish, type, orderIdx, () => {});
            }
        }, this);

        orders.node.on(OrderEvent.AllCompleted, () => {
            this._win();
        }, this);

        orders.node.on(OrderEvent.ProgressChanged, (idx: number) => {
            this._updateCustomerBubble(idx);
        }, this);

        orders.node.on(OrderEvent.OrderRefreshed, (idx: number) => {
            // init 期间 4 单登场也会 emit，用 flag 抑制；只有补单时才播刷新音效
            // 延迟播放，避免和订单完成音效撞车
            if (this._ordersInitDone) {
                this.scheduleOnce(() => this._playSfx(this.sfxOrderRefreshed), this.sfxOrderRefreshedDelay);
            }
            this._updateCustomerBubble(idx);
        }, this);
    }

    private _handleDishTap(dish: DishItem) {
        const type = dish.dishType;
        const slots = this._slots!;
        const orders = this._orders!;
        const bowl = this._bowl!;

        // 新手引导：若本次点击的是任一高亮食材（可乱序），从剩余列表移除，全部点完就收尾
        if (this._tutorialActive) {
            const idx = this._tutorialTargets.indexOf(dish);
            if (idx >= 0) this._tutorialAdvance(idx);
        }

        // 优先尝试飞向有空位的订单格
        const orderIdx = orders.findOrderIdx(type);
        if (orderIdx >= 0 && this._orderDishes[orderIdx].length < 3) {
            this._flyDishToOrder(dish, type, orderIdx, () => {
                bowl.checkLow();
                this._checkWin();
            });
            return;
        }

        // 飞向暂存槽：tap 瞬间就预占空 cell，防止飞行 tween 期间同类食材抢占同一格
        const slotIdx = slots.reserveEmpty(type);
        if (slotIdx < 0) return;
        const targetCell = slots.cellNode(slotIdx)!;
        const targetWp = targetCell.getWorldPosition();
        const slotFinalScale = this._computeFitScale(dish, targetCell) * this.slotDishScale;
        dish.flyToSlot(targetWp, () => {
            dish.settleAt(targetCell, new Vec3(0, 0, 0));
            slots.acceptDishAt(slotIdx, type, dish);
            bowl.checkLow();
            // 落定后立即扫描：如果当前订单其实还有空位（并发或时序造成 dish 误入暂存槽），
            // 把这颗 dish（连同暂存槽其它同 type 食材）拉去订单，避免孤立在暂存槽
            this._pullFromSlotsIfNeeded(type);
            this._checkWin();
        }, slotFinalScale);
    }

    /**
     * 检查指定 type 的当前订单是否还有空位；若有，从暂存槽把所有同类食材拉出来飞往订单。
     * 用来兜底"tap 时序判断把 dish 误送到暂存槽"或"暂存 dish 与订单需求匹配却没自动衔接"的情况。
     */
    private _pullFromSlotsIfNeeded(type: DishType) {
        const orders = this._orders!;
        const slots = this._slots!;
        const orderIdx = orders.findOrderIdx(type);
        if (orderIdx < 0) return;
        if (this._orderDishes[orderIdx].length >= 3) return;

        const taken = slots.takeAllOfType(type);
        for (const { dish } of taken) {
            if (!dish || !dish.node || !dish.node.isValid) continue;
            // 剥离到脚本根节点作为中立飞行容器，暂存槽 cell 视觉即刻清空
            dish.node.setParent(this.node, true);
            if (this._orderDishes[orderIdx].length >= 3) {
                dish.node.destroy();
                continue;
            }
            this._flyDishToOrder(dish, type, orderIdx, () => {});
        }
    }

    /**
     * 根据 dish 视觉尺寸 vs cell UITransform 尺寸，算出"刚好装入 cell"的缩放系数。
     * 用较短维匹配 → 长条食材两端不溢出 cell。
     */
    private _computeFitScale(dish: DishItem, cell: Node): number {
        const cellUI = cell.getComponent(UITransform);
        if (!cellUI) return 1;
        const vs = dish.visualSize;
        if (vs.width <= 0 || vs.height <= 0) return 1;
        return Math.min(cellUI.width / vs.width, cellUI.height / vs.height);
    }

    /**
     * 把一颗食材飞到指定订单格，落在三角的下一个空位上常驻。
     * 关键：发起时立即把 dish 推入 _orderDishes 预占位置，防止并发飞行落点重叠。
     */
    private _flyDishToOrder(dish: DishItem, type: DishType, orderIdx: number, onDone: () => void) {
        const orders = this._orders!;
        if (orderIdx < 0 || orderIdx >= ORDER_COUNT) { onDone(); return; }
        const targetCell = this.orderSlots[orderIdx];
        if (!targetCell) { onDone(); return; }

        // 预占三角槽位 idx，并立刻把 dish 加入数组（防并发冲突）
        const slotInTriangle = this._orderDishes[orderIdx].length;
        if (slotInTriangle >= 3) { onDone(); return; }
        this._orderDishes[orderIdx].push(dish);

        const triLocal = PlayableSceneBuilder._TRIANGLE_LOCAL[slotInTriangle];
        const cellWp = targetCell.getWorldPosition();
        const targetWp = new Vec3(cellWp.x + triLocal.x, cellWp.y + triLocal.y, cellWp.z);

        const orderFinalScale = this._computeFitScale(dish, targetCell) * this.orderDishScale;
        dish.flyToSlot(targetWp, () => {
            dish.settleAt(targetCell, triLocal, slotInTriangle);
            // 递增计数；若 reach need 会触发 OrderCompleted → _clearOrderDishes 销毁数组
            orders.contributeFromSlot(type, 1);
            // 该 dish 到达后如订单仍未满，把暂存槽里同类食材继续拉进来
            this._pullFromSlotsIfNeeded(type);
            onDone();
        }, orderFinalScale);
    }

    /** 销毁某订单格上常驻的所有食材（订单完成或顾客切换时调用） */
    private _clearOrderDishes(orderIdx: number) {
        if (orderIdx < 0 || orderIdx >= this._orderDishes.length) return;
        const arr = this._orderDishes[orderIdx];
        for (const d of arr) {
            if (d && d.node && d.node.isValid) d.node.destroy();
        }
        this._orderDishes[orderIdx] = [];
    }

    /**
     * 启动新手引导：
     *  1. 取首个订单类型，挑锅内该类型的 3 颗（优先浮层，再取沉层并顶上来）
     *  2. 每颗调 setTutorialHighlight(true) 描边高亮
     *  3. 手指 reparent 到脚本根 → 最上层，激活 + 呼吸缩放循环
     */
    private _startTutorial() {
        if (this._tutorialActive) return;
        if (!this._orders || !this._bowl) return;
        if (!this.tutorialFinger) return;
        const spec = this._level.initialOrders[0];
        if (!spec) return;
        const type = spec.type;

        const all = this._bowl.getAllDishes();
        // 优先浮层（可见），再取沉层；沉层同时顶上来保证可点
        const surface = all.filter(d => d.dishType === type && (d.forceSurface || d.displayZOffset >= 0));
        const submerged = all.filter(d => d.dishType === type && !d.forceSurface && d.displayZOffset < 0);
        const picked = [...surface, ...submerged].slice(0, this.tutorialHighlightCount);
        if (picked.length === 0) return;

        for (const d of picked) {
            d.setTutorialHighlight(true);
            if (!d.forceSurface && d.displayZOffset < 0) d.raiseToSurface();
        }
        this._tutorialTargets = picked;
        this._tutorialActive = true;

        const finger = this.tutorialFinger;
        finger.setParent(this.node, true);
        finger.setSiblingIndex(this.node.children.length);
        finger.active = true;
        finger.setScale(1, 1, 1);
        Tween.stopAllByTarget(finger);
        const s = this.tutorialFingerBreathScale;
        const dur = this.tutorialFingerBreathDur;
        tween(finger)
            .to(dur, { scale: new Vec3(s, s, 1) }, { easing: 'sineInOut' })
            .to(dur, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 玩家点中了任一高亮食材（可乱序）：清除该颗高亮并从剩余列表移除。
     * 剩余为空时收尾。手指下一帧 update 自动指向新的 _tutorialTargets[0]。
     */
    private _tutorialAdvance(idx: number) {
        if (!this._tutorialActive) return;
        if (idx < 0 || idx >= this._tutorialTargets.length) return;
        const dish = this._tutorialTargets[idx];
        if (dish && dish.node && dish.node.isValid) dish.setTutorialHighlight(false);
        this._tutorialTargets.splice(idx, 1);
        if (this._tutorialTargets.length === 0) {
            this._endTutorial();
        }
    }

    /** 收尾：停手指 tween、隐藏手指、清残留高亮、重置状态 */
    private _endTutorial() {
        this._tutorialActive = false;
        for (const d of this._tutorialTargets) {
            if (d && d.node && d.node.isValid) d.setTutorialHighlight(false);
        }
        this._tutorialTargets = [];
        const finger = this.tutorialFinger;
        if (finger) {
            Tween.stopAllByTarget(finger);
            finger.active = false;
        }
    }

    private _fail() {
        if (this._gm!.state !== GameState.Play) return;
        this._gm!.setState(GameState.Fail);
        this._playSfx(this.sfxFail, this.sfxFailVolume);
        this._showDimmer();
        this._showOverlayWithBounce(this.failOverlay);
    }

    private _win() {
        if (this._gm!.state !== GameState.Play) return;
        this._gm!.setState(GameState.Win);
        this._playSfx(this.sfxWin, this.sfxWinVolume);
        this._showDimmer();
        this._showOverlayWithBounce(this.winOverlay);
    }
}
