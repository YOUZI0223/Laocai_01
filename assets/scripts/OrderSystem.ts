import {
    _decorator, Component, Node, UITransform, Graphics, Label, Vec3,
    Sprite, SpriteFrame,
} from 'cc';
import { DishType, OrderSpec, ORDER_COUNT, LevelData, PoolPickStrategy } from './LevelConfig';

const { ccclass, property } = _decorator;

interface OrderCell {
    node: Node;
    label: Label | null;       // 方案 B：订单格不显示文字，仅显示盘子背景
    progress: Label | null;    // 进度通过顾客头顶气泡呈现，这里保留字段位以兼容
    spec: OrderSpec;
    filled: number;
}

export const OrderEvent = {
    OrderCompleted: 'order-completed',     // (oldType, newType, idx)
    OrderRefreshed: 'order-refreshed',     // (idx, newType, need)
    NeedScanSlot: 'order-need-scan-slot',  // (type) — emitted when a new order appears
    AllCompleted: 'order-all-completed',   // 所有订单（含池子）全部完成
    ProgressChanged: 'order-progress-changed',  // (idx, filled, need, type)
} as const;

@ccclass('OrderSystem')
export class OrderSystem extends Component {

    @property
    cellWidth: number = 130;

    @property
    cellHeight: number = 110;

    @property
    cellGap: number = 18;

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
            // 无背景，纯节点。等 applyCellSprite 灌入美术
            this._cells.push({
                node: c, label: null, progress: null,
                spec: { type: DishType.卷心菜, need: 3 }, filled: 0,
            });
        }
    }

    /**
     * 用外部预先在场景中摆好的节点取代脚本自建的 cells。
     * 调用方应在 addComponent(OrderSystem) 后、init() 前调用。
     * 节点数量需 = ORDER_COUNT。
     */
    useExternalCells(nodes: Node[]) {
        // 释放 onLoad 自动构建的子节点
        for (const c of this._cells) {
            if (c.node && c.node.parent === this.node) c.node.destroy();
        }
        this._cells = [];
        for (const n of nodes) {
            if (!n) continue;
            this._cells.push({
                node: n, label: null, progress: null,
                spec: { type: DishType.卷心菜, need: 3 }, filled: 0,
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
        if (c.label) c.label.string = DishType[spec.type] as string;
        if (c.progress) c.progress.string = `0 / ${spec.need}`;
        // 派发刷新事件，让外部 UI（如顾客气泡）同步
        this.node.emit(OrderEvent.OrderRefreshed, idx, spec.type, spec.need);
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
        if (c.progress) c.progress.string = `${c.filled} / ${c.spec.need}`;
        this.node.emit(OrderEvent.ProgressChanged, idx, c.filled, c.spec.need, c.spec.type);
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

    /** 找出第一个 active 且 type 匹配的订单格的原始索引（0~ORDER_COUNT-1），找不到返回 -1 */
    findOrderIdx(type: DishType): number {
        for (let i = 0; i < this._cells.length; i++) {
            const c = this._cells[i];
            if (c.node.active && c.spec.type === type) return i;
        }
        return -1;
    }

    /** 获取指定索引订单的当前规格（包括 type 和 need），用于外部 UI 同步 */
    getOrderSpec(idx: number): { type: DishType; need: number; filled: number; active: boolean } | null {
        if (idx < 0 || idx >= this._cells.length) return null;
        const c = this._cells[idx];
        return {
            type: c.spec.type,
            need: c.spec.need,
            filled: c.filled,
            active: c.node.active,
        };
    }
}
