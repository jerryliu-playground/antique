/**
 * 手写 GameState fixture(SPEC 第 9 节要求:不经过随机初始化)+ 驱动引擎的小工具。
 *
 * 默认 8 人局座位表(测试全部按这个约定):
 *   p0 许愿  p1 方震  p2 姬云浮  p3 木户加奈  p4 黄烟烟  p5 老朝奉  p6 药不然  p7 郑国渠
 * 默认真伪表:0..5 为真,6..11 为假
 * 默认三轮兽首池:[0,1,6,7] / [2,3,8,9] / [4,5,10,11](每轮 2 真 2 假)
 */
import { expect } from 'vitest';
import {
  EngineError,
  reduce,
  type EngineErrorCode,
} from '../src/index';
import type {
  BeastId,
  GameAction,
  GameState,
  Player,
  Role,
} from '../src/index';
import { ROLE_CAMP, ALL_BEAST_IDS } from '../src/index';

export const SEAT_ROLES_8: Role[] = [
  'XU_YUAN',
  'FANG_ZHEN',
  'JI_YUN_FU',
  'MU_HU_JIA_NAI',
  'HUANG_YAN_YAN',
  'LAO_CHAO_FENG',
  'YAO_BU_RAN',
  'ZHENG_GUO_QU',
];

/** 默认座位表下的 playerId 速查 */
export const P = {
  XU: 'p0',
  FANG: 'p1',
  JI: 'p2',
  MU: 'p3',
  HUANG: 'p4',
  LCF: 'p5',
  YBR: 'p6',
  ZGQ: 'p7',
} as const;

export const DEFAULT_REAL: BeastId[] = [0, 1, 2, 3, 4, 5];
export const DEFAULT_POOLS: BeastId[][] = [
  [0, 1, 6, 7],
  [2, 3, 8, 9],
  [4, 5, 10, 11],
];

export interface FixtureOpts {
  /** 按座位顺序的身份表,默认 8 人标准局 */
  roles?: Role[];
  /** 真品 id 集合,默认 [0..5] */
  realBeasts?: BeastId[];
  /** 三轮兽首池,默认 [[0,1,6,7],[2,3,8,9],[4,5,10,11]] */
  pools?: BeastId[][];
  /**
   * 已进入 actionOrder 的座位序列;最后一个是当前行动者(停在鉴定步骤)。
   * 默认 [0](p0 起始)。前面的座位视为"已行动"(无需真实鉴定记录)。
   */
  actedSeats?: number[];
  /** playerId -> blindRound(木户/黄的轮空轮次),默认全 null */
  blind?: Record<string, number>;
}

