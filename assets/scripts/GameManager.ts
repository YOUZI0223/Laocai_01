import { _decorator, Component, Node, EventTarget } from 'cc';
import { LEVEL_1, LevelData } from './LevelConfig';
const { ccclass, property } = _decorator;

export enum GameState {
    Init = 0,
    Play = 1,
    Win = 2,
    Fail = 3,
}

export const GameEvent = {
    StateChanged: 'state-changed',
    DishCollected: 'dish-collected',
    OrderCompleted: 'order-completed',
    OrderRefreshed: 'order-refreshed',
    Win: 'win',
    Fail: 'fail',
} as const;

@ccclass('GameManager')
export class GameManager extends Component {

    private static _inst: GameManager | null = null;
    static get inst(): GameManager { return GameManager._inst!; }

    readonly events: EventTarget = new EventTarget();

    private _state: GameState = GameState.Init;
    private _level: LevelData = LEVEL_1;

    get state(): GameState { return this._state; }
    get level(): LevelData { return this._level; }

    onLoad() {
        GameManager._inst = this;
    }

    onDestroy() {
        if (GameManager._inst === this) GameManager._inst = null;
    }

    startLevel(level: LevelData = LEVEL_1) {
        this._level = level;
        this.setState(GameState.Play);
    }

    setState(s: GameState) {
        if (this._state === s) return;
        this._state = s;
        this.events.emit(GameEvent.StateChanged, s);
        if (s === GameState.Win) this.events.emit(GameEvent.Win);
        else if (s === GameState.Fail) this.events.emit(GameEvent.Fail);
    }
}
