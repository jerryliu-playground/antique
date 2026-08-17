import { seatColor } from '../colors';
import { useStore } from '../store';

/**
 * 顶部玩家区:4 列网格、最多两行,一屏放下不左右滚动。
 * 高亮当前行动者 / 发言者,显示已行动、剩余筹码、断线(SPEC 7.1)。
 */
export default function PlayerStrip() {
  const view = useStore((s) => s.view)!;
  const speaking = useStore((s) => s.voiceSpeaking);
  const { round } = view;
  const activeId =
    view.phase === 'ACTION'
      ? round.currentActorId
      : view.phase === 'SPEECH'
        ? round.currentSpeakerId
        : null;

  return (
    <div className="grid grid-cols-4 gap-1.5 border-b border-ink-600 bg-ink-900/60 px-2 py-1.5">
      {view.players.map((p) => {
        const isMe = p.id === view.me.id;
        const isActive = p.id === activeId;
        const color = seatColor(p.seat);
        return (
          <div
            key={p.id}
            className={`flex flex-col items-center rounded-md border px-1 py-1 ${
              isActive
                ? 'border-gold-500 bg-ink-700 shadow-[0_0_10px_rgba(201,162,39,0.35)]'
                : 'border-ink-600 bg-ink-800'
            } ${p.connected ? '' : 'opacity-40'}`}
          >
            <span
              className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-bold"
              style={{
                borderColor: color,
                color,
                boxShadow: speaking.includes(p.id) ? `0 0 8px 2px ${color}` : undefined,
              }}
            >
              {p.name.slice(0, 1)}
              {speaking.includes(p.id) && (
                <span className="absolute -right-1.5 -top-1.5 text-[10px]">🔊</span>
              )}
            </span>
            <span className="mt-0.5 w-full truncate text-center text-[10px] leading-tight" style={{ color }}>
              {p.name}
              {isMe && <span className="text-gold-500">·我</span>}
            </span>
            <span className="text-[9px] leading-tight text-muted-400">
              {p.connected ? (p.hasActed ? '已行动' : '未行动') : '断线'}·币{p.chipsRemaining}
            </span>
          </div>
        );
      })}
    </div>
  );
}
