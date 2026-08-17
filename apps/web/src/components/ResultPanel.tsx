import { ZODIAC } from '@antique/shared';
import { useEffect, useState } from 'react';
import { seatColor } from '../colors';
import { beastEmoji } from '../format';
import { ROLE_INFO, campName } from '../roles';
import { actions, socket, useStore } from '../store';

export default function ResultPanel() {
  const view = useStore((s) => s.view)!;
  const result = view.result;
  if (!result) return null;

  const goodWin = result.winner === 'GOOD';
  const b = result.breakdown;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '???';
  const colorOf = (id: string) => seatColor(view.players.find((p) => p.id === id)?.seat ?? 0);

  return (
    <div className="flex flex-col gap-3">
      <section
        className={`panel border-2 text-center ${goodWin ? 'border-jade-500' : 'border-seal-600'}`}
      >
        <p className="text-sm text-muted-400">{result.instantWin ? '六件真品尽数保全 · 即时胜利' : '三轮已毕,尘埃落定'}</p>
        <h2 className={`my-1 text-4xl font-black ${goodWin ? 'text-jade-500' : 'text-seal-600'}`}>
          {goodWin ? '许愿阵营 胜' : '老朝奉阵营 胜'}
        </h2>
        <p className="text-muted-400">
          许愿阵营得分 <b className="text-gold-300 text-xl">{result.score}</b> / 需 6 分
        </p>
      </section>

      <section className="panel">
        <h3 className="mb-2 border-b border-ink-600 pb-1 text-sm text-muted-400">计分明细</h3>
        <ul className="space-y-1 text-sm">
          <Row label={`保护真品 ${b.realProtected} 件`} score={`+${b.realProtected}`} />
          <Row
            label={b.xuYuanSurvivedBonus ? '老朝奉没猜中许愿' : '老朝奉猜中了许愿'}
            score={b.xuYuanSurvivedBonus ? '+2' : '+0'}
          />
          <Row
            label={b.fangZhenSurvivedBonus ? '药不然没猜中方震' : '药不然猜中了方震'}
            score={b.fangZhenSurvivedBonus ? '+1' : '+0'}
          />
          <Row
            label={b.laoChaoFengFoundBonus ? '过半好人识破老朝奉' : '好人未能过半识破老朝奉'}
            score={b.laoChaoFengFoundBonus ? '+1' : '+0'}
          />
        </ul>
      </section>

      <section className="panel">
        <h3 className="mb-2 border-b border-ink-600 pb-1 text-sm text-muted-400">身份公开</h3>
        <ul className="grid grid-cols-2 gap-1.5 text-sm">
          {result.reveal.roles.map((r) => {
            const info = ROLE_INFO[r.role];
            return (
              <li key={r.playerId} className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    info.camp === 'GOOD' ? 'bg-jade-500' : 'bg-seal-600'
                  }`}
                />
                <span className="truncate font-semibold" style={{ color: colorOf(r.playerId) }}>
                  {nameOf(r.playerId)}
                </span>
                <span className={info.camp === 'GOOD' ? 'text-jade-500' : 'text-seal-600'}>
                  {info.name}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-400">
          (绿点 = {campName('GOOD')},红点 = {campName('EVIL')})
        </p>
      </section>

      <section className="panel">
        <h3 className="mb-2 border-b border-ink-600 pb-1 text-sm text-muted-400">十二兽首全揭</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {result.reveal.beasts.map((beast) => (
            <div
              key={beast.id}
              className={`rounded-md border px-1 py-1.5 text-center ${
                beast.protectedRound !== null ? 'border-gold-700 bg-ink-700' : 'border-ink-600 bg-ink-900'
              }`}
            >
              <div className="text-2xl leading-none">{beastEmoji(beast.id)}</div>
              <div className="text-[10px] text-paper-300">{ZODIAC[beast.id]}首</div>
              <div className={`text-xs font-bold ${beast.isReal ? 'text-jade-500' : 'text-seal-600'}`}>
                {beast.isReal ? '真' : '赝'}
              </div>
              <div className="text-[10px] text-muted-400">
                {beast.protectedRound !== null ? `第${beast.protectedRound + 1}轮保护` : '未保护'}
              </div>
            </div>
          ))}
        </div>
      </section>

      <StatsSection />

      <button className="btn-ghost" onClick={actions.leaveRoom}>
        离席回大厅
      </button>
    </div>
  );
}

interface StatsRow {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  asGood: number;
  asEvil: number;
}

/** 战绩统计(Phase 5):服务端跨局累计 */
function StatsSection() {
  const [stats, setStats] = useState<{ totalGames: number; players: StatsRow[] } | null>(null);
  useEffect(() => {
    socket.emit(
      'stats:get',
      {},
      (ack: { ok: boolean; stats?: { totalGames: number; players: StatsRow[] } }) => {
        if (ack?.ok && ack.stats) setStats(ack.stats);
      },
    );
  }, []);

  if (!stats || stats.players.length === 0) return null;
  return (
    <section className="panel">
      <h3 className="mb-2 border-b border-ink-600 pb-1 text-sm text-muted-400">
        战绩榜(共 {stats.totalGames} 局)
      </h3>
      <ul className="space-y-1 text-sm">
        {stats.players.slice(0, 8).map((p) => (
          <li key={p.playerId} className="flex justify-between">
            <span className="truncate">{p.name}</span>
            <span className="text-muted-400">
              {p.wins} 胜 / {p.games} 局(好 {p.asGood} · 坏 {p.asEvil})
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, score }: { label: string; score: string }) {
  return (
    <li className="flex justify-between">
      <span>{label}</span>
      <b className={score === '+0' ? 'text-muted-400' : 'text-gold-300'}>{score}</b>
    </li>
  );
}