export function makeGame(opts: FixtureOpts = {}): GameState {
  const roles = opts.roles ?? SEAT_ROLES_8;
  const n = roles.length;
  const pools = opts.pools ?? DEFAULT_POOLS;
  const realSet = new Set<number>(opts.realBeasts ?? DEFAULT_REAL);
  const acted = (opts.actedSeats ?? [0]).map((seat) => `p${seat}`);

  const players: Player[] = roles.map((role, seat) => ({
    id: `p${seat}`,
    name: `玩家${seat}`,
    seat,
    role,
    camp: ROLE_CAMP[role],
    connected: true,
    chips: 6,
    blindRound: opts.blind?.[`p${seat}`] ?? null,
    sniped: false,
    snipedConsumedThisTurn: false,
    permanentlyBlinded: false,
  }));

  return {
    roomCode: 'TEST01',
    phase: 'ACTION',
    seed: 42,
    rngCursor: 0,
    playerCount: n as 6 | 7 | 8,
    players,
    beasts: ALL_BEAST_IDS.map((id) => ({
      id,
      isReal: realSet.has(id),
      exposedRound: pools[0].includes(id) ? 0 : -1,
      protectedRound: null,
      publiclyRevealed: false,
    })),
    roundPools: pools.map((p) => p.slice()),
    rounds: [
      {
        index: 0,
        exposedBeasts: pools[0].slice(),
        startPlayerId: acted[0],
        actionOrder: acted.slice(),
        currentActorId: acted[acted.length - 1],
        turnStep: 'APPRAISE',
        laoChaoFengFlipAt: null,
        covered: null,
        currentSpeakerId: null,
        speechOrder: [],
        votes: {},
        tally: null,
        protectedTop1: null,
        protectedTop2: null,
      },
    ],
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
}

// ============ 驱动工具 ============

export function step(state: GameState, action: GameAction): GameState {
  return reduce(state, action).state;
}

export function playerOf(state: GameState, pid: string): Player {
  const p = state.players.find((x) => x.id === pid);
  if (!p) throw new Error(`fixture: 玩家 ${pid} 不存在`);
  return p;
}

export function logOf(state: GameState, pid: string, round: number, beastId: BeastId) {
  const e = state.appraisalLog.find(
    (x) => x.playerId === pid && x.round === round && x.beastId === beastId,
  );
  if (!e) throw new Error(`fixture: 找不到 ${pid} 第 ${round} 轮对兽首 ${beastId} 的鉴定记录`);
  return e;
}

export interface TurnOpts {
  /** 鉴定哪些兽首;缺省按角色取本轮池子前 1/2 件(方震为空) */
  appraise?: BeastId[];
  /** 发动技能:传对象则 use=true(带目标);缺省不发动 */
  skill?: { targetPlayerId?: string; targetBeastId?: BeastId };
  /** 派票给谁;缺省派给座位号最小的未行动者 */
  passTo?: string;
}

/** 让当前行动者完整走完 鉴定 → 技能 → 派票 三步 */
export function takeTurn(state: GameState, pid: string, opts: TurnOpts = {}): GameState {
  const round = state.rounds[state.currentRound];
  const me = playerOf(state, pid);
  const count = me.role === 'XU_YUAN' ? 2 : me.role === 'FANG_ZHEN' ? 0 : 1;
  const beastIds = opts.appraise ?? round.exposedBeasts.slice(0, count);

  let s = step(state, { type: 'APPRAISE', playerId: pid, beastIds });
  s = step(s, {
    type: 'SKILL',
    playerId: pid,
    use: opts.skill !== undefined,
    targetPlayerId: opts.skill?.targetPlayerId,
    targetBeastId: opts.skill?.targetBeastId,
  });

  const r = s.rounds[s.currentRound];
  if (s.phase === 'ACTION' && r.turnStep === 'PASS') {
    const target =
      opts.passTo ??
      s.players
        .filter((p) => !r.actionOrder.includes(p.id))
        .sort((a, b) => a.seat - b.seat)[0].id;
    s = step(s, { type: 'PASS_TURN', playerId: pid, targetPlayerId: target });
  }
  return s;
}

/** 把行动阶段走完(默认鉴定、不发技能、按座位号从小到大派票) */
export function finishActionPhase(state: GameState): GameState {
  let s = state;
  while (s.phase === 'ACTION') {
    const actor = s.rounds[s.currentRound].currentActorId;
    if (!actor) throw new Error('fixture: ACTION 阶段没有当前行动者');
    s = takeTurn(s, actor);
  }
  return s;
}

export function runSpeechPhase(state: GameState): GameState {
  let s = state;
  while (s.phase === 'SPEECH') {
    const speaker = s.rounds[s.currentRound].currentSpeakerId;
    if (!speaker) throw new Error('fixture: SPEECH 阶段没有当前发言者');
    s = step(s, { type: 'SPEECH_END', playerId: speaker });
  }
  return s;
}

/** 全员提交押币(缺省 0 票),全员提交后引擎自动开票 → REVEAL */
export function runVotingPhase(
  state: GameState,
  votes: Record<string, Partial<Record<BeastId, number>>> = {},
): GameState {
  let s = state;
  for (const p of [...s.players].sort((a, b) => a.seat - b.seat)) {
    if (s.rounds[s.currentRound].votes[p.id] !== undefined) continue;
    s = step(s, { type: 'VOTE_SUBMIT', playerId: p.id, distribution: votes[p.id] ?? {} });
  }
  return s;
}

/** 走完一整轮:行动 → 发言 → 押币 → 开票展示结束 */
export function playRound(
  state: GameState,
  votes: Record<string, Partial<Record<BeastId, number>>> = {},
): GameState {
  let s = finishActionPhase(state);
  s = runSpeechPhase(s);
  s = runVotingPhase(s, votes);
  return step(s, { type: 'REVEAL_CONTINUE' });
}

/** 三轮打完,停在 IDENTITY(或即时胜利的 FINISHED) */
export function playThreeRounds(state: GameState): GameState {
  let s = state;
  for (let r = 0; r < 3; r++) s = playRound(s);
  return s;
}

/** 身份揭示阶段全员指认 */
export function submitGuesses(
  state: GameState,
  opts: { lcf: string; ybr: string; good: Record<string, string> },
): GameState {
  let s = state;
  const lcfP = s.players.find((p) => p.role === 'LAO_CHAO_FENG');
  const ybrP = s.players.find((p) => p.role === 'YAO_BU_RAN');
  if (!lcfP || !ybrP) throw new Error('fixture: 缺少老朝奉/药不然');
  s = step(s, { type: 'IDENTITY_GUESS', playerId: lcfP.id, targetPlayerId: opts.lcf });
  s = step(s, { type: 'IDENTITY_GUESS', playerId: ybrP.id, targetPlayerId: opts.ybr });
  for (const p of s.players.filter((x) => x.camp === 'GOOD').sort((a, b) => a.seat - b.seat)) {
    const target = opts.good[p.id];
    if (!target) throw new Error(`fixture: 好人 ${p.id} 缺少指认目标`);
    s = step(s, { type: 'IDENTITY_GUESS', playerId: p.id, targetPlayerId: target });
  }
  return s;
}

/** 断言抛出指定 code 的 EngineError */
export function expectEngineError(fn: () => unknown, code: EngineErrorCode): void {
  let thrown: unknown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, `期望抛出 EngineError(${code}),实际没有抛错`).toBeInstanceOf(EngineError);
  expect((thrown as EngineError).code).toBe(code);
}
