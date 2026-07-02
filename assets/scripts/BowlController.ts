import {
    _decorator, Component, Node, UITransform, Graphics, Color, Vec3,
    PhysicsSystem2D, instantiate, Prefab, Sprite, SpriteFrame, UIOpacity, tween,
} from 'cc';
import { DishItem, DishEvent } from './DishItem';
import { DishProfile } from './ArtTypes';
import { LevelData } from './LevelConfig';

const { ccclass, property } = _decorator;

export const BowlEvent = {
    DishTapped: 'bowl-dish-tapped',
} as const;

@ccclass('BowlController')
export class BowlController extends Component {

    @property
    radius: number = 320;

    /** 由 applyLevelConfig 下发 */
    surfaceMinCount: number = 6;

    @property({ tooltip: '每帧分离迭代次数。2~4 之间。越大越快稳定但更耗 CPU。' })
    resolveIterations: number = 3;

    @property({ tooltip: '单次迭代单颗食材最大位移上限（像素）。防止连锁推挤导致乱飞。' })
    maxPushPerIter: number = 14;

    @property({ tooltip: '允许的轻微重叠（像素），让食材看起来更"挤"。' })
    overlapTolerance: number = 2;

    private _dishLayer: Node | null = null;
    private _bubbleLayer: Node | null = null;
    /** 汤水中间带节点，位于 dishLayer 内部，用于放置汤面序列帧动画 */
    private _soupLayer: Node | null = null;
    private _soupLayerCutoff: number = 2;
    private _edgeInset: number = 4;
    private _centerGravity: number = 0;
    private _stackHeightFactor: number = 0;
    private _crossLayerSkipThreshold: number = 999; // 999 = 不跳过（默认行为）

    // ── 关卡级 ambient 参数（由 applyLevelConfig 下发到每颗 dish）──
    private _idleAmp: number = 0;
    private _idleFreq: number = 0;
    private _springStiff: number = 0.18;
    private _springDamp: number = 0.82;

    // ── 常驻气泡定时器 ──
    private _ambientBubbleInterval: number = 1.5;
    private _ambientBubbleTimer: number = 0;

    get dishLayer(): Node { return this._dishLayer!; }
    get bowlRadius(): number { return this.radius; }
    /** 汤水中间带节点（位于第二层与第三层食材之间）。调用方可往此节点挂 Sprite/Animation */
    get soupLayer(): Node { return this._soupLayer!; }

    onLoad() {
        // 自定义占位分离方案，关闭 Box2D
        PhysicsSystem2D.instance.enable = false;

        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(this.radius * 2 + 20, this.radius * 2 + 20);

        this._drawBowlVisual();
        this._buildBubbleLayer();
        this._buildDishLayer();
    }

    private _drawBowlVisual() {
        // 占位空节点，等 applyBowlSkin 灌入汤水/碗体
        // 顺序：water 先建（最底层渲染），bg 后建（盖在 water 之上，碗壁挡住水边）
        const water = new Node('bowl-water');
        water.layer = this.node.layer;
        this.node.addChild(water);
        water.addComponent(UITransform);

        const bgNode = new Node('bowl-bg');
        bgNode.layer = this.node.layer;
        this.node.addChild(bgNode);
        bgNode.addComponent(UITransform);
    }

    private _buildBubbleLayer() {
        const layer = new Node('bubbles');
        layer.layer = this.node.layer;
        this.node.addChild(layer);
        layer.addComponent(UITransform);
        this._bubbleLayer = layer;
    }

    private _buildDishLayer() {
        const layer = new Node('dishes');
        layer.layer = this.node.layer;
        this.node.addChild(layer);
        layer.addComponent(UITransform);
        this._dishLayer = layer;

        // 汤水中间带：作为 dishLayer 子节点，参与 _sortByY 的带状排序
        const soup = new Node('soup-surface');
        soup.layer = layer.layer;
        layer.addChild(soup);
        soup.addComponent(UITransform);
        this._soupLayer = soup;
    }

