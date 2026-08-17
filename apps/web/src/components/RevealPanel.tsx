import { beastEmoji, beastName } from '../format';
import { useStore } from '../store';

/** 开票瞬间:逐票展开的计数条(SPEC 7.2:全场情绪高点) */
export default function RevealPanel() {
  const view = useStore((s) => s.view)!;
  const tally = view.round.tally;
  if (!tally) return null;

  const max = Math.max(1, ...tally.map((t) => t.count));
  const top1 = tally[0]?.beastId;
  const top2 = tally[1]?.beastId;

  return (
    <section className="panel">
      <h2 className="mb-3 font-bold text-gold-300">开票!</h2>
      <div className="flex flex-col gap-3">
        {tally.map((t, i) => {
          const pub = view.publicBeasts.find((b) => b.id === t.beastId);
          const isTop1 = t.beastId === top1;
          const isTop2 = t.beastId === top2;
          return (
            <div key={t.beastId}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-paper-100">
                  {beastEmoji(t.beastId)} {beastName(t.beastId)}
                  {isTop1 && <span className="ml-2 text-xs text-gold-500">第 1 名 · 保护 · 真伪保密</span>}
                  {isTop2 && (
                    <span className={`ml-2 text-xs ${pub?.isReal ? 'text-jade-500' : 'text-seal-600'}`}>
                      第 2 名 · 保护 · 公开为「{pub?.isReal ? '真品' : '赝品'}」
                    </span>
                  )}
                </span>
                <span className="text-gold-300">{t.count} 票</span>
              </div>
              <div className="h-3 rounded-sm bg-ink-950">
                <div
                  className={`tally-bar h-3 rounded-sm ${
                    isTop1 || isTop2 ? 'bg-gold-500' : 'bg-ink-600'
                  }`}
                  style={{
                    width: `${Math.max(4, (t.count / max) * 100)}%`,
                    animationDelay: `${i * 0.45}s`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-muted-400">稍候自动进入下一阶段…</p>
    </section>
  );
}
