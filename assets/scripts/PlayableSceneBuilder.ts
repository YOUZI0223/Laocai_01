import {
    _decorator, Component, Node, UITransform, Graphics, Color, Label, Vec3,
    Canvas, view, Camera, tween, Tween, UIOpacity, EventTouch,
    Sprite, SpriteFrame, Prefab, instantiate,
} from 'cc';
import { DishSpriteVariants } from './ArtTypes';
import { GameManager, GameState, GameEvent } from './GameManager';
import { BowlController, BowlEvent } from './BowlController';
import { BowlSpawner } from './BowlSpawner';
import { SlotBar, SlotEvent } from './SlotBar';
import { OrderSystem, OrderEvent } from './OrderSystem';
import { DishItem } from './DishItem';
import { DishType, DISH_META, LEVEL_1, LevelData, ORDER_COUNT } from './LevelConfig';
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

    // ───────────────── 美术槽（Inspector 中可拖入）─────────────────
    // 背景
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
    // 每个元素是 DishSpriteVariants 结构体，内部 sprites 数组放该食材的不同角度图
    @property([DishSpriteVariants])
    dishVariants: DishSpriteVariants[] = [];

    // 鸭厨师（二选一：填 Prefab 优先用于 Spine；只填 SpriteFrame 则用静图）
    @property({ type: Prefab, tooltip: '鸭厨师 Prefab（含 Spine 骨骼动画时填这个）' })
    chefPrefab: Prefab | null = null;

    @property({ type: SpriteFrame, tooltip: '鸭厨师静图（chefPrefab 为空时使用）' })
    chefSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '鸭厨师背框（可选）' })
    chefBgSprite: SpriteFrame | null = null;

    // 顾客
    @property({ type: [SpriteFrame], tooltip: '顾客形象池，每次刷新随机抽一张' })
    customerSprites: SpriteFrame[] = [];

    @property({ type: SpriteFrame, tooltip: '顾客单元背框' })
    customerCellSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '顾客排顶部条背景' })
    customerStripSprite: SpriteFrame | null = null;

    // 槽位
    @property({ type: SpriteFrame, tooltip: '暂存槽单元背景（建议 9-slice）' })
    slotCellSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '订单单元背景（建议 9-slice）' })
    orderCellSprite: SpriteFrame | null = null;

    // 道具
    @property({ type: SpriteFrame, tooltip: '🔀 打乱按钮背景（建议 9-slice）' })
    shuffleBtnSprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '🔀 打乱按钮中央图标' })
    shuffleIconSprite: SpriteFrame | null = null;

    // 结算
    @property({ type: SpriteFrame, tooltip: '胜利覆盖屏背景' })
    winOverlaySprite: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '失败覆盖屏背景' })
    failOverlaySprite: SpriteFrame | null = null;
    // ──────────────────────────────────────────────────────────────

    private _gm: GameManager | null = null;
    private _bowl: BowlController | null = null;
    private _spawner: BowlSpawner | null = null;
    private _slots: SlotBar | null = null;
    private _orders: OrderSystem | null = null;

    private _winNode: Node | null = null;
    private _failNode: Node | null = null;

    private _customerStrip: Node | null = null;
    private _customerNodes: Node[] = [];
    private _customerHomeX: number[] = [];
    private _customerCellW: number = 130;
    private _customerCellH: number = 110;
    private _customerSerial: number = 0;

    private _shuffleBtn: Node | null = null;
    private _shuffleLabel: Label | null = null;
    private _shuffleRemaining: number = 0;

    /** 优先用 Inspector 配置；未挂组件则 fallback 到代码 LEVEL_1。 */
    private get _level(): LevelData {
        return this.levelConfig ? this.levelConfig.toLevelData() : LEVEL_1;
    }

    onLoad() {
        this._buildBackground();
        this._gm = this.node.addComponent(GameManager);

        this._buildTopCustomerStrip();
        this._buildChefAndOrders();
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
    }

    private _addUI(parent: Node, name: string, w: number, h: number, y: number): Node {
        const n = new Node(name);
        n.layer = this.node.layer;
        parent.addChild(n);
        const ui = n.addComponent(UITransform);
        ui.setContentSize(w, h);
        n.setPosition(0, y, 0);
        return n;
    }

    private _fillRect(n: Node, color: Color, stroke?: Color, lineWidth?: number) {
        const ui = n.getComponent(UITransform)!;
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        if (stroke) {
            g.strokeColor = stroke;
            g.lineWidth = lineWidth ?? 2;
        }
        g.rect(-ui.width * 0.5, -ui.height * 0.5, ui.width, ui.height);
        g.fill();
        if (stroke) g.stroke();
    }

    private _applySpriteOrRect(n: Node, sf: SpriteFrame | null, fallback: Color, stroke?: Color, lineWidth?: number, sliced = false) {
        if (sf) {
            const ui = n.getComponent(UITransform)!;
            const w = ui.width, h = ui.height;
            const sp = n.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
            sp.spriteFrame = sf;
            ui.setContentSize(w, h);
        } else {
            this._fillRect(n, fallback, stroke, lineWidth);
        }
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
        this._applySpriteOrRect(bg, this.bgSprite, new Color(244, 232, 198, 255));
    }

    private _buildTopCustomerStrip() {
        const stripY = DESIGN_H * 0.5 - 100;
        const strip = this._addUI(this.node, 'customers', DESIGN_W - 40, 150, stripY);
        this._applySpriteOrRect(strip, this.customerStripSprite,
            new Color(250, 220, 170, 255), new Color(160, 100, 50, 255), 3, true);
        this._customerStrip = strip;

        const cw = this._customerCellW;
        const gap = 18;
        const totalW = ORDER_COUNT * cw + (ORDER_COUNT - 1) * gap;
        const startX = -totalW * 0.5 + cw * 0.5;
        for (let i = 0; i < ORDER_COUNT; i++) {
            const x = startX + i * (cw + gap);
            this._customerHomeX.push(x);
            const c = this._spawnCustomerNode(i);
            this._customerNodes.push(c);
        }
    }

    private _spawnCustomerNode(idx: number): Node {
        this._customerSerial++;
        const c = this._addUI(this._customerStrip!, 'cust-' + idx + '-' + this._customerSerial,
            this._customerCellW, this._customerCellH, 0);
        c.setPosition(this._customerHomeX[idx], 0, 0);
        this._applySpriteOrRect(c, this.customerCellSprite,
            new Color(255, 240, 210, 255), new Color(180, 130, 50, 255), 2, true);

        if (this.customerSprites.length > 0) {
            const pick = this.customerSprites[Math.floor(Math.random() * this.customerSprites.length)];
            if (pick) {
                const portrait = new Node('portrait');
                portrait.layer = c.layer;
                c.addChild(portrait);
                const ui = portrait.addComponent(UITransform);
                ui.setContentSize(this._customerCellW - 20, this._customerCellH - 20);
                const sp = portrait.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.type = Sprite.Type.SIMPLE;
                sp.spriteFrame = pick;
                ui.setContentSize(this._customerCellW - 20, this._customerCellH - 20);
            }
        } else {
            this._label(c, '顾客', 26, new Color(120, 70, 30, 255), 0, 20);
            this._label(c, '#' + this._customerSerial, 36, new Color(180, 60, 30, 255), 0, -22);
        }
        return c;
    }

    private _replaceCustomer(idx: number) {
        const old = this._customerNodes[idx];
        if (!old) return;

        const opacity = old.getComponent(UIOpacity) ?? old.addComponent(UIOpacity);
        Tween.stopAllByTarget(old);
        tween(old)
            .to(0.32, { position: new Vec3(this._customerHomeX[idx], 180, 0) }, { easing: 'cubicIn' })
            .start();
        tween(opacity)
            .to(0.32, { opacity: 0 })
            .call(() => old.destroy())
            .start();

        this.scheduleOnce(() => {
            const next = this._spawnCustomerNode(idx);
            next.setPosition(this._customerHomeX[idx], 180, 0);
            const op = next.addComponent(UIOpacity);
            op.opacity = 0;
            tween(next)
                .to(0.32, { position: new Vec3(this._customerHomeX[idx], 0, 0) }, { easing: 'backOut' })
                .start();
            tween(op)
                .to(0.28, { opacity: 255 })
                .start();
            this._customerNodes[idx] = next;
        }, 0.18);
    }

    private _buildChefAndOrders() {
        const areaY = DESIGN_H * 0.5 - 290;

        const chef = this._addUI(this.node, 'chef', 150, 170, 0);
        chef.setPosition(-DESIGN_W * 0.5 + 100, areaY, 0);
        this._applySpriteOrRect(chef, this.chefBgSprite,
            new Color(255, 250, 220, 255), new Color(120, 80, 40, 255), 3, true);

        if (this.chefPrefab) {
            const inst = instantiate(this.chefPrefab);
            inst.layer = chef.layer;
            chef.addChild(inst);
        } else if (this.chefSprite) {
            const portrait = new Node('chef-portrait');
            portrait.layer = chef.layer;
            chef.addChild(portrait);
            const ui = portrait.addComponent(UITransform);
            ui.setContentSize(130, 150);
            const sp = portrait.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = this.chefSprite;
            ui.setContentSize(130, 150);
        } else {
            this._label(chef, '🦆', 56, new Color(220, 180, 40, 255), 0, 20);
            this._label(chef, '鸭厨师', 24, new Color(120, 70, 30, 255), 0, -42);
        }

        const orderHost = this._addUI(this.node, 'orders', DESIGN_W - 220, 120, areaY);
        orderHost.setPosition(70, areaY, 0);
        this._orders = orderHost.addComponent(OrderSystem);
        this._orders.applyCellSprite(this.orderCellSprite);
    }

    private _buildShuffleButton() {
        const y = DESIGN_H * 0.5 - 600;
        const btn = this._addUI(this.node, 'shuffle', 200, 90, y);
        btn.setPosition(DESIGN_W * 0.5 - 130, y, 0);

        if (this.shuffleBtnSprite) {
            const btnUi = btn.getComponent(UITransform)!;
            const sp = btn.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SLICED;
            sp.spriteFrame = this.shuffleBtnSprite;
            btnUi.setContentSize(200, 90);
        } else {
            const g = btn.addComponent(Graphics);
            g.fillColor = new Color(110, 170, 220, 255);
            g.strokeColor = new Color(50, 90, 140, 255);
            g.lineWidth = 4;
            g.roundRect(-100, -45, 200, 90, 22);
            g.fill();
            g.stroke();
        }

        if (this.shuffleIconSprite) {
            const icon = new Node('icon');
            icon.layer = btn.layer;
            btn.addChild(icon);
            icon.setPosition(-50, 0, 0);
            const ui = icon.addComponent(UITransform);
            ui.setContentSize(56, 56);
            const sp = icon.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = this.shuffleIconSprite;
            ui.setContentSize(56, 56);
        } else {
            this._label(btn, '🔀', 38, new Color(255, 255, 255, 255), -50, 0);
        }
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
        const y = DESIGN_H * 0.5 - 460;
        const host = this._addUI(this.node, 'slot-bar', DESIGN_W - 40, 130, y);
        this._slots = host.addComponent(SlotBar);
        this._slots.applyCellSprite(this.slotCellSprite);
    }

    private _buildBowlAndSpawner() {
        const levelData = this._level;
        const radius = levelData.bowlRadius;
        const host = this._addUI(this.node, 'bowl', radius * 2 + 30, radius * 2 + 30, -DESIGN_H * 0.5 + radius + 220);
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
        if (this.winOverlaySprite) {
            const winUi = win.getComponent(UITransform)!;
            const sp = win.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = this.winOverlaySprite;
            winUi.setContentSize(DESIGN_W, DESIGN_H);
        } else {
            this._fillRect(win, new Color(255, 220, 80, 240));
            this._label(win, 'Level Clear!', 96, new Color(180, 60, 20, 255), 0, 80);
            this._label(win, '🍱 关卡完成', 56, new Color(120, 50, 20, 255), 0, -40);
        }
        win.active = false;
        this._winNode = win;

        const fail = this._addUI(this.node, 'fail', DESIGN_W, DESIGN_H, 0);
        if (this.failOverlaySprite) {
            const failUi = fail.getComponent(UITransform)!;
            const sp = fail.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = this.failOverlaySprite;
            failUi.setContentSize(DESIGN_W, DESIGN_H);
        } else {
            this._fillRect(fail, new Color(80, 80, 90, 230));
            this._label(fail, '槽位已满', 80, new Color(255, 240, 240, 255), 0, 80);
            this._label(fail, '关卡失败', 48, new Color(255, 220, 220, 255), 0, -40);
        }
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
            this._replaceCustomer(idx);
        }, this);

        orders.node.on(OrderEvent.NeedScanSlot, (type: DishType) => {
            const n = slots.drainType(type);
            if (n > 0) {
                const r = orders.contributeFromSlot(type, n);
                if (!r.fulfilled) {
                    // partially filled — keep what was added; nothing else to do here
                }
            }
        }, this);

        orders.node.on(OrderEvent.AllCompleted, () => {
            this._win();
        }, this);
    }

    private _handleDishTap(dish: DishItem) {
        const type = dish.dishType;
        const slots = this._slots!;
        const orders = this._orders!;
        const bowl = this._bowl!;

        if (orders.isNeeded(type)) {
            const idx = orders.currentTypes().indexOf(type);
            const target = orders.getCellWorldPos(idx);
            dish.flyToSlot(target, () => {
                dish.poofAndDestroy();
                orders.contributeFromSlot(type, 1);
                bowl.checkLow();
                this._checkWin();
            });
        } else {
            const target = slots.getDropTarget(type);
            if (!target) return;
            dish.flyToSlot(target.worldPos, () => {
                dish.poofAndDestroy();
                slots.accept(type);
                bowl.checkLow();
                this._checkWin();
            });
        }
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
