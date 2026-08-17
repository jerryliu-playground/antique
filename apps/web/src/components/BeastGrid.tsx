import { ZODIAC, type BeastId } from '@antique/shared';
import { beastEmoji } from '../format';
import { actions, useStore } from '../store';

/** 本轮 4 件兽首大卡片:我鉴过的显示结果,已公开的显示真/赝角标(SPEC 7.1) */
export default function BeastGrid() {
  const view = useStore((s) => s.view)!;
  const selected = useStore((s) => s.selectedBeasts);

  const round = view.round;
  const me = view.me;
  const myAppraiseStep =
    view.phase === 'ACTION' && round.currentActorId === me.id && round.turnStep === 'APPRAISE';
  const maxSelect = me.role === 'XU_YUAN' ? 2 : me.role === 'FANG_ZHEN' ? 0 : 1;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {round.exposedBeasts.map((id) => (
        <BeastCard
          key={id}
          id={id}
          selectable={myAppraiseStep && maxSelect > 0}
          selected={selected.includes(id)}
          onToggle={() => actions.toggleBeast(id, maxSelect)}
        />
      ))}
    </div>
  );
}

function BeastCard(props: {
  id: BeastId;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const { id, selectable, selected, onToggle } = props;
  const view = useStore((s) => s.view)!;

  const pub = view.publicBeasts.find((b) => b.id === id);
  const protectedSecret = view.protectedUnknown.includes(id);
  const mine = view.me.myAppraisals.find(
    (a) => a.round === view.round.index && a.beastId === id,
  );
  const revealing = view.phase === 'REVEAL';

  return (
    <button
      disabled={!selectable}
      onClick={onToggle}
      className={`relative flex h-32 flex-col items-center justify-center rounded-lg border-2 transition ${
        selected
          ? 'border-gold-500 bg-ink-700 shadow-[0_0_14px_rgba(201,162,39,0.45)]'
          : 'border-ink-600 bg-ink-800'
      } ${selectable ? 'active:scale-95' : ''}`}
    >
      <span className="text-5xl leading-none">{beastEmoji(id)}</span>
      <span className="mt-1.5 text-sm font-bold tracking-widest text-paper-300">{ZODIAC[id]}首</span>

      {/* 我这轮看到的结果 */}
      {mine && (
        <span className="absolute left-1.5 top-1.5 rounded bg-ink-950/80 px-1.5 py-0.5 text-[10px] text-paper-300">
          我见:{mine.shown === 'REAL' ? '真' : mine.shown === 'FAKE' ? '赝' : '无法鉴定'}
        </span>
      )}

      {/* 已公开真伪:盖章 */}
      {pub && (
        <span
          className={`absolute right-1.5 top-1.5 ${pub.isReal ? 'stamp-real' : 'stamp-fake'} ${
            revealing ? 'stamp-in' : ''
          }`}
        >
          {pub.isReal ? '真' : '赝'}
        </span>
      )}

      {/* 已保护但真伪保密 */}
      {protectedSecret && (
        <span className="absolute right-1.5 top-1.5 rounded-sm border-2 border-gold-700 px-1 py-0.5 text-[10px] font-bold text-gold-500">
          保护·秘
        </span>
      )}

      {selectable && (
        <span className="absolute bottom-1.5 text-[10px] text-muted-400">
          {selected ? '已选,点按取消' : '点按选择鉴定'}
        </span>
      )}
    </button>
  );
}