    /** 把汤面 Prefab 实例化进汤水中间带（含 Sprite + Animation 序列帧组件） */
    applySoupSurface(prefab: Prefab | null) {
        if (!prefab || !this._soupLayer) return;
        this._soupLayer.removeAllChildren();
        const inst = instantiate(prefab);
        inst.layer = this._soupLayer.layer;
        this._soupLayer.addChild(inst);
    }

    /**
     * 在锅内生成一颗食材并返回。caller 通常紧接着 dish.floatUpFromCenter(target)。
     * 注意 localPos 仅用作"目标稳定位置"；上浮动画会从锅心起跑覆盖它。
     */
    spawnDish(prefabOrNull: Prefab | null, profile: DishProfile, localPos: Vec3): DishItem {
        const node = prefabOrNull ? instantiate(prefabOrNull) : new Node('dish');
        node.layer = this._dishLayer!.layer;
        this._dishLayer!.addChild(node);
        node.setPosition(localPos);
        const dish = node.getComponent(DishItem) ?? node.addComponent(DishItem);
        dish.init(profile);
        dish.applyAmbient(this._idleAmp, this._idleFreq, this._springStiff, this._springDamp, this._stackHeightFactor);
        node.on(DishEvent.Tapped, (d: DishItem) => {
            this.node.emit(BowlEvent.DishTapped, d);
        }, this);
        return dish;
    }

    applyBowlSkin(bowlSF: SpriteFrame | null, waterSF: SpriteFrame | null, waterPrefab: Prefab | null) {
        const bg = this.node.getChildByName('bowl-bg');
        if (bg && bowlSF) {
            const gfx = bg.getComponent(Graphics);
            if (gfx) gfx.destroy();
            const ui = bg.getComponent(UITransform) ?? bg.addComponent(UITransform);
            const sp = bg.getComponent(Sprite) ?? bg.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = bowlSF;
            ui.setContentSize((this.radius + 8) * 2, (this.radius + 8) * 2);
        }

        const water = this.node.getChildByName('bowl-water');
        if (!water) return;

        if (waterPrefab) {
            const gfx = water.getComponent(Graphics);
            if (gfx) gfx.destroy();
            water.removeAllChildren();
            const ui = water.getComponent(UITransform) ?? water.addComponent(UITransform);
            ui.setContentSize(this.radius * 2, this.radius * 2);
            // 直接实例化，保留 prefab 自身的尺寸（要改大小直接改 prefab）
            const inst = instantiate(waterPrefab);
            inst.layer = water.layer;
            water.addChild(inst);
        } else if (waterSF) {
            const gfx = water.getComponent(Graphics);
            if (gfx) gfx.destroy();
            const ui = water.getComponent(UITransform) ?? water.addComponent(UITransform);
            const sp = water.getComponent(Sprite) ?? water.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = waterSF;
            ui.setContentSize(this.radius * 2, this.radius * 2);
        }
    }

    applyLevelConfig(level: LevelData) {
        this.resolveIterations = level.resolveIterations;
        this.maxPushPerIter    = level.maxPushPerIter;
        this.overlapTolerance  = level.overlapTolerance;
        this._edgeInset        = level.bowlEdgeInset;
        this._centerGravity    = level.centerGravity;
        this._stackHeightFactor = level.stackHeightFactor;
        this._crossLayerSkipThreshold = level.crossLayerSkipThreshold;
        this._soupLayerCutoff   = level.soupLayerCutoff;
        this.surfaceMinCount    = level.surfaceMinCount;
        this._idleAmp          = level.idleBobAmplitude;
        this._idleFreq         = level.idleBobFrequency;
        this._springStiff      = level.springStiffness;
        this._springDamp       = level.springDamping;
        this._ambientBubbleInterval = level.ambientBubbleInterval;
    }

    // ─────────────── 自定义占位分离 ───────────────

