import {
    _decorator, Component, Node, UITransform, Color, Label, Vec3, Graphics,
    tween, Tween, UIOpacity, EventTouch,
    Sprite, SpriteFrame, Prefab, instantiate,
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
        tooltip: '食材飞到订单格落位时的最终缩放系数。建议 0.4~0.8',
        range: [0.1, 1.5, 0.05],
        slide: true,
    })
    orderDishScale: number = 0.6;

    @property({
        tooltip: '食材飞到暂存槽落位时的最终缩放系数。建议 0.4~0.8',
        range: [0.1, 1.5, 0.05],
        slide: true,
    })
    slotDishScale: number = 0.6;

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

    // 10 种食材按 DishType 顺序：0卷心菜 1西兰花 2小白菜 3香菜 4秋葵 5牛油果 6葱 7竹笋 8青椒 9生菜叶
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

    // 结算
    @property({ type: SpriteFrame, tooltip: '胜利覆盖屏背景（建议铺满 786×1704）' })
    winOverlaySprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '失败覆盖屏背景（建议铺满 786×1704）' })
    failOverlaySprite: SpriteFrame | null = null;
    // ──────────────────────────────────────────────────────────────

    private _gm: GameManager | null = null;
    private _bowl: BowlController | null = null;
    private _spawner: BowlSpawner | null = null;
    private _slots: SlotBar | null = null;
    private _orders: OrderSystem | null = null;

    private _winNode: Node | null = null;
    private _failNode: Node | null = null;

    /** 顾客 home 位置（飞出飞入动画基准） */
    private _customerHomePos: Vec3[] = [];

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

    private get _level(): LevelData {
        return this.levelConfig ? this.levelConfig.toLevelData() : LEVEL_1;
    }

    onLoad() {
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
        this._orders!.init(levelData);
        const allOrderTypes = this._orders!.getAllPendingTypes();
        this._spawner!.spawnInitial(levelData, allOrderTypes);
        this._shuffleRemaining = levelData.shuffleUses;
        this._refreshShuffleLabel();

        // 初始化所有顾客头顶的需求气泡
        for (let i = 0; i < ORDER_COUNT; i++) {
            this._updateCustomerBubble(i);
        }
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
        // 食材图标：按 type 字段从 dishVariants 找
        const icon = this.bubbleIcons[idx];
        if (icon) {
            const variant = this.dishVariants.find(v => v && v.type === spec.type);
            if (variant && variant.sprites && variant.sprites.length > 0) {
                icon.spriteFrame = variant.sprites[0];
            }
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
        bowl.refillThreshold = levelData.refillThreshold;
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
        const win = this._addUI(this.node, 'win', DESIGN_W, DESIGN_H, 0);
        this._applySprite(win, this.winOverlaySprite);
        // 无 sprite 时不画占位文字
        win.active = false;
        this._winNode = win;

        const fail = this._addUI(this.node, 'fail', DESIGN_W, DESIGN_H, 0);
        this._applySprite(fail, this.failOverlaySprite);
        fail.active = false;
        this._failNode = fail;
    }

    private _hookEvents() {
        const bowl = this._bowl!;
        const slots = this._slots!;
        const orders = this._orders!;
        const spawner = this._spawner!;
        const gm = this._gm!;

        bowl.node.on(BowlEvent.DishTapped, (dish: DishItem) => {
            if (gm.state !== GameState.Play) return;
            this._handleDishTap(dish);
        }, this);

        bowl.node.on(BowlEvent.LowOnDishes, () => {
            if (gm.state !== GameState.Play) return;
            if (spawner.getPendingSpawnCount() > 0) {
                spawner.refill(gm.level);
            }
        }, this);

        slots.node.on(SlotEvent.Full, () => {
            this._fail();
        }, this);

        orders.node.on(OrderEvent.OrderCompleted, (_oldType: DishType, _newType: DishType, idx: number) => {
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
            this._updateCustomerBubble(idx);
        }, this);
    }

    private _handleDishTap(dish: DishItem) {
        const type = dish.dishType;
        const slots = this._slots!;
        const orders = this._orders!;
        const bowl = this._bowl!;

        // 优先尝试飞向有空位的订单格
        const orderIdx = orders.findOrderIdx(type);
        if (orderIdx >= 0 && this._orderDishes[orderIdx].length < 3) {
            this._flyDishToOrder(dish, type, orderIdx, () => {
                bowl.checkLow();
                this._checkWin();
            });
            return;
        }

        // 飞向暂存槽：常驻，等对应订单出现再启程
        const slotIdx = slots.findFirstEmptyIdx();
        if (slotIdx < 0) return;
        const targetCell = slots.cellNode(slotIdx)!;
        const targetWp = targetCell.getWorldPosition();
        dish.flyToSlot(targetWp, () => {
            dish.settleAt(targetCell, new Vec3(0, 0, 0));
            slots.acceptDishAt(slotIdx, type, dish);
            bowl.checkLow();
            this._checkWin();
        }, this.slotDishScale);
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

        dish.flyToSlot(targetWp, () => {
            dish.settleAt(targetCell, triLocal, slotInTriangle);
            // 递增计数；若 reach need 会触发 OrderCompleted → _clearOrderDishes 销毁数组
            orders.contributeFromSlot(type, 1);
            onDone();
        }, this.orderDishScale);
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

    private _fail() {
        if (this._gm!.state !== GameState.Play) return;
        this._gm!.setState(GameState.Fail);
        if (this._failNode) this._failNode.active = true;
    }

    private _win() {
        if (this._gm!.state !== GameState.Play) return;
        this._gm!.setState(GameState.Win);
        if (this._winNode) this._winNode.active = true;
    }
}
