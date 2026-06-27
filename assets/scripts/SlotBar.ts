import {
    _decorator, Component, Node, UITransform, Graphics, Color, Vec3,
    Label, tween, Tween, Sprite, SpriteFrame,
} from 'cc';
import { DishType, DISH_META, SLOT_COUNT, FAIL_SLOT_FILL } from './LevelConfig';

const { ccclass, property } = _decorator;

interface SlotCell {
    node: Node;
    type: DishType | null;
    label: Label;
}

export const SlotEvent = {
    Matched: 'slot-matched',     // (type)
    Full: 'slot-full',           // (occupiedCount) — fires when occupied >= FAIL_SLOT_FILL with no match
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

            const g = cellNode.addComponent(Graphics);
            g.fillColor = new Color(245, 245, 235, 255);
            g.strokeColor = new Color(80, 80, 80, 255);
            g.lineWidth = 3;
            g.roundRect(-this.cellWidth * 0.5, -this.cellHeight * 0.5, this.cellWidth, this.cellHeight, 14);
            g.fill();
            g.stroke();

            const lblNode = new Node('lbl');
            lblNode.layer = this.node.layer;
            cellNode.addChild(lblNode);
            const lbl = lblNode.addComponent(Label);
            lbl.string = '';
            lbl.fontSize = 22;
            lbl.color = new Color(50, 50, 50, 255);

            this._cells.push({ node: cellNode, type: null, label: lbl });
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

    accept(type: DishType): { matched: boolean; full: boolean } {
        const c = this.findEmpty();
        if (!c) return { matched: false, full: true };

        c.type = type;
        c.label.string = DISH_META[type].name;
        this._pulse(c.node);

        const same = this._cells.filter(x => x.type === type);
        if (same.length >= 3) {
            for (let i = 0; i < 3; i++) this._clear(same[i]);
            this.node.emit(SlotEvent.Matched, type);
            return { matched: true, full: false };
        }
        const occ = this.occupiedCount();
        if (occ >= FAIL_SLOT_FILL) {
            this.node.emit(SlotEvent.Full, occ);
            return { matched: false, full: true };
        }
        return { matched: false, full: false };
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
        c.label.string = '';
    }

    private _pulse(n: Node) {
        Tween.stopAllByTarget(n);
        tween(n)
            .to(0.08, { scale: new Vec3(1.12, 1.12, 1) })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
    }
}