    lateUpdate(dt: number) {
        // 常驻气泡：与食材数无关，独立计时
        if (this._ambientBubbleInterval > 0) {
            this._ambientBubbleTimer += dt;
            if (this._ambientBubbleTimer >= this._ambientBubbleInterval) {
                this._ambientBubbleTimer = 0;
                this.spawnBubbles(1);
            }
        }

        const dishes = this.getAllDishes();
        const N = dishes.length;
        if (N === 0) return;

        const iters = this.resolveIterations;
        const maxPush = this.maxPushPerIter;
        const tol = this.overlapTolerance;
        const edgeR = this.radius - this._edgeInset;
        const zSkip = this._crossLayerSkipThreshold;

        // 拉出位置到本地数组，减少多次访问开销
        const xs = new Array<number>(N);
        const ys = new Array<number>(N);
        for (let i = 0; i < N; i++) {
            xs[i] = dishes[i].posX;
            ys[i] = dishes[i].posY;
        }

        for (let iter = 0; iter < iters; iter++) {
            for (let i = 0; i < N; i++) {
                const a = dishes[i];
                if (a.isConsumed) continue;
                const aFloat = a.isFloating;
                const ra = a.collRadius;
                const xi = xs[i], yi = ys[i];

                for (let j = i + 1; j < N; j++) {
                    const b = dishes[j];
                    if (b.isConsumed) continue;
                    const bFloat = b.isFloating;
                    // 两个都在上浮：不参与互相分离（都在 tween 控制下，下一帧自然分开）
                    if (aFloat && bFloat) continue;

                    // 跨层跳过：当两颗食材 displayZOffset 差值 ≥ 阈值，
                    // 不再相互推开，允许小食材"压"在大食材正上方完全遮挡
                    const dz = a.displayZOffset - b.displayZOffset;
                    if (dz >= zSkip || -dz >= zSkip) continue;

                    const dx = xs[j] - xi;
                    const dy = ys[j] - yi;
                    const dist2 = dx * dx + dy * dy;
                    const rsum = ra + b.collRadius - tol;
                    if (rsum <= 0) continue;
                    if (dist2 >= rsum * rsum) continue;

                    let dist: number, nx: number, ny: number;
                    if (dist2 < 0.01) {
                        // 完全重叠 → 随机方向推开
                        const a0 = Math.random() * Math.PI * 2;
                        nx = Math.cos(a0); ny = Math.sin(a0);
                        dist = 0.1;
                    } else {
                        dist = Math.sqrt(dist2);
                        nx = dx / dist;
                        ny = dy / dist;
                    }

                    const overlap = Math.min(rsum - dist, maxPush);
                    let pushI = 0, pushJ = 0;
                    if (aFloat) {
                        // 上浮颗只挤别人不被挤
                        pushJ = overlap;
                    } else if (bFloat) {
                        pushI = overlap;
                    } else {
                        const wsum = a.weight + b.weight;
                        pushI = overlap * b.weight / wsum;
                        pushJ = overlap * a.weight / wsum;
                    }

                    xs[i] -= nx * pushI;
                    ys[i] -= ny * pushI;
                    xs[j] += nx * pushJ;
                    ys[j] += ny * pushJ;
                }
            }

            // 每次迭代都做边界推回，避免连续推挤把食材送出锅外
            for (let i = 0; i < N; i++) {
                const a = dishes[i];
                if (a.isConsumed || a.isFloating) continue;
                const limit = edgeR - a.collRadius;
                if (limit <= 0) continue;
                const r2 = xs[i] * xs[i] + ys[i] * ys[i];
                if (r2 > limit * limit) {
                    const r = Math.sqrt(r2);
                    const k = limit / r;
                    xs[i] *= k;
                    ys[i] *= k;
                }
            }
        }

        // 中心引力：平滑梯度版本。
        // 拉力随距离线性渐变：中心 = 0，碗边缘 = 满 g。
        // 避免之前 dead zone 硬边界导致内圈食材在边界附近来回越线产生持续抖动。
        if (this._centerGravity > 0) {
            const g = this._centerGravity;
            const invBowlR = 1 / this.radius;
            for (let i = 0; i < N; i++) {
                const a = dishes[i];
                if (a.isConsumed || a.isFloating) continue;
                const r2 = xs[i] * xs[i] + ys[i] * ys[i];
                if (r2 < 25) continue;                  // 已经在中心 5px 内不动
                const r = Math.sqrt(r2);
                const pullFactor = g * (r * invBowlR);  // 0 at center → g at edge
                xs[i] *= (1 - pullFactor);
                ys[i] *= (1 - pullFactor);
            }
        }

        // 应用位置：仅当本帧位置较开始有显著变化才 setPos，避免每帧无谓激活 spring 导致整锅抽搐
        for (let i = 0; i < N; i++) {
            const a = dishes[i];
            if (a.isConsumed || a.isFloating) continue;
            const dx = xs[i] - a.posX;
            const dy = ys[i] - a.posY;
            if (dx * dx + dy * dy < 0.04) continue;   // 位移 < 0.2px 不写
            a.setPos(xs[i], ys[i]);
        }

        // Y 排序：低 Y → 高 siblingIndex（前层）。仅对 DishItem 节点排序，跳过气泡。
        this._sortByY();
    }

