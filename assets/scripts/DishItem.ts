import {
    _decorator, Component, Node, UITransform, Graphics, Color, Vec3, EventTouch,
    Tween, tween, UIOpacity, Sprite, SpriteFrame,
} from 'cc';
import { DishType, DISH_META } from './LevelConfig';
import { DishProfile } from './ArtTypes';

const { ccclass } = _decorator;

export const DishEvent = {
    Tapped: 'dish-tapped',
} as const;

export enum DishPhysicsState {
    /** 上浮动画中。位置由 tween 控制，可挤开他人，但不被他人挤压。 */
    Floating = 0,
    /** 已落位。参与占位分离，可被挤可挤人。 */
    Active = 1,
    /** 飞向暂存槽/订单格 → poof 中。退出分离系统。 */
    Consumed = 2,
}

@ccclass('DishItem')
export class DishItem extends Component {

    private _type: DishType = DishType.卷心菜;
    private _visualR: number = 40;
    private _collR: number = 40;
    private _weight: number = 2;
    private _elasticity: number = 0.2;
    private _damping: number = 0.5;
    private _rotationRange: number = 12;
    private _upSpeed: number = 0.5;
    private _upDrift: number = 14;
    private _state: DishPhysicsState = DishPhysicsState.Active;
    private _consumed: boolean = false;

    // 视觉子节点，承担 Sprite 渲染；外层 node 只做位置/旋转
    private _visualNode: Node | null = null;

    // 新手引导描边高亮层（挂在 this.node 下，视觉之后；圆环 + 呼吸 tween）
    private _tutorialGlow: Node | null = null;

    // ── Idle 微动 ──
    private _idleAmp: number = 0;
    private _idleFreq: number = 0;
    private _idlePhase: number = 0;     // 每颗食材独立随机相位
    private _idleTime: number = 0;
    private _baseY: number = 0;          // 稳定位置基准 Y（idle 在此基础上叠加偏移）
    private _baseX: number = 0;

    // ── 弹簧回稳（位置）──
    private _springVx: number = 0;
    private _springVy: number = 0;
    private _springTargetX: number = 0;
    private _springTargetY: number = 0;
    private _springStiff: number = 0.18;
    private _springDamp: number = 0.82;
    private _useSpring: boolean = false;

    // ── 显示 Z 偏移（用于 BowlController._sortByY 二次排序）──
    private _displayZOffset: number = 0;
    get displayZOffset(): number { return this._displayZOffset; }

    // 强制浮到汤面之上（下层食材因上层减少被顶上来的机制）。为 true 时 _sortByY 归汤上带
    private _forceSurface: boolean = false;
    get forceSurface(): boolean { return this._forceSurface; }

    // 稳态朝向（0~360°），每颗食材落位后保持这个角度，让锅里方向感更随机
    private _baseRotation: number = 0;

    // ── 视觉堆叠：把 _displayZOffset 乘以这个数得到 Y 方向像素偏移，让大食材沉底、小食材压顶
    private _stackHeightFactor: number = 0;
    /** 当前食材最终 Y 偏移（已含正负号）。floatUpFromCenter 拿来调整目标 Y */
    private get _stackY(): number { return -this._displayZOffset * this._stackHeightFactor; }

    get dishType(): DishType { return this._type; }
    /** 显示半径。决定 UITransform 命中范围与图像尺寸。 */
    get radius(): number { return this._visualR; }
    /** 占位分离用的碰撞半径（可能 ≠ 显示半径）。 */
    get collRadius(): number { return this._collR; }
    /**
     * 视觉子节点的实际 UITransform 尺寸（保留了原图长宽比）。
     * 供外部计算"缩放多少才能装入 cell"用。
     */
    get visualSize(): { width: number; height: number } {
        if (this._visualNode) {
            const vui = this._visualNode.getComponent(UITransform);
            if (vui) return { width: vui.width, height: vui.height };
        }
        return { width: this._visualR * 2, height: this._visualR * 2 };
    }
    get weight(): number { return this._weight; }
    get isConsumed(): boolean { return this._consumed; }
    get isFloating(): boolean { return this._state === DishPhysicsState.Floating; }
    get isActive(): boolean { return this._state === DishPhysicsState.Active; }
    /**
     * Active 状态返回 _baseX/_baseY（稳定位置，不含 idle 微动偏移），让 resolver 不被呼吸式的视觉抖动反复触发推挤。
     * Floating 状态由 tween 控制 node.position，没有 base 可用，所以返回真实 node.position。
     */
    get posX(): number {
        return this._state === DishPhysicsState.Floating ? this.node.position.x : this._baseX;
    }
    get posY(): number {
        return this._state === DishPhysicsState.Floating ? this.node.position.y : this._baseY;
    }

