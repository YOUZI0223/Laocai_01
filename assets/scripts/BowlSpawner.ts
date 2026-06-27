import { _decorator, Component, Vec3 } from 'cc';
import { BowlController } from './BowlController';
import { DishType, DISH_META, LevelData, DEFAULT_ORDER_NEED } from './LevelConfig';
import { DishItem } from './DishItem';
import { DishSpriteVariants, buildDishProfile } from './ArtTypes';

const { ccclass, property } = _decorator;

@ccclass('BowlSpawner')
export class BowlSpawner extends Component {

    @property(BowlController)
    bowl: BowlController | null = null;

    dishVariants: DishSpriteVariants[] = [];

    private _pendingSpawnQueue: DishType[] = [];

    private _profile(type: DishType) {
        return buildDishProfile(type, this.dishVariants[type]);
    }

    spawnInitial(level: LevelData, allOrderTypes: DishType[]) {
        if (!this.bowl) return;

        // 按订单类型展开：每个订单贡献 DEFAULT_ORDER_NEED 个食材
        const allTypesExpanded: DishType[] = [];
        for (const t of allOrderTypes) {
            for (let k = 0; k < DEFAULT_ORDER_NEED; k++) {
                allTypesExpanded.push(t);
            }
        }
        this._shuffleArr(allTypesExpanded);

        // 切分：前 initialBowlSpawnCount 个开局投放，剩余进入补料队列
        const initialItems = allTypesExpanded.slice(0, level.initialBowlSpawnCount);
        this._pendingSpawnQueue = allTypesExpanded.slice(level.initialBowlSpawnCount);

        const positions = this._scatterPositions(
            initialItems.length,
            this.bowl.bowlRadius * level.spawnRadiusFactor,
            level.scatterMinDistFactor,
        );
        for (let i = 0; i < initialItems.length; i++) {
            const p = positions[i];
            const type = initialItems[i];
            const profile = this._profile(type);
            const target = new Vec3(p.x, p.y, 0);
            const dish = this.bowl.spawnDish(null, profile, target);
            dish.floatUpFromCenter(target, i * level.spawnStagger);
        }
        this.bowl.spawnBubbles(10);
    }

    refill(level: LevelData): DishItem[] {
        if (!this.bowl) return [];
        if (this._pendingSpawnQueue.length === 0) return [];

        const batch = Math.min(level.refillBatchSize, this._pendingSpawnQueue.length);
        const types = this._pendingSpawnQueue.splice(0, batch);

        const r = this.bowl.bowlRadius * level.refillRadiusFactor;
        const out: DishItem[] = [];
        for (let i = 0; i < types.length; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * r;
            const x = Math.cos(a) * d;
            const y = Math.sin(a) * d;
            const target = new Vec3(x, y, 0);
            const type = types[i];
            const profile = this._profile(type);
            const dish = this.bowl.spawnDish(null, profile, target);
            dish.floatUpFromCenter(target, i * level.refillStagger);
            out.push(dish);
        }
        this.bowl.spawnBubbles(Math.max(4, types.length));
        return out;
    }

    /** 剩余还需补料的食材数量 */
    getPendingSpawnCount(): number {
        return this._pendingSpawnQueue.length;
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