    private _sortByY() {
        if (!this._dishLayer) return;
        // 带状排序：把所有子节点分成「汤下／汤面／汤上」三个不重叠的 sortKey 区段。
        //   - 汤下带：displayZOffset < cutoff 的食材，sortKey = yFactor + zOff*60，范围约 [-400, +400]
        //   - 汤面带：soupLayer 节点，sortKey = SOUP_BAND（恒定 100000）
        //   - 汤上带：displayZOffset >= cutoff 的食材，sortKey = 2*SOUP_BAND + yFactor + zOff*60
        // 通过 100000 的大间隔确保任何 yFactor + zOff*60 都不会越界进错带。
        const SOUP_BAND = 100000;
        const cutoff = this._soupLayerCutoff;
        const soupNode = this._soupLayer;
        const list: { n: Node; sortKey: number }[] = [];
        for (const c of this._dishLayer.children) {
            if (c === soupNode) {
                list.push({ n: c, sortKey: SOUP_BAND });
                continue;
            }
            const dish = c.getComponent(DishItem);
            if (!dish) continue;
            // 用 dish.posY（Active 时返回稳态 _baseY，Floating 时返回 tween 位置）
            // 避免 idle bob 的正弦波让相邻食材的相对 y 反复交叉，产生高频遮挡闪烁
            const yFactor = -dish.posY;
            const inner = yFactor + dish.displayZOffset * 60;
            let sortKey: number;
            if (dish.isConsumed) {
                // 被点击起飞的食材：飞行途中排到锅内所有食材之上，不被遮挡
                sortKey = SOUP_BAND * 4 + inner;
            } else if (dish.displayZOffset >= cutoff || dish.forceSurface) {
                // 天然浮层食材 或 被 raiseToSurface 顶上来的下层食材，都归汤上带
                sortKey = SOUP_BAND * 2 + inner;
            } else {
                sortKey = inner;
            }
            list.push({ n: c, sortKey });
        }
        list.sort((a, b) => a.sortKey - b.sortKey);
        for (let i = 0; i < list.length; i++) {
            list[i].n.setSiblingIndex(i);
        }
    }

    getAllDishes(): DishItem[] {
        if (!this._dishLayer) return [];
        const out: DishItem[] = [];
        for (const c of this._dishLayer.children) {
            const d = c.getComponent(DishItem);
            if (d && !d.isConsumed) out.push(d);
        }
        return out;
    }

    aliveCount(): number {
        return this.getAllDishes().length;
    }

    shuffle() {
        const dishes = this.getAllDishes();
        if (dishes.length === 0) return;
        const r = this.radius * 0.78;
        const positions = this._scatter(dishes.length, r);
        for (let i = 0; i < dishes.length; i++) {
            const p = positions[i];
            dishes[i].floatUpFromCenter(new Vec3(p.x, p.y, 0), i * 0.04);
        }
        this.spawnBubbles(Math.min(8, dishes.length));
    }

