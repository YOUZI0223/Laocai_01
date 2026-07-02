import {
    _decorator, Component, Node, UITransform, Graphics, Color, Vec3,
    Label, tween, Tween, Sprite, SpriteFrame,
} from 'cc';
import { DishType, DISH_META, SLOT_COUNT, FAIL_SLOT_FILL } from './LevelConfig';
import { DishItem } from './DishItem';

const { ccclass, property } = _decorator;

interface SlotCell {
    node: Node;
    type: DishType | null;
    label: Label | null;     // 外部预置 cell 时无 label
    dish: DishItem | null;   // 落位在此 cell 的食材；常驻显示，被 takeAllOfType 或 clear 时移走
}

export const SlotEvent = {
    Full: 'slot-full',           // (occupiedCount) — fires when occupied >= FAIL_SLOT_FILL
} as const;

@ccclass('SlotBar')
export class SlotBar extends Component {

    @property
    cellWidth: number = 110;

    @property
    cellHeight: number = 110;

    @property
    cellGap: number = 12;

    private _cells: SlotCell[] = [];

    onLoad() {
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        const totalW = SLOT_COUNT * this.cellWidth + (SLOT_COUNT - 1) * this.cellGap;
        ui.setContentSize(totalW, this.cellHeight);
        this._buildCells();
    }

    private _buildCells() {
        const totalW = SLOT_COUNT * this.cellWidth + (SLOT_COUNT - 1) * this.cellGap;
        const startX = -totalW * 0.5 + this.cellWidth * 0.5;
        for (let i = 0; i < SLOT_COUNT; i++) {
            const cellNode = new Node('slot-' + i);
            cellNode.layer = this.node.layer;
            this.node.addChild(cellNode);
            cellNode.addComponent(UITransform).setContentSize(this.cellWidth, this.cellHeight);
            cellNode.setPosition(startX + i * (this.cellWidth + this.cellGap), 0, 0);

            // 无背景，等 applyCellSprite 灌入美术
            const lblNode = new Node('lbl');
            lblNode.layer = this.node.layer;
            cellNode.addChild(lblNode);
            const lbl = lblNode.addComponent(Label);
            lbl.string = '';
            lbl.fontSize = 22;
            lbl.color = new Color(50, 50, 50, 255);

            this._cells.push({ node: cellNode, type: null, label: lbl, dish: null });
        }
    }

    /**
     * 用外部预先在场景中摆好的节点取代脚本自建的 cells（位置、缩放、美术都由用户在场景里控制）。
     * 调用方应在 addComponent(SlotBar) 之后调用。
     */
    useExternalCells(nodes: Node[]) {
        // 释放 onLoad 自动构建的子节点
        for (const c of this._cells) {
            if (c.node && c.node.parent === this.node) c.node.destroy();
        }
        this._cells = [];
        for (const n of nodes) {
            if (!n) continue;
            n.active = true;  // 编辑器可能为整理视图隐藏，运行时强制启用
            this._cells.push({ node: n, type: null, label: null, dish: null });
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

    findEmpty(): SlotCell | null {
        for (const c of this._cells) if (c.type === null) return c;
        return null;
    }

    /** 找出第一个空 cell 的索引，没有则返回 -1。 */
    findFirstEmptyIdx(): number {
        for (let i = 0; i < this._cells.length; i++) {
            if (this._cells[i].type === null) return i;
        }
        return -1;
    }

    /** 给定 cell 索引取出节点世界坐标，越界返回 null。 */
    cellWorldPos(idx: number): Vec3 | null {
        if (idx < 0 || idx >= this._cells.length) return null;
        return this._cells[idx].node.getWorldPosition();
    }

    /** 返回 cell 节点（外部需要 reparent 到它）。 */
    cellNode(idx: number): Node | null {
        if (idx < 0 || idx >= this._cells.length) return null;
        return this._cells[idx].node;
    }

    getDropTarget(type: DishType): { cell: SlotCell; worldPos: Vec3 } | null {
        const c = this.findEmpty();
        if (!c) return null;
        return { cell: c, worldPos: c.node.getWorldPosition() };
    }

    occupiedCount(): number {
        let n = 0;
        for (const c of this._cells) if (c.type !== null) n++;
        return n;
    }

    /** 旧 API：仅登记类型，不绑定 dish。新流程改用 acceptDishAt。 */
    accept(type: DishType): { full: boolean } {
        const c = this.findEmpty();
        if (!c) return { full: true };

        c.type = type;
        if (c.label) c.label.string = DishType[type] as string;
        this._pulse(c.node);

        const occ = this.occupiedCount();
        if (occ >= FAIL_SLOT_FILL) {
            this.node.emit(SlotEvent.Full, occ);
            return { full: true };
        }
        return { full: false };
    }

    /**
     * 立即预占第一个空 cell（标记 type，dish 还未绑定）。tap 瞬间调用，
     * 防止飞行 tween 期间再点同类食材抢占同一格。返回 idx，无空位返回 -1。
     */
    reserveEmpty(type: DishType): number {
        const idx = this.findFirstEmptyIdx();
        if (idx < 0) return -1;
        this._cells[idx].type = type;
        return idx;
    }

    /** 在指定索引上登记类型 + 绑定 DishItem 引用（食材已经被 settleAt 落到 cell 节点下）。 */
    acceptDishAt(idx: number, type: DishType, dish: DishItem): { full: boolean } {
        if (idx < 0 || idx >= this._cells.length) return { full: false };
        const c = this._cells[idx];
        c.type = type;
        c.dish = dish;
        if (c.label) c.label.string = DishType[type] as string;
        this._pulse(c.node);

        const occ = this.occupiedCount();
        if (occ >= FAIL_SLOT_FILL) {
            this.node.emit(SlotEvent.Full, occ);
            return { full: true };
        }
        return { full: false };
    }

    /** 取出所有指定类型的 dish 引用，并清空对应 cell 状态。caller 拿去飞往订单格。 */
    takeAllOfType(type: DishType): { idx: number; dish: DishItem | null }[] {
        const out: { idx: number; dish: DishItem | null }[] = [];
        for (let i = 0; i < this._cells.length; i++) {
            const c = this._cells[i];
            if (c.type === type) {
                out.push({ idx: i, dish: c.dish });
                this._clear(c);
            }
        }
        return out;
    }

    drainType(type: DishType): number {
        let n = 0;
        for (const c of this._cells) {
            if (c.type === type) { this._clear(c); n++; }
        }
        return n;
    }

    private _clear(c: SlotCell) {
        c.type = null;
        c.dish = null;
        if (c.label) c.label.string = '';
    }

    private _pulse(n: Node) {
        Tween.stopAllByTarget(n);
        tween(n)
            .to(0.08, { scale: new Vec3(1.12, 1.12, 1) })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
    }
}
