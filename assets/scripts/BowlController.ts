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
    LowOnDishes: 'bowl-low',
} as const;

@ccclass('BowlController')
export class BowlController extends Component {

    @property
    radius: number = 320;

    @property
    refillThreshold: number = 20;

    @property({ tooltip: '每帧分离迭代次数。2~4 之间。越大越快稳定但更耗 CPU。' })
    resolveIterations: number = 3;

    @property({ tooltip: '单次迭代单颗食材最大位移上限（像素）。防止连锁推挤导致乱飞。' })
    maxPushPerIter: number = 14;

    @property({ tooltip: '允许的轻微重叠（像素），让食材看起来更"挤"。' })
    overlapTolerance: number = 2;

    private _dishLayer: Node | null = null;
    private _bubbleLayer: Node | null = null;
    private _emittedLowOnce: boolean = false;
    private _edgeInset: number = 4;

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
        const bgNode = new Node('bowl-bg');
        bgNode.layer = this.node.layer;
        this.node.addChild(bgNode);
        bgNode.addComponent(UITransform);
        const g = bgNode.addComponent(Graphics);
        g.fillColor = new Color(220, 220, 230, 255);
        g.strokeColor = new Color(120, 120, 140, 255);
        g.lineWidth = 6;
        g.circle(0, 0, this.radius + 8);
        g.fill();
        g.stroke();

        const water = new Node('bowl-water');
        water.layer = this.node.layer;
        this.node.addChild(water);
        water.addComponent(UITransform);
        const gw = water.addComponent(Graphics);
        gw.fillColor = new Color(232, 240, 220, 220);
        gw.circle(0, 0, this.radius);
        gw.fill();
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
        dish.applyAmbient(this._idleAmp, this._idleFreq, this._springStiff, this._springDamp);
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
        this.refillThreshold   = level.refillThreshold;
        this._edgeInset        = level.bowlEdgeInset;
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

        // 拉出位置到本地数组，减少多次访问开销
        const xs = new Array<number>(N);
        const ys = new Array<number>(N);
        for (let i = 0; i < N; i++) {
            xs[i] = dishes[i].posX;
            ys[i] = dishes[i].posY;
        }

        const bumped = new Array<boolean>(N).fill(false);

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

                    if (pushI > 0.3) bumped[i] = true;
                    if (pushJ > 0.3) bumped[j] = true;
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

        // 应用位置
        for (let i = 0; i < N; i++) {
            const a = dishes[i];
            if (a.isConsumed || a.isFloating) continue;
            a.setPos(xs[i], ys[i]);
        }

        // 反馈：本帧被显著推动的颗触发一次 bump（DishItem 内部带 0.22s 节流）
        for (let i = 0; i < N; i++) {
            if (bumped[i]) dishes[i].bumpFeedback();
        }

        // Y 排序：低 Y → 高 siblingIndex（前层）。仅对 DishItem 节点排序，跳过气泡。
        this._sortByY();
    }

    private _sortByY() {
        if (!this._dishLayer) return;
        // sortKey 越小越靠后渲染（底层），越大越靠前（顶层）
        // 主因素 yFactor：Y 越低（屏幕下方）越靠前
        // 次因素 displayZOffset：负值沉底，正值浮顶；20 为权重，使得 1 单位 zOffset ≈ 20px Y 差
        const list: { n: Node; sortKey: number }[] = [];
        for (const c of this._dishLayer.children) {
            const dish = c.getComponent(DishItem);
            if (!dish) continue;
            const yFactor = -c.position.y;
            const sortKey = yFactor + dish.displayZOffset * 20;
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

    checkLow() {
        const n = this.aliveCount();
        if (n <= this.refillThreshold) {
            if (!this._emittedLowOnce) {
                this._emittedLowOnce = true;
                this.node.emit(BowlEvent.LowOnDishes, n);
            }
        } else {
            this._emittedLowOnce = false;
        }
    }
}