    private _scatter(count: number, maxR: number): { x: number; y: number }[] {
        const out: { x: number; y: number }[] = [];
        const minDist = Math.max(28, maxR / Math.sqrt(count) * 0.85);
        const maxTries = 60;
        for (let i = 0; i < count; i++) {
            let placed = false;
            for (let t = 0; t < maxTries && !placed; t++) {
                const a = Math.random() * Math.PI * 2;
                const d = Math.sqrt(Math.random()) * maxR;
                const x = Math.cos(a) * d;
                const y = Math.sin(a) * d;
                let ok = true;
                for (const p of out) {
                    if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < minDist * minDist) { ok = false; break; }
                }
                if (ok) { out.push({ x, y }); placed = true; }
            }
            if (!placed) {
                const a = Math.random() * Math.PI * 2;
                out.push({ x: Math.cos(a) * maxR * 0.9, y: Math.sin(a) * maxR * 0.9 });
            }
        }
        return out;
    }

    /** 在锅心附近撒一波小气泡占位特效（短暂上浮 + 渐隐）。 */
    spawnBubbles(count: number = 4) {
        if (!this._bubbleLayer) return;
        for (let i = 0; i < count; i++) {
            const b = new Node('bubble');
            b.layer = this._bubbleLayer.layer;
            this._bubbleLayer.addChild(b);
            const r = 5 + Math.random() * 6;
            const ui = b.addComponent(UITransform);
            ui.setContentSize(r * 2, r * 2);
            const g = b.addComponent(Graphics);
            g.fillColor = new Color(255, 255, 255, 200);
            g.circle(0, 0, r);
            g.fill();
            const sx = (Math.random() - 0.5) * 36;
            b.setPosition(sx, -10, 0);
            const op = b.addComponent(UIOpacity);
            op.opacity = 220;
            const dy = 26 + Math.random() * 60;
            const dx = sx + (Math.random() - 0.5) * 50;
            const delay = Math.random() * 0.15;
            tween(b)
                .delay(delay)
                .to(0.55 + Math.random() * 0.25, { position: new Vec3(dx, dy, 0) }, { easing: 'sineOut' })
                .call(() => b.destroy())
                .start();
            tween(op)
                .delay(delay)
                .to(0.55, { opacity: 0 })
                .start();
        }
    }

    /**
     * 检查"顶层"（displayZOffset ≥ 0 或已 forceSurface 的可见食材）数是否低于 surfaceMinCount。
     * 不足时从"次下层"往上补：把 displayZOffset < 0 的食材按 zOff 从大到小（-1 → -3 → -5 依次）
     * 挑最靠近顶层的先浮上，浮上一颗算一颗，直到达到 surfaceMinCount 或下层耗尽。
     * 每颗调 raiseToSurface() → 归汤上带 + fade in。
     */
    checkLow() {
        if (!this._dishLayer) return;
        const surface: DishItem[] = [];
        const submerged: DishItem[] = [];
        for (const c of this._dishLayer.children) {
            const d = c.getComponent(DishItem);
            if (!d || d.isConsumed) continue;
            // 顶层：displayZOffset 为 0 或正（本来就浮在汤面附近）+ 之前已被顶上来的
            if (d.forceSurface || d.displayZOffset >= 0) surface.push(d);
            else submerged.push(d);
        }
        const deficit = this.surfaceMinCount - surface.length;
        if (deficit <= 0 || submerged.length === 0) return;
        // 依次从次下层往上补：zOff 越接近 0（负值越大）越优先浮上
        submerged.sort((a, b) => b.displayZOffset - a.displayZOffset);
        const lift = Math.min(deficit, submerged.length);
        for (let i = 0; i < lift; i++) submerged[i].raiseToSurface();
    }
}
