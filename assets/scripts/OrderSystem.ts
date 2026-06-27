import {
    _decorator, Component, Node, UITransform, Graphics, Color, Label, Vec3,
    Sprite, SpriteFrame,
} from 'cc';
import { DishType, DISH_META, OrderSpec, ORDER_COUNT, LevelData, PoolPickStrategy } from './LevelConfig';

const { ccclass, property } = _decorator;

interface OrderCell {
    node: Node;
    label: Label;
    progress: Label;
    spec: OrderSpec;
    filled: number;
}

export const OrderEvent = {
    OrderCompleted: 'order-completed',     // (oldType, newType, idx)
    OrderRefreshed: 'order-refreshed',     // (idx, newType)
    NeedScanSlot: 'order-need-scan-slot',  // (type) — emitted when a new order appears
    AllCompleted: 'order-all-completed',   // 所有订单（含池子）全部完成
} as const;

@ccclass('OrderSystem')
export class OrderSystem extends Component {

    @property
    cellWidth: number = 130;

    @property
    cellHeight: number = 110;

    @property
    cellGap: number = 14;

    private _cells: OrderCell[] = [];
    private _pool: OrderSpec[] = [];
    private _totalOrderCount: number = 0;
    private _completedCount: number = 0;
    private _pickStrategy: PoolPickStrategy = PoolPickStrategy.Sequential;

    onLoad() {
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        const totalW = ORDER_COUNT * this.cellWidth + (ORDER_COUNT - 1) * this.cellGap;
        ui.setContentSize(totalW, this.cellHeight);
        this._buildCells();
    }

    private _buildCells() {
        const totalW = ORDER_COUNT * this.cellWidth + (ORDER_COUNT - 1) * this.cellGap;
        const startX = -totalW * 0.5 + this.cellWidth * 0.5;
        for (let i = 0; i < ORDER_COUNT; i++) {
            const c = new Node('order-' + i);
            c.layer = this.node.layer;
            this.node.addChild(c);
            c.addComponent(UITransform).setContentSize(this.cellWidth, this.cellHeight);
            c.setPosition(startX + i * (this.cellWidth + this.cellGap), 0, 0);

            const g = c.addComponent(Graphics);
            g.fillColor = new Color(255, 248, 220, 255);
            g.strokeColor = new Color(180, 130, 50, 255);
            g.lineWidth = 3;
            g.roundRect(-this.cellWidth * 0.5, -this.cellHeight * 0.5, this.cellWidth, this.cellHeight, 14);
            g.fill();
            g.stroke();

            const lblNode = new Node('lbl');
            lblNode.layer = this.node.layer;
            c.addChild(lblNode);
            lblNode.setPosition(0, 14, 0);
            const lbl = lblNode.addComponent(Label);
            lbl.fontSize = 24;
            lbl.color = new Color(60, 40, 20, 255);

            const pNode = new Node('p');
            pNode.layer = this.node.layer;
            c.addChild(pNode);
            pNode.setPosition(0, -22, 0);
            const p = pNode.addComponent(Label);
            p.fontSize = 26;
            p.color = new Color(180, 30, 30, 255);

            this._cells.push({
                node: c, label: lbl, progress: p,
                spec: { type: DishType.Cabbage, need: 3 }, filled: 0,
            });
        }
    }

    applyCellSprite(sf: SpriteFrame | null) {
        if (!sf) return;
        for (const c of this._cells) {
            const gfx = c.node.getComponent(Graphics);
            if (gfx) gfx.destroy();
            const ui = c.node.getComponent(UITransform)!;
            const w = ui.width, h = ui.height;
            const sp = c.node.getComponent(Sprite) ?? c.node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SLICED;
            sp.spriteFrame = sf;
            ui.setContentSize(w, h);
        }
    }

    init(level: LevelData) {
        this._pool = level.orderPool.map(o => ({ ...o }));
        this._totalOrderCount = level.initialOrders.length + level.orderPool.length;
        this._completedCount = 0;
        this._pickStrategy = level.poolPickStrategy;

        for (let i = 0; i < ORDER_COUNT; i++) {
            const spec = level.initialOrders[i];
            if (spec) {
                this._setOrder(i, spec);
                this._cells[i].node.active = true;
            } else {
                const picked = this._pickFromPool();
                if (picked) {
                    this._setOrder(i, picked);
                    this._cells[i].node.active = true;
                } else {
                    this._cells[i].node.active = false;
                }
            }
        }
    }

    private _pickFromPool(): OrderSpec | null {
        if (this._pool.length === 0) return null;
        let idx = 0;
        if (this._pickStrategy === PoolPickStrategy.Random) {
            idx = Math.floor(Math.random() * this._pool.length);
        }
        const spec = this._pool[idx];
        this._pool.splice(idx, 1);
        return spec;
    }

    private _setOrder(idx: number, spec: OrderSpec) {
        const c = this._cells[idx];
        c.spec = { type: spec.type, need: spec.need };
        c.filled = 0;
        c.label.string = DISH_META[spec.type].name;
        c.progress.string = `0 / ${spec.need}`;
    }

    /** 桌面上仍激活的订单类型（已关闭的格不计入）。 */
    currentTypes(): DishType[] {
        const out: DishType[] = [];
        for (const c of this._cells) {
            if (c.node.active) out.push(c.spec.type);
        }
        return out;
    }

    isNeeded(type: DishType): boolean {
        return this._cells.some(c => c.node.active && c.spec.type === type);
    }

    contributeFromSlot(type: DishType, amount: number): { fulfilled: boolean; idx: number } {
        const idx = this._cells.findIndex(c => c.node.active && c.spec.type === type);
        if (idx < 0) return { fulfilled: false, idx: -1 };
        const c = this._cells[idx];
        c.filled += amount;
        if (c.filled >= c.spec.need) {
            const oldType = c.spec.type;
            this._completedCount++;
            const picked = this._pickFromPool();
            if (picked) {
                this._setOrder(idx, picked);
                this.node.emit(OrderEvent.OrderCompleted, oldType, picked.type, idx);
                this.node.emit(OrderEvent.NeedScanSlot, picked.type);
            } else {
                c.node.active = false;
                this.node.emit(OrderEvent.OrderCompleted, oldType, -1, idx);
                if (this._completedCount >= this._totalOrderCount) {
                    this.node.emit(OrderEvent.AllCompleted);
                }
            }
            return { fulfilled: true, idx };
        }
        c.progress.string = `${c.filled} / ${c.spec.need}`;
        return { fulfilled: false, idx };
    }

    /** 剩余未完成订单数（桌面 + 池子） */
    getRemainingOrderCount(): number {
        return this._totalOrderCount - this._completedCount;
    }

    /** 所有未完成订单的 type 列表（桌面 + 池子），供 spawnInitial 使用 */
    getAllPendingTypes(): DishType[] {
        const out: DishType[] = [];
        for (const c of this._cells) {
            if (c.node.active) out.push(c.spec.type);
        }
        for (const o of this._pool) out.push(o.type);
        return out;
    }

    getCellWorldPos(idx: number): Vec3 {
        return this._cells[idx].node.getWorldPosition();
    }
}
