import type { BeastId, GameEvent, GameState, Player, Role } from '../types';
import { ALL_BEAST_IDS, ROLE_CAMP } from '../types';
import { EngineError } from './errors';
import { startRound } from './flow';
import { mulberry32, pickIndex, shuffled, type Rng } from './rng';

/** 座位顺序即数组顺序 */
export interface InitPlayer {
  id: string;
  name: string;
}

export interface GameConfig {
  roomCode: string;
  seed: number;
  players: InitPlayer[];
}

const ROLES_8: readonly Role[] = [
  'XU_YUAN',
  'FANG_ZHEN',
  'JI_YUN_FU',
  'MU_HU_JIA_NAI',
  'HUANG_YAN_YAN',
  'LAO_CHAO_FENG',
  'YAO_BU_RAN',
  'ZHENG_GUO_QU',
];

/** 7 人局:移除姬云浮;6 人局:再移除郑国渠(SPEC 1.2) */
export function rolesForPlayerCount(count: 6 | 7 | 8): Role[] {
  let roles = ROLES_8.slice();
  if (count <= 7) roles = roles.filter((r) => r !== 'JI_YUN_FU');
  if (count <= 6) roles = roles.filter((r) => r !== 'ZHENG_GUO_QU');
  return roles;
}

/**
 * RULE-DECISION: R-2 —— 十二兽首不重复分配:随机选 6 真,6 真分 3 组各 2、6 假分 3 组各 2,
 * 第 r 轮 = 真组[r] ∪ 假组[r] 再打乱。保证每轮必定 2 真 2 假、三轮恰好覆盖全部 12 件,
 * "保护满 6 件真品"的即时胜利恰好可达。若要改成"每轮重新抽",只改这一个函数。
 */
export function buildRoundPools(rng: Rng): { realIds: BeastId[]; pools: BeastId[][] } {
  const ids = shuffled(ALL_BEAST_IDS, rng);
  const realIds = ids.slice(0, 6);
  const fakeIds = ids.slice(6);
  const pools = [0, 1, 2].map((r) =>
    shuffled([realIds[2 * r], realIds[2 * r + 1], fakeIds[2 * r], fakeIds[2 * r + 1]], rng),
  );
  return { realIds, pools };
}

/** 开局初始化(SPEC 3.1),返回初始状态与事件(ROUND_START、TURN_START) */
export function initGame(config: GameConfig): { state: GameState; events: GameEvent[] } {
  const n = config.players.length;
  if (n < 6 || n > 8) {
    throw new EngineError('BAD_CONFIG', `人数必须是 6–8,实际 ${n}`);
  }
  const ids = new Set(config.players.map((p) => p.id));
  if (ids.size !== n) {
    throw new EngineError('BAD_CONFIG', 'playerId 重复');
  }

  // 用 seed 初始化 RNG,并统计消耗数存入 rngCursor,保证确定性重放
  let cursor = 0;
  const base = mulberry32(config.seed);
  const rng: Rng = () => {
    cursor++;
    return base();
  };

  const { realIds, pools } = buildRoundPools(rng);
  const realSet = new Set<number>(realIds);

  const roles = shuffled(rolesForPlayerCount(n as 6 | 7 | 8), rng);

  const players: Player[] = config.players.map((p, seat) => {
    const role = roles[seat];
    return {
      id: p.id,
      name: p.name,
      seat,
      role,
      camp: ROLE_CAMP[role],
      connected: true,
      chips: 6,
      // 木户加奈、黄烟烟各自独立随机抽 0/1/2 作为轮空轮次
      blindRound: role === 'MU_HU_JIA_NAI' || role === 'HUANG_YAN_YAN' ? pickIndex(rng, 3) : null,
      sniped: false,
      snipedConsumedThisTurn: false,
      permanentlyBlinded: false,
    };
  });

  const startSeat = pickIndex(rng, n);

  const state: GameState = {
    roomCode: config.roomCode,
    phase: 'ACTION', // startRound 会再设一次
    seed: config.seed,
    rngCursor: cursor,
    playerCount: n as 6 | 7 | 8,
    players,
    beasts: ALL_BEAST_IDS.map((id) => ({
      id,
      isReal: realSet.has(id),
      exposedRound: -1,
      protectedRound: null,
      publiclyRevealed: false,
    })),
    roundPools: pools,
    rounds: [],
    currentRound: 0,
    appraisalLog: [],
    skillLog: [],
    investigations: [],
    guesses: {
      laoChaoFengGuessXuYuan: null,
      yaoBuRanGuessFangZhen: null,
      goodGuessLaoChaoFeng: {},
    },
    result: null,
  };

  const events: GameEvent[] = [];
  startRound(state, 0, players[startSeat].id, events);
  state.rngCursor = cursor;
  return { state, events };
}
