/** 底部抽屉:我的身份牌 · 我的鉴定历史 · 公开战报 · 十二兽首总览(SPEC 7.1/7.2) */
import { ZODIAC } from '@antique/shared';
import { seatColor } from '../colors';
import { beastEmoji, beastName, shownText } from '../format';
import { ROLE_INFO, campName } from '../roles';
import { actions, useStore } from '../store';

const TABS = [
  { key: 'identity', label: '身份' },
  { key: 'history', label: '鉴定史' },
  { key: 'log', label: '战报' },
  { key: 'beasts', label: '总览' },
] as const;

export default function Drawer() {
  const tab = useStore((s) => s.drawerTab);
  return (
    <>
      {tab && (
        <div className="fixed inset-x-0 bottom-12 z-40 mx-auto max-h-[60dvh] max-w-md overflow-y-auto border-t border-gold-700 bg-ink-900 px-4 py-3 shadow-2xl md:max-w-2xl">
          {tab === 'identity' && <IdentityTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'log' && <LogTab />}
          {tab === 'beasts' && <BeastsTab />}
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md border-t border-ink-600 bg-ink-900 md:max-w-2xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`flex-1 py-3 text-sm font-semibold ${
              tab === t.key ? 'bg-ink-700 text-gold-300' : 'text-muted-400'
            }`}
            onClick={() => actions.setDrawer(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}

function IdentityTab() {
  const view = useStore((s) => s.view)!;
  const me = view.me;
  const info = ROLE_INFO[me.role];
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '???';
  const colorOf = (id: string) => seatColor(view.players.find((p) => p.id === id)?.seat ?? 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3">
        <h3 className="text-2xl font-black text-gold-300">{info.name}</h3>
        <span className={info.camp === 'GOOD' ? 'text-jade-500' : 'text-seal-600'}>
          {campName(info.camp)}
        </span>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-paper-300">{info.skill}</p>

      {me.knownTeammates.length > 0 && (
        <p className="mb-2 rounded border border-seal-600/50 bg-seal-600/10 px-2 py-1.5 text-sm">
          你的同伙:
          {me.knownTeammates.map((t) => (
            <b key={t.id} className="ml-1" style={{ color: colorOf(t.id) }}>
              {nameOf(t.id)}({ROLE_INFO[t.role].name})
            </b>
          ))}
        </p>
      )}
      {me.permanentlyBlinded && (
        <p className="mb-2 text-sm text-seal-600">你已被偷袭,整局永久失去鉴定能力。</p>
      )}

      {me.myInvestigations.length > 0 && (
        <>
          <h4 className="mb-1 mt-3 text-sm text-muted-400">查验记录</h4>
          <ul className="space-y-1 text-sm">
            {me.myInvestigations.map((iv, i) => (
              <li key={i}>
                第 {iv.round + 1} 轮:<b style={{ color: colorOf(iv.targetId) }}>{nameOf(iv.targetId)}</b> →{' '}
                <b className={iv.camp === 'GOOD' ? 'text-jade-500' : 'text-seal-600'}>
                  {campName(iv.camp)}
                </b>
              </li>
            ))}
          </ul>
        </>
      )}

      {me.mySkillHistory.length > 0 && (
        <>
          <h4 className="mb-1 mt-3 text-sm text-muted-400">技能记录</h4>
          <ul className="space-y-1 text-sm text-paper-300">
            {me.mySkillHistory.map((h, i) => (
              <li key={i}>
                第 {h.round + 1} 轮:
                {h.skill === 'FLIP' && '发动了真假互换'}
                {h.skill === 'SNIPE' && `偷袭了 ${nameOf(h.targetPlayerId ?? '')}`}
                {h.skill === 'INVESTIGATE' && `查验了 ${nameOf(h.targetPlayerId ?? '')}`}
                {h.skill === 'COVER' && h.targetBeastId !== undefined && `覆盖了 ${beastName(h.targetBeastId)}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function HistoryTab() {
  const view = useStore((s) => s.view)!;
  const logs = view.me.myAppraisals;
  if (logs.length === 0) {
    return <p className="text-sm text-muted-400">还没有鉴定记录。</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {logs.map((a, i) => (
        <li key={i} className="flex justify-between border-b border-ink-800 pb-1">
          <span>
            第 {a.round + 1} 轮 · {beastName(a.beastId)}
          </span>
          <b
            className={
              a.shown === 'REAL'
                ? 'text-jade-500'
                : a.shown === 'FAKE'
                  ? 'text-seal-600'
                  : 'text-muted-400'
            }
          >
            {shownText(a.shown)}
          </b>
        </li>
      ))}
    </ul>
  );
}

function LogTab() {
  const logs = useStore((s) => s.logs);
  if (logs.length === 0) return <p className="text-sm text-muted-400">暂无战报。</p>;
  return (
    <ul className="space-y-1 text-xs leading-relaxed text-paper-300">
      {[...logs].reverse().map((l, i) => (
        <li key={i} className={l.startsWith('——') ? 'pt-1 text-gold-500' : ''}>
          {l}
        </li>
      ))}
    </ul>
  );
}

function BeastsTab() {
  const view = useStore((s) => s.view)!;
  const roundBeasts = useStore((s) => s.roundBeasts);

  const status = (rawId: number): { text: string; cls: string } => {
    const id = rawId as import('@antique/shared').BeastId;
    const pub = view.publicBeasts.find((b) => b.id === id);
    if (pub) return pub.isReal ? { text: '公开·真', cls: 'text-jade-500' } : { text: '公开·赝', cls: 'text-seal-600' };
    if (view.protectedUnknown.includes(id)) return { text: '保护·秘', cls: 'text-gold-500' };
    if (view.round.exposedBeasts.includes(id)) return { text: '本轮在场', cls: 'text-paper-300' };
    const seenBefore = Object.entries(roundBeasts).some(
      ([r, list]) => Number(r) < view.round.index && list.includes(id),
    );
    if (seenBefore) return { text: '已出局', cls: 'text-muted-400 line-through' };
    return { text: '未现世', cls: 'text-muted-400' };
  };

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ZODIAC.map((z, id) => {
        const st = status(id);
        return (
          <div key={id} className="rounded-md border border-ink-600 bg-ink-800 px-1 py-1.5 text-center">
            <div className="text-2xl leading-none">{beastEmoji(id)}</div>
            <div className="text-[10px] text-paper-300">{z}首</div>
            <div className={`text-[10px] ${st.cls}`}>{st.text}</div>
          </div>
        );
      })}
    </div>
  );
}
