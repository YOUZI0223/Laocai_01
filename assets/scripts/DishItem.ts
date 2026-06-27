import {
    _decorator, Component, Node, UITransform, Graphics, Color, Vec3, EventTouch,
    Tween, tween, UIOpacity, Label, Sprite, SpriteFrame, director,
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

    private _type: DishType = DishType.Cabbage;
    private _visualR: number = 40;
    private _collR: number = 40;
    private _weight: number = 2;
    private _elasticity: number = 0.2;
    private _damping: number = 0.5;
    private _rotationRange: number = 12;
    private _upSpeed: number = 0.5;
    private _upDrift: number = 14;
    private _hitSquishScale: number    = 0.12;
    private _hitSquishDuration: number = 0.20;
    private _hitSwingAngle: number     = 12;
    private _hitSwingDuration: number  = 0.45;

    private _state: DishPhysicsState = DishPhysicsState.Active;
    private _consumed: boolean = false;

    // 反馈节流：基于 director 总时间（秒），同一颗食材 0.22s 内只播一次 bump
    private _lastBumpAt: number = -1;

    // 视觉子节点，bumpFeedback 作用在这里，避免和位置/上浮 tween 冲突
    private _visualNode: Node | null = null;

    get dishType(): DishType { return this._type; }
    /** 显示半径。决定 UITransform 命中范围与图像尺寸。 */
    get radius(): number { return this._visualR; }
    /** 占位分离用的碰撞半径（可能 ≠ 显示半径）。 */
    get collRadius(): number { return this._collR; }
    get weight(): number { return this._weight; }
    get isConsumed(): boolean { return this._consumed; }
    get isFloating(): boolean { return this._state === DishPhysicsState.Floating; }
    get isActive(): boolean { return this._state === DishPhysicsState.Active; }
    get posX(): number { return this.node.position.x; }
    get posY(): number { return this.node.position.y; }

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
        this._hitSquishScale    = profile.hitSquishScale;
        this._hitSquishDuration = profile.hitSquishDuration;
        this._hitSwingAngle     = profile.hitSwingAngle;
        this._hitSwingDuration  = profile.hitSwingDuration;

        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(this._visualR * 2, this._visualR * 2);

        const meta = DISH_META[this._type];
        this._buildVisual(meta.color, profile.name, profile.sprite);

        this.node.on(Node.EventType.TOUCH_END, this._onTap, this);
    }

    private _buildVisual(color: Color, label: string, sf: SpriteFrame | null) {
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
            vui.setContentSize(this._visualR * 2, this._visualR * 2);
            return;
        }

        const gfx = visualNode.addComponent(Graphics);
        gfx.fillColor = color;
        gfx.strokeColor = Color.BLACK;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, this._visualR);
        gfx.fill();
        gfx.stroke();

        const labelNode = new Node('lbl');
        labelNode.layer = this.node.layer;
        visualNode.addChild(labelNode);
        const lbl = labelNode.addComponent(Label);
        lbl.string = label;
        lbl.fontSize = Math.max(14, Math.floor(this._visualR * 0.42));
        lbl.lineHeight = lbl.fontSize + 2;
        lbl.color = new Color(20, 30, 20, 255);
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

        // 起始：锅心，缩到很小，带初始旋转
        this.node.setPosition(0, 0, 0);
        this.node.setScale(0.18, 0.18, 1);
        const startRot = (Math.random() - 0.5) * this._rotationRange * 2;
        this.node.eulerAngles = new Vec3(0, 0, startRot);

        // 中段：朝目标方向上浮 60% + 横向漂移
        const driftX = (Math.random() - 0.5) * 2 * this._upDrift;
        const midX = targetPos.x * 0.55 + driftX;
        const midY = targetPos.y * 0.55 + this._visualR * 0.4;
        const midRot = (Math.random() - 0.5) * this._rotationRange;

        const dur = this._upSpeed;

        tween(this.node)
            .delay(delay)
            .to(dur * 0.65, {
                position: new Vec3(midX, midY, 0),
                scale: new Vec3(1.08, 1.08, 1),
                eulerAngles: new Vec3(0, 0, midRot),
            }, { easing: 'sineOut' })
            .to(dur * 0.25, {
                position: new Vec3(targetPos.x, targetPos.y, 0),
                scale: new Vec3(1.0, 1.0, 1),
                eulerAngles: new Vec3(0, 0, 0),
            }, { easing: 'sineInOut' })
            .call(() => {
                this._state = DishPhysicsState.Active;
            })
            .start();

        tween(opacity)
            .delay(delay)
            .to(dur * 0.45, { opacity: 255 }, { easing: 'sineOut' })
            .start();
    }

    /** 由 BowlController 在占位分离时直接写入分离后位置。 */
    setPos(x: number, y: number) {
        this.node.setPosition(x, y, 0);
    }

    /**
     * 被推时触发的视觉反馈：压缩 → 回弹 → 摇摆。
     * 节流：同颗食材 0.22s 内只播一次，避免连续抖动。
     */
    bumpFeedback() {
        if (this._consumed || this.isFloating) return;
        if (!this._visualNode) return;
        const now = director.getTotalTime() / 1000;
        if (this._lastBumpAt > 0 && now - this._lastBumpAt < 0.22) return;
        this._lastBumpAt = now;

        const target = this._visualNode;
        const squish  = this._hitSquishScale;
        const dur     = this._hitSquishDuration;
        const swing   = this._hitSwingAngle * (Math.random() > 0.5 ? 1 : -1);
        const swingDur = this._hitSwingDuration;
        const damping  = this._damping;
        const durScale = Math.max(0.4, 1 - damping * 0.6);

        Tween.stopAllByTarget(target);
        tween(target)
            .to(dur * 0.3 * durScale, {
                scale: new Vec3(1 + squish * 0.5, 1 - squish * 0.5, 1),
                eulerAngles: new Vec3(0, 0, swing),
            })
            .to(dur * 0.4 * durScale, {
                scale: new Vec3(1 - squish * 0.3, 1 + squish * 0.3, 1),
                eulerAngles: new Vec3(0, 0, -swing * 0.5),
            })
            .to(swingDur * durScale, {
                scale: new Vec3(1, 1, 1),
                eulerAngles: new Vec3(0, 0, 0),
            }, { easing: 'backOut' })
            .start();
    }

    private _onTap(e: EventTouch) {
        if (this._consumed) return;
        if (this.isFloating) return; // 上浮过程中不响应点击
        e.propagationStopped = true;
        this.node.emit(DishEvent.Tapped, this);
    }

    flyToSlot(worldPos: Vec3, onArrive: () => void) {
        if (this._consumed) return;
        this._consumed = true;
        this._state = DishPhysicsState.Consumed;
        this.node.off(Node.EventType.TOUCH_END, this._onTap, this);

        const parent = this.node.parent!;
        const localTarget = parent.getComponent(UITransform)!.convertToNodeSpaceAR(worldPos);

        Tween.stopAllByTarget(this.node);
        if (this._visualNode) Tween.stopAllByTarget(this._visualNode);

        tween(this.node)
            .to(0.08, { scale: new Vec3(1.2, 1.2, 1) })
            .to(0.28, { position: localTarget }, { easing: 'cubicIn' })
            .to(0.08, { scale: new Vec3(0.9, 0.9, 1) })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .call(() => onArrive())
            .start();
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
