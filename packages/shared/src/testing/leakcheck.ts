/**
 * PersonalView 泄密走查器(SPEC Phase 1 验收第 3 条)。
 * 递归遍历 view 的整棵对象树:
 * - 一批字段名在 view 里绝对不允许出现(truth、votes、blindRound、翻转/覆盖标记……)
 * - isReal / role / camp 只允许出现在白名单路径上,且逐项和服务端状态核对
 * - knownTeammates / myAppraisals / publicBeasts 等做语义级核对
 */
import type { GameState, PersonalView } from '../types';

/** 这些 key 出现在 PersonalView 的任何位置都算泄密/违反下发契约 */
const FORBIDDEN_KEYS = new Set([
  'truth',
  'votes',
  'distribution',
  'blindRound',
  'laoChaoFengFlipAt',
  'covered',
  'roundPools',
  'seed',
  'rngCursor',
  'guesses',
  'snipedConsumedThisTurn',
  'appraisalLog',
  'skillLog',
  'investigations',
  'exposedRound',
  'protectedTop1',
  'protectedTop2',
  'speechOrder',
  'startPlayerId',
]);

const ALLOWED_IS_REAL = new Set(['publicBeasts.*.isReal', 'result.reveal.beasts.*.isReal']);
const ALLOWED_ROLE = new Set(['me.role', 'me.knownTeammates.*.role', 'result.reveal.roles.*.role']);
const ALLOWED_CAMP = new Set(['me.camp', 'me.myInvestigations.*.camp']);

function fail(viewerId: string, message: string): never {
  throw new Error(`[泄密] viewer=${viewerId}: ${message}`);
}

export function assertNoLeaks(state: GameState, view: PersonalView, viewerId: string): void {
  walk(state, view as unknown, '', viewerId);
  semanticChecks(state, view, viewerId);
}

function normalize(path: string): string {
  return path
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? '*' : seg))
    .join('.');
}

function walk(state: GameState, value: unknown, path: string, viewerId: string): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(state, v, path ? `${path}.${i}` : String(i), viewerId));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${key}` : key;
    const np = normalize(p);

    if (FORBIDDEN_KEYS.has(key)) {
      fail(viewerId, `禁止下发的字段 "${key}" 出现在 ${p}`);
    }
    if (key === 'isReal') {
      if (!ALLOWED_IS_REAL.has(np)) fail(viewerId, `isReal 出现在非法路径 ${p}`);
      if (np.startsWith('result.') && state.phase !== 'FINISHED') {
        fail(viewerId, `游戏未结束就下发了 result(${p})`);
      }
      if (np.startsWith('publicBeasts.')) {
        const entry = value as { id: number; isReal: boolean };
        const beast = state.beasts[entry.id];
        if (!beast?.publiclyRevealed) {
          fail(viewerId, `兽首 ${entry.id} 未公开却出现在 publicBeasts`);
        }
        if (beast.isReal !== entry.isReal) fail(viewerId, `兽首 ${entry.id} 的 isReal 与状态不符`);
      }
    }
    if (key === 'role' && !ALLOWED_ROLE.has(np)) fail(viewerId, `role 出现在非法路径 ${p}`);
    if (key === 'camp' && !ALLOWED_CAMP.has(np)) fail(viewerId, `camp 出现在非法路径 ${p}`);

    walk(state, v, p, viewerId);
  }
}

function semanticChecks(state: GameState, view: PersonalView, viewerId: string): void {
  const me = state.players.find((p) => p.id === viewerId);
  if (!me) fail(viewerId, '玩家不存在');

  // T-72/73/74:互相认人规则
  const teammateIds = view.me.knownTeammates.map((t) => t.id).sort();
  const expected =
    me.role === 'LAO_CHAO_FENG'
      ? state.players.filter((p) => p.role === 'YAO_BU_RAN').map((p) => p.id)
      : me.role === 'YAO_BU_RAN'
        ? state.players.filter((p) => p.role === 'LAO_CHAO_FENG').map((p) => p.id)
        : [];
  if (JSON.stringify(teammateIds) !== JSON.stringify(expected.sort())) {
    fail(viewerId, `knownTeammates 应为 ${JSON.stringify(expected)},实际 ${JSON.stringify(teammateIds)}`);
  }

  // T-75:只含自己的鉴定历史
  const myLog = state.appraisalLog.filter((e) => e.playerId === viewerId);
  if (view.me.myAppraisals.length !== myLog.length) {
    fail(viewerId, 'myAppraisals 条数与本人鉴定历史不符');
  }
  for (const a of view.me.myAppraisals) {
    const hit = myLog.some(
      (e) => e.round === a.round && e.beastId === a.beastId && e.shown === a.shown,
    );
    if (!hit) fail(viewerId, `myAppraisals 含有不属于本人的记录 ${JSON.stringify(a)}`);
  }

  // 方震专属查验记录
  if (me.role !== 'FANG_ZHEN' && view.me.myInvestigations.length > 0) {
    fail(viewerId, '非方震却收到了查验记录');
  }

  // 拍板 2026-08-12:待消耗的偷袭标记不得下发,me.sniped 只反映"本回合被封禁"
  if (view.me.sniped !== me.snipedConsumedThisTurn) {
    fail(viewerId, `me.sniped=${view.me.sniped} 泄露了待消耗的偷袭标记`);
  }

  // 技能记录只含本人的
  const mySkills = state.skillLog.filter((e) => e.playerId === viewerId);
  if (view.me.mySkillHistory.length !== mySkills.length) {
    fail(viewerId, 'mySkillHistory 条数与本人技能记录不符');
  }
  for (const h of view.me.mySkillHistory) {
    const hit = mySkills.some(
      (e) =>
        e.round === h.round &&
        e.skill === h.skill &&
        e.targetPlayerId === h.targetPlayerId &&
        e.targetBeastId === h.targetBeastId,
    );
    if (!hit) fail(viewerId, `mySkillHistory 含有不属于本人的记录 ${JSON.stringify(h)}`);
  }

  // publicBeasts / protectedUnknown 必须与状态精确一致
  const revealed = state.beasts.filter((b) => b.publiclyRevealed).map((b) => b.id);
  const viewRevealed = view.publicBeasts.map((b) => b.id);
  if (JSON.stringify([...viewRevealed].sort((x, y) => x - y)) !== JSON.stringify(revealed)) {
    fail(viewerId, 'publicBeasts 与已公开集合不一致');
  }
  const unknownProtected = state.beasts
    .filter((b) => b.protectedRound !== null && !b.publiclyRevealed)
    .map((b) => b.id);
  if (
    JSON.stringify([...view.protectedUnknown].sort((x, y) => x - y)) !==
    JSON.stringify(unknownProtected)
  ) {
    fail(viewerId, 'protectedUnknown 与状态不一致');
  }

  // T-76/77:开票前不得出现 tally
  const round = state.rounds[state.currentRound];
  if (round && round.tally === null && view.round.tally !== null) {
    fail(viewerId, '开票前就下发了 tally');
  }

  // 玩家列表只允许公开字段
  const allowedPlayerKeys = ['id', 'name', 'seat', 'connected', 'hasActed', 'chipsRemaining'];
  for (const p of view.players) {
    for (const k of Object.keys(p)) {
      if (!allowedPlayerKeys.includes(k)) fail(viewerId, `players[] 含非公开字段 "${k}"`);
    }
  }

  // 未结束不得有 result
  if (state.phase !== 'FINISHED' && view.result !== null) {
    fail(viewerId, '游戏未结束就下发了 result');
  }
}