    init(profile: DishProfile) {
        this._type = profile.type;
        this._visualR = profile.visualR;
        this._collR = profile.collR;
        this._weight = profile.weight;
        this._elasticity = profile.elasticity;
        this._damping = profile.damping;
        this._rotationRange = profile.rotationRange;
        this._upSpeed = profile.upSpeed;
        this._upDrift = profile.upDrift;
        this._displayZOffset    = profile.displayZOffset;
        this._idlePhase         = Math.random() * Math.PI * 2;
        this._baseRotation      = Math.random() * 360;
        // 兜底：用 spawnDish 设置的初始位置作为 _baseX/Y，防止任何不走 floatUpFromCenter 的代码路径让 posX/Y 错误返回 (0,0)
        this._baseX             = this.node.position.x;
        this._baseY             = this.node.position.y;

        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(this._visualR * 2, this._visualR * 2);

        const meta = DISH_META[this._type];
        this._buildVisual(meta.color, profile.sprite);

        // 命中范围与视觉图对齐（长条食材按较长边算，避免图两端点击无反应）
        if (this._visualNode) {
            const vui = this._visualNode.getComponent(UITransform);
            if (vui) ui.setContentSize(vui.width, vui.height);
        }

        this.node.on(Node.EventType.TOUCH_END, this._onTap, this);
    }

