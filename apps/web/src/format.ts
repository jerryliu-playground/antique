import { ZODIAC, type AppraisalResult, type PublicEvent } from '@antique/shared';

export const beastName = (id: number): string => `${ZODIAC[id] ?? '?'}首`;

/** 生肖 emoji(先用 emoji 顶着,以后可换成图片) */
export const ZODIAC_EMOJI = ['🐀', '🐂', '🐅', '🐇', '🐉', '🐍', '🐎', '🐐', '🐒', '🐓', '🐕', '🐖'] as const;
export const beastEmoji = (id: number): string => ZODIAC_EMOJI[id] ?? '❓';

export const shownText = (r: AppraisalResult): string =>
  r === 'REAL' ? '真' : r === 'FAKE' ? '赝' : '无法鉴定';

/** 公开事件 → 战报文案(全部走中文术语:鉴定 / 派票 / 押币 / 保护) */
export function formatEvent(ev: PublicEvent, nameOf: (id: string) => string): string {
  switch (ev.t) {
    case 'ROUND_START':
      return `—— 第 ${ev.round + 1} 轮开始,放出 ${ev.exposedBeasts
        .map(beastName)
        .join('、')},由 ${nameOf(ev.startPlayerId)} 先行动`;
    case 'TURN_START':
      return `轮到 ${nameOf(ev.playerId)} 行动(第 ${ev.index + 1} 位)`;
    case 'APPRAISED':
      return `${nameOf(ev.playerId)} 完成了鉴定`;
    case 'PASSED':
      return `${nameOf(ev.from)} 把行动权派给了 ${nameOf(ev.to)}`;
    case 'SPEECH_START':
      return `${nameOf(ev.playerId)} 开始发言`;
    case 'VOTE_SUBMITTED':
      return `${nameOf(ev.playerId)} 已提交押币`;
    case 'TALLY': {
      const entries = ev.entries.map((e) => `${beastName(e.beastId)} ${e.count} 票`).join('、');
      return `开票:${entries}。${beastName(ev.top1)}、${beastName(ev.top2)} 被保护;${beastName(
        ev.top2,
      )} 公开为「${ev.top2IsReal ? '真品' : '赝品'}」,${beastName(ev.top1)} 真伪保密`;
    }
  }
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
