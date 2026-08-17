import { useState } from 'react';
import { beastEmoji, beastName } from '../format';
import { actions, useStore } from '../store';

/** 押币:4 个 +/- 计数器 + 剩余筹码(SPEC 7.1)。同时暗投,提交后不可改。 */
export default function VotePanel() {
  const view = useStore((s) => s.view)!;
  const round = view.round;
  const [dist, setDist] = useState<Record<number, number>>({});

  const spentBefore = 6 - view.me.chips;
  const available = 2 * (round.index + 1) - spentBefore;
  const used = Object.values(dist).reduce((a, b) => a + b, 0);
  const left = available - used;

  const bump = (beastId: number, delta: number) => {
    setDist((d) => {
      const next = Math.max(0, (d[beastId] ?? 0) + delta);
      if (delta > 0 && left <= 0) return d;
      return { ...d, [beastId]: next };
    });
  };

  return (
    <section className="panel">
      <h2 className="mb-1 font-bold text-gold-300">押币护宝(暗投)</h2>
      <p className="mb-3 text-sm text-muted-400">
        本轮可投 <b className="text-gold-300">{available}</b> 枚,已分配 {used},剩 {left}。
        票数前二的兽首将被保护;没用完的自动攒到下一轮。
      </p>
      <div className="flex flex-col gap-2">
        {round.exposedBeasts.map((b) => (
          <div key={b} className="flex items-center gap-3 rounded-md border border-ink-600 bg-ink-900 px-3 py-2">
            <span className="flex-1 text-lg">
              {beastEmoji(b)} {beastName(b)}
            </span>
            <button
              className="btn-ghost h-10 w-10 !p-0 text-xl"
              disabled={(dist[b] ?? 0) === 0}
              onClick={() => bump(b, -1)}
            >
              −
            </button>
            <span className="w-8 text-center text-xl font-bold text-gold-300">{dist[b] ?? 0}</span>
            <button
              className="btn-ghost h-10 w-10 !p-0 text-xl"
              disabled={left <= 0}
              onClick={() => bump(b, +1)}
            >
              +
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn-gold mt-3 w-full"
        onClick={() =>
          actions.submitVote(Object.fromEntries(Object.entries(dist).filter(([, v]) => v > 0)))
        }
      >
        {used === 0 ? '本轮不押,直接提交' : `提交(共 ${used} 枚)`}
      </button>
    </section>
  );
}