    private _buildVisual(color: Color, sf: SpriteFrame | null) {
        const visualNode = new Node('visual');
        visualNode.layer = this.node.layer;
        this.node.addChild(visualNode);
        const vui = visualNode.addComponent(UITransform);
        vui.setContentSize(this._visualR * 2, this._visualR * 2);
        this._visualNode = visualNode;

        if (sf) {
            const sp = visualNode.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = sf;
            // 保持原图长宽比：按较短边匹配到 radius*2，长条图会横向超出碰撞圆，视觉更饱满
            const rect = sf.rect;
            const target = this._visualR * 2;
            const s = target / Math.min(rect.width, rect.height);
            vui.setContentSize(rect.width * s, rect.height * s);
            return;
        }

        // 无 sprite 时退回纯色圆，不再叠加文字标签（避免遮挡 sprite 兜底视觉）
        const gfx = visualNode.addComponent(Graphics);
        gfx.fillColor = color;
        gfx.strokeColor = Color.BLACK;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, this._visualR);
        gfx.fill();
        gfx.stroke();
    }

    /**
     * 从锅心 (0,0) 上浮到目标点。
     * 五段：起始压缩 → 上浮中段（带漂移+旋转）→ 抵达回正 → 切回 Active。
     */
    floatUpFromCenter(targetPos: Vec3, delay: number = 0) {
        this._state = DishPhysicsState.Floating;
        Tween.stopAllByTarget(this.node);

        const opacity = this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
        opacity.opacity = 0;
        Tween.stopAllByTarget(opacity);

        // 起始：锅心，缩到很小，围绕稳态朝向做初始摆动
        this.node.setPosition(0, 0, 0);
        this.node.setScale(0.18, 0.18, 1);
        const startRot = this._baseRotation + (Math.random() - 0.5) * this._rotationRange * 2;
        this.node.eulerAngles = new Vec3(0, 0, startRot);

        // 终点叠加视觉堆叠偏移：负 displayZOffset 把大食材推向高 Y（屏幕远端），正 zOff 把小食材推向低 Y（屏幕近端）
        const finalX = targetPos.x;
        const finalY = targetPos.y + this._stackY;

        // 中段：朝目标方向上浮 60% + 横向漂移
        const driftX = (Math.random() - 0.5) * 2 * this._upDrift;
        const midX = finalX * 0.55 + driftX;
        const midY = finalY * 0.55 + this._visualR * 0.4;
        const midRot = this._baseRotation + (Math.random() - 0.5) * this._rotationRange;

        const dur = this._upSpeed;

        tween(this.node)
            .delay(delay)
            .to(dur * 0.65, {
                position: new Vec3(midX, midY, 0),
                scale: new Vec3(1.08, 1.08, 1),
                eulerAngles: new Vec3(0, 0, midRot),
            }, { easing: 'sineOut' })
            .to(dur * 0.25, {
                position: new Vec3(finalX, finalY, 0),
                scale: new Vec3(1.0, 1.0, 1),
                eulerAngles: new Vec3(0, 0, this._baseRotation),
            }, { easing: 'sineInOut' })
            .call(() => {
                // 上浮结束：写入终点并同步 _baseX/Y，避免下一帧 update 把食材弹回原点 (0,0)
                this.setPosImmediate(finalX, finalY);
                this._state = DishPhysicsState.Active;
            })
            .start();

        tween(opacity)
            .delay(delay)
            .to(dur * 0.45, { opacity: 255 }, { easing: 'sineOut' })
            .start();
    }

    /**
     * 应用关卡级氛围参数（idle 微动 + 弹簧回稳系数）
     * BowlController.spawnDish 创建后立即下发。
     */
    applyAmbient(idleAmp: number, idleFreq: number, springStiff: number, springDamp: number, stackHeightFactor: number) {
        this._idleAmp = idleAmp;
        // 每颗食材频率有 ±30% 随机，避免整锅同步晃动
        this._idleFreq = idleFreq * (0.7 + Math.random() * 0.6);
        this._springStiff = springStiff;
        this._springDamp = springDamp;
        this._stackHeightFactor = stackHeightFactor;
    }

    /**
     * BowlController 占位分离结算后调用：将目标位置交给弹簧缓动到位。
     * 弹簧的"当前位置"就是 _baseX/Y（与 node.position 解耦于 idle 微动）。
     */
    setPos(x: number, y: number) {
        this._springTargetX = x;
        this._springTargetY = y;
        this._useSpring = true;
    }

    /**
     * 强制立即写入位置（首次落位、上浮终点、shuffle 起点等）。
     * 同步重置弹簧状态和 idle 基准点，避免被弹簧"拽回"旧位置。
     */
    setPosImmediate(x: number, y: number) {
        this.node.setPosition(x, y, 0);
        this._springTargetX = x;
        this._springTargetY = y;
        this._springVx = 0;
        this._springVy = 0;
        this._baseX = x;
        this._baseY = y;
        this._useSpring = false;
    }

    /**
     * 帧驱动：先用弹簧把 _baseX/Y 拉向 spring target，再叠加 idle 微动写到 node.position。
     */
    update(dt: number) {
        if (this._consumed || this.isFloating) return;

        if (this._useSpring) {
            const dx = this._springTargetX - this._baseX;
            const dy = this._springTargetY - this._baseY;
            this._springVx = (this._springVx + dx * this._springStiff) * this._springDamp;
            this._springVy = (this._springVy + dy * this._springStiff) * this._springDamp;
            this._baseX += this._springVx;
            this._baseY += this._springVy;
            if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3 &&
                Math.abs(this._springVx) < 0.1 && Math.abs(this._springVy) < 0.1) {
                this._useSpring = false;
                this._baseX = this._springTargetX;
                this._baseY = this._springTargetY;
                this._springVx = 0;
                this._springVy = 0;
            }
        }

        if (this._idleAmp > 0) {
            this._idleTime += dt;
            const omega = this._idleFreq * Math.PI * 2;
            const offsetY = Math.sin(this._idleTime * omega + this._idlePhase) * this._idleAmp;
            const offsetX = Math.cos(this._idleTime * omega + this._idlePhase * 1.3) * this._idleAmp * 0.4;
            this.node.setPosition(this._baseX + offsetX, this._baseY + offsetY, 0);
        } else if (this._useSpring) {
            // 没有 idle 时仍需把弹簧驱动的 base 写出去
            this.node.setPosition(this._baseX, this._baseY, 0);
        }
    }

    /**
     * 让这颗食材"浮出汤面"：
     *  1. 标记 forceSurface（_sortByY 里归汤上带）
     *  2. UIOpacity 从当前值 fade in 到 255
     *  3. 位置从 _baseY 向上顶 riseHeight px 再回落，配合 scale 弹跳
     *     期间进入 Floating 状态 → resolveAll 只让它推别人不被挤 → 路径上的其他食材被自然推开
     */
    raiseToSurface(dur: number = 0.55, riseHeight: number = 55) {
        if (this._forceSurface) return;
        this._forceSurface = true;

        // fade in
        const op = this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        tween(op).to(dur, { opacity: 255 }, { easing: 'sineOut' }).start();

        // 位置动画 + Floating 状态：模拟"从下顶上来"，把路径上其他食材推开
        const startX = this._baseX;
        const startY = this._baseY;
        const peakY  = startY + riseHeight;
        this._state = DishPhysicsState.Floating;
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(dur * 0.55, {
                position: new Vec3(startX, peakY, 0),
                scale:    new Vec3(1.15, 1.15, 1),
            }, { easing: 'sineOut' })
            .to(dur * 0.45, {
                position: new Vec3(startX, startY, 0),
                scale:    new Vec3(1, 1, 1),
            }, { easing: 'sineIn' })
            .call(() => {
                // 恢复 Active，重新参与占位分离；稳态位置回到原 baseX/Y
                this._state = DishPhysicsState.Active;
                this.setPosImmediate(startX, startY);
            })
            .start();
    }

    /**
     * 新手引导用的描边高亮：外层 node 下追加一个圆环 Graphics，做呼吸缩放 + 透明度循环。
     * on = true 时若已存在则不重建；on = false 时销毁并停止 tween。
     */
    setTutorialHighlight(on: boolean) {
        if (on) {
            if (this._tutorialGlow) return;
            const glow = new Node('tutorial-glow');
            glow.layer = this.node.layer;
            this.node.addChild(glow);
            // sibling idx 0 → 排到最底，被 visual 覆盖，但半径大于 visual 所以露出一圈
            glow.setSiblingIndex(0);
            const gui = glow.addComponent(UITransform);
            const vs = this.visualSize;
            const r = Math.max(vs.width, vs.height) * 0.5 + 10;
            gui.setContentSize(r * 2, r * 2);
            const gfx = glow.addComponent(Graphics);
            gfx.lineWidth = 5;
            gfx.strokeColor = new Color(255, 220, 80, 255);
            gfx.fillColor = new Color(255, 220, 80, 55);
            gfx.circle(0, 0, r);
            gfx.fill();
            gfx.stroke();
            const op = glow.addComponent(UIOpacity);
            op.opacity = 255;
            tween(op)
                .to(0.55, { opacity: 150 }, { easing: 'sineInOut' })
                .to(0.55, { opacity: 255 }, { easing: 'sineInOut' })
                .union()
                .repeatForever()
                .start();
            tween(glow)
                .to(0.55, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineInOut' })
                .to(0.55, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever()
                .start();
            this._tutorialGlow = glow;
        } else {
            if (!this._tutorialGlow) return;
            Tween.stopAllByTarget(this._tutorialGlow);
            const op = this._tutorialGlow.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            this._tutorialGlow.destroy();
            this._tutorialGlow = null;
        }
    }

    private _onTap(e: EventTouch) {
        if (this._consumed) return;
        if (this.isFloating) return; // 上浮过程中不响应点击
        e.propagationStopped = true;
        this.node.emit(DishEvent.Tapped, this);
    }

    /**
     * 飞向目标世界坐标。允许多次调用（暂存槽→订单槽的二次飞行需要这个）。
     * finalScale：飞行结束时的最终缩放（默认 1）。飞行末段做 0.9× 过冲后落到 finalScale。
     * 不会自动销毁；要常驻请配合 settleAt。
     */
    flyToSlot(worldPos: Vec3, onArrive: () => void, finalScale: number = 1) {
        this._consumed = true;
        this._state = DishPhysicsState.Consumed;
        this.node.off(Node.EventType.TOUCH_END, this._onTap, this);

        const parent = this.node.parent!;
        const localTarget = parent.getComponent(UITransform)!.convertToNodeSpaceAR(worldPos);
        const startPos = this.node.position.clone();

        // 抛物中点：起点/终点连线中点上方偏移 → 形成上抛弧线
        const dx = localTarget.x - startPos.x;
        const dy = localTarget.y - startPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const arcHeight = Math.max(80, dist * 0.32);
        const midPos = new Vec3(
            (startPos.x + localTarget.x) * 0.5,
            (startPos.y + localTarget.y) * 0.5 + arcHeight,
            0,
        );

        // 中点放大系数：让飞到"高空"时看起来更大更靠近相机，模拟透视
        const midScale = Math.max(1.4, finalScale * 1.8);
        const undershoot = finalScale * 0.9;

        Tween.stopAllByTarget(this.node);
        if (this._visualNode) {
            Tween.stopAllByTarget(this._visualNode);
            // 兜底：任何残留的子节点摆动/缩放 tween 停掉，保证落到订单/暂存槽时视觉是"原始朝上"
            this._visualNode.eulerAngles = new Vec3(0, 0, 0);
            this._visualNode.setScale(1, 1, 1);
        }

        tween(this.node)
            // 起手：拉起 → 稍微膨胀准备起飞
            .to(0.08, { scale: new Vec3(1.2, 1.2, 1) })
            // 上升段：sineIn（起点缓慢加速 → 中点速度最大），旋转 tween 回 0
            .to(0.24, {
                position: midPos,
                scale: new Vec3(midScale, midScale, 1),
                eulerAngles: new Vec3(0, 0, 0),
            }, { easing: 'sineIn' })
            // 下降段：sineOut（中点速度最大 → 终点缓慢减速），与上升段在中点速度连续
            .to(0.24, {
                position: localTarget,
                scale: new Vec3(undershoot, undershoot, 1),
            }, { easing: 'sineOut' })
            // 落定：弹回目标 scale
            .to(0.08, { scale: new Vec3(finalScale, finalScale, 1) })
            .call(() => onArrive())
            .start();
    }

    /**
     * 把当前食材重新挂载到 parent 下，设置 local position 与 sibling index。
     * 用于飞行结束后让食材"落"在目标 cell 里常驻显示。
     * 保持 _consumed = true，update 循环、点击 handler、bowl 物理都不再介入。
     */
    settleAt(parent: Node, localPos: Vec3, siblingIdx?: number) {
        Tween.stopAllByTarget(this.node);
        if (this._visualNode) Tween.stopAllByTarget(this._visualNode);
        this.node.removeFromParent();
        parent.addChild(this.node);
        this.node.setPosition(localPos);
        if (siblingIdx !== undefined) {
            this.node.setSiblingIndex(siblingIdx);
        }
        this._consumed = true;
        this._state = DishPhysicsState.Consumed;
    }

    poofAndDestroy() {
        this._consumed = true;
        this._state = DishPhysicsState.Consumed;
        Tween.stopAllByTarget(this.node);
        if (this._visualNode) Tween.stopAllByTarget(this._visualNode);
        tween(this.node)
            .to(0.18, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(0, 0, 1) }, { easing: 'cubicIn' })
            .call(() => this.node.destroy())
            .start();
    }
}
