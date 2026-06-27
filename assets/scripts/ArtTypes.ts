import { _decorator, SpriteFrame } from 'cc';
import { DishType, DISH_META, DishMeta } from './LevelConfig';
const { ccclass, property } = _decorator;

@ccclass('DishSpriteVariants')
export class DishSpriteVariants {
    @property([SpriteFrame])
    sprites: SpriteFrame[] = [];

    @property({ tooltip: '显示半径（像素）。0 = 用 DISH_META 默认。同时决定节点 UITransform 与 Sprite 尺寸。' })
    visualRadius: number = 0;

    @property({ tooltip: '碰撞圆半径（像素）。0 = 跟随 visualRadius。占位分离用，改小让食材更容易插缝。' })
    colliderRadius: number = 0;

    @property({ tooltip: '重量。越大越稳，越不容易被推开。0 = 用 DISH_META 默认。建议范围 1~4。' })
    weight: number = 0;

    @property({ tooltip: '弹性 0~1，碰撞反馈中的压缩/回弹幅度。0 = 用 DISH_META 默认。' })
    elasticity: number = 0;

    @property({ tooltip: '阻尼 0~1，碰撞晃动的衰减速度（越大越快回稳）。0 = 用 DISH_META 默认。' })
    damping: number = 0;

    @property({ tooltip: '旋转范围（度）。碰撞或上浮时允许出现的角度变化。0 = 用 DISH_META 默认。' })
    rotationRange: number = 0;

    @property({ tooltip: '上浮动画时长（秒）。越小越快。0 = 用 DISH_META 默认。' })
    upSpeed: number = 0;

    @property({ tooltip: '上浮过程横向漂移幅度（像素）。0 = 用 DISH_META 默认。' })
    upDrift: number = 0;
}

export interface DishProfile {
    type: DishType;
    name: string;
    visualR: number;
    collR: number;
    weight: number;
    elasticity: number;
    damping: number;
    rotationRange: number;
    upSpeed: number;
    upDrift: number;
    sprite: SpriteFrame | null;
    hitSquishScale: number;
    hitSquishDuration: number;
    hitSwingAngle: number;
    hitSwingDuration: number;
    displayZOffset: number;
}

function pickN(v: number, fallback: number): number {
    return v > 0 ? v : fallback;
}

function pickSprite(arr: SpriteFrame[] | undefined): SpriteFrame | null {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

export function buildDishProfile(type: DishType, variant: DishSpriteVariants | null | undefined): DishProfile {
    const meta: DishMeta = DISH_META[type];
    const visualR = pickN(variant?.visualRadius ?? 0, meta.radius);
    const collR = pickN(variant?.colliderRadius ?? 0, visualR);
    return {
        type,
        name: meta.name,
        visualR,
        collR,
        weight: pickN(variant?.weight ?? 0, meta.weight),
        elasticity: pickN(variant?.elasticity ?? 0, meta.elasticity),
        damping: pickN(variant?.damping ?? 0, meta.damping),
        rotationRange: pickN(variant?.rotationRange ?? 0, meta.rotationRange),
        upSpeed: pickN(variant?.upSpeed ?? 0, meta.upSpeed),
        upDrift: pickN(variant?.upDrift ?? 0, meta.upDrift),
        sprite: pickSprite(variant?.sprites),
        hitSquishScale:    meta.hitSquishScale,
        hitSquishDuration: meta.hitSquishDuration,
        hitSwingAngle:     meta.hitSwingAngle,
        hitSwingDuration:  meta.hitSwingDuration,
        displayZOffset:    meta.displayZOffset,
    };
}
