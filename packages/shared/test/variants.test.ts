/** SPEC 第 9 节:人数变体(T-80 ~ T-82)+ 随机开局的结构断言 */
import { describe, expect, it } from 'vitest';
import { initGame, rolesForPlayerCount } from '../src/index';

function mkPlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `玩家${i}` }));
}

describe('人数变体', () => {
  it('T-80 7 人局身份牌不含姬云浮', () => {
    const roles = rolesForPlayerCount(7);
    expect(roles).toHaveLength(7);
    expect(roles).not.toContain('JI_YUN_FU');
    expect(roles).toContain('ZHENG_GUO_QU');

    const { state } = initGame({ roomCode: 'R7', seed: 7, players: mkPlayers(7) });
    expect(state.players.map((p) => p.role)).not.toContain('JI_YUN_FU');
  });

  it('T-81 6 人局身份牌不含姬云浮和郑国渠', () => {
    const roles = rolesForPlayerCount(6);
    expect(roles).toHaveLength(6);
    expect(roles).not.toContain('JI_YUN_FU');
    expect(roles).not.toContain('ZHENG_GUO_QU');

    const { state } = initGame({ roomCode: 'R6', seed: 6, players: mkPlayers(6) });
    const gotRoles = state.players.map((p) => p.role);
    expect(gotRoles).not.toContain('JI_YUN_FU');
    expect(gotRoles).not.toContain('ZHENG_GUO_QU');
    expect(state.players.filter((p) => p.camp === 'GOOD')).toHaveLength(4);
    expect(state.players.filter((p) => p.camp === 'EVIL')).toHaveLength(2);
  });

  it('T-82 6 人局仍是 12 兽首 6 真 6 假、每轮 4 件(2 真 2 假)、三轮不重复', () => {
    const { state } = initGame({ roomCode: 'R6', seed: 99, players: mkPlayers(6) });

    expect(state.beasts).toHaveLength(12);
    expect(state.beasts.filter((b) => b.isReal)).toHaveLength(6);

    expect(state.roundPools).toHaveLength(3);
    const all = state.roundPools.flat();
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12); // R-2:不重复分配
    for (const pool of state.roundPools) {
      expect(pool).toHaveLength(4);
      const real = pool.filter((id) => state.beasts[id].isReal).length;
      expect(real).toBe(2); // 每轮必定 2 真 2 假
    }
    expect(state.rounds[0].exposedBeasts).toEqual(state.roundPools[0]);
  });

  it('随机开局结构:筹码、轮空、起始玩家、阶段', () => {
    const { state, events } = initGame({ roomCode: 'R8', seed: 2024, players: mkPlayers(8) });

    expect(state.phase).toBe('ACTION');
    expect(state.currentRound).toBe(0);
    for (const p of state.players) {
      expect(p.chips).toBe(6);
      if (p.role === 'MU_HU_JIA_NAI' || p.role === 'HUANG_YAN_YAN') {
        expect([0, 1, 2]).toContain(p.blindRound);
      } else {
        expect(p.blindRound).toBeNull();
      }
    }
    const round = state.rounds[0];
    expect(round.actionOrder).toEqual([round.startPlayerId]);
    expect(round.currentActorId).toBe(round.startPlayerId);
    expect(events.some((e) => e.kind === 'PUBLIC' && e.event.t === 'ROUND_START')).toBe(true);
  });

  it('确定性:同一 seed 两次初始化得到完全相同的状态', () => {
    const a = initGame({ roomCode: 'X', seed: 12345, players: mkPlayers(8) });
    const b = initGame({ roomCode: 'X', seed: 12345, players: mkPlayers(8) });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
