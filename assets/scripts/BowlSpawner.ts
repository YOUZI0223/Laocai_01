import { _decorator, Component, Vec3 } from 'cc';
import { BowlController } from './BowlController';
import { DishType, LevelData, DEFAULT_ORDER_NEED } from './LevelConfig';
import { DishSpriteVariants, buildDishProfile } from './ArtTypes';

const { ccclass, property } = _decorator;

@ccclass('BowlSpawner')
export class BowlSpawner extends Component {

    @property(BowlController)
    bowl: BowlController | null = null;

    dishVariants: DishSpriteVariants[] = [];

    private _profile(type: DishType) {
        // 按 type 字段匹配 variant 槽，数组顺序与 DishType 索引解耦
        const variant = this.dishVariants.find(v => v && v.type === type) ?? null;
        return buildDishProfile(type, variant);
    }

    /**
     * 一次性生成所有订单需要的食材（不再有 refill / pending queue）。
     * 汤下食材靠 BowlController.checkLow → raiseToSurface 机制在上层不足时浮上。
     */
    spawnInitial(level: LevelData, allOrderTypes: DishType[]) {
        if (!this.bowl) return;

        const allTypesExpanded: DishType[] = [];
        for (const t of allOrderTypes) {
            for (let k = 0; k < DEFAULT_ORDER_NEED; k++) {
                allTypesExpanded.push(t);
            }
        }
        this._shuffleArr(allTypesExpanded);

        console.log('[BowlSpawner] spawnInitial:',
            'allTypes=', allOrderTypes.length,
            'total=', allTypesExpanded.length);

        const positions = this._scatterPositions(
            allTypesExpanded.length,
            this.bowl.bowlRadius * level.spawnRadiusFactor,
            level.scatterMinDistFactor,
        );
        for (let i = 0; i < allTypesExpanded.length; i++) {
            const p = positions[i];
            const type = allTypesExpanded[i];
            const profile = this._profile(type);
            const target = new Vec3(p.x, p.y, 0);
            const dish = this.bowl.spawnDish(null, profile, target);
            dish.floatUpFromCenter(target, i * level.spawnStagger);
        }
        this.bowl.spawnBubbles(10);
    }

    private _shuffleArr<T>(arr: T[]) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    private _scatterPositions(
        count: number,
        maxR: number,
        minDistFactor: number = 0.85
    ): { x: number; y: number }[] {
        const out: { x: number; y: number }[] = [];
        const minDist = Math.max(28, maxR / Math.sqrt(count) * minDistFactor);
        const maxTries = 80;
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
}
