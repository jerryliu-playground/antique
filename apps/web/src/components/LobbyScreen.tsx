import { useState } from 'react';
import { seatColor } from '../colors';
import { actions, useStore } from '../store';
import { VoiceButton } from './VoiceControls';

export default function LobbyScreen() {
  const lobby = useStore((s) => s.lobby);
  const playerId = useStore((s) => s.playerId);
  if (!lobby) {
    return <div className="flex flex-1 items-center justify-center text-muted-400">进入房间中…</div>;
  }

  const isHost = lobby.hostId === playerId;
  const canStart = lobby.members.length >= 6 && lobby.members.length <= 8;

  return (
    <div className="flex flex-1 flex-col gap-5 px-6 py-8">
      <header className="text-center">
        <p className="text-sm text-muted-400">房号(念给朋友)</p>
        <p className="my-1 text-5xl font-black tracking-[0.25em] text-gold-300">{lobby.roomCode}</p>
        <p className="text-xs text-muted-400">凑齐 6–8 人开局 · 当前 {lobby.members.length} 人</p>
        <div className="mt-2 flex justify-center">
          <VoiceButton />
        </div>
      </header>

      <div className="panel">
        <h2 className="mb-2 border-b border-ink-600 pb-2 text-sm text-muted-400">
          在座诸位{isHost && <span className="ml-2 text-xs">(↑↓ 换座 · ✕ 请离)</span>}
        </h2>
        <ul className="flex flex-col gap-2">
          {lobby.members.map((m) => (
            <li key={m.playerId} className="flex items-center gap-2 py-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: m.connected ? seatColor(m.seat) : '#5a4a3a' }}
              />
              <span className="flex-1 truncate text-lg font-semibold" style={{ color: seatColor(m.seat) }}>
                {m.name}
                {m.playerId === playerId && <span className="ml-2 text-xs text-gold-500">(我)</span>}
                {!m.connected && <span className="ml-2 text-xs text-muted-400">(断线)</span>}
              </span>
              {m.playerId === lobby.hostId && (
                <span className="rounded border border-gold-700 px-1.5 py-0.5 text-xs text-gold-500">
                  房主
                </span>
              )}
              {isHost && (
                <span className="flex gap-1">
                  <button
                    className="btn-ghost h-8 w-8 !p-0 text-sm"
                    onClick={() => actions.moveSeat(m.playerId, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn-ghost h-8 w-8 !p-0 text-sm"
                    onClick={() => actions.moveSeat(m.playerId, 1)}
                  >
                    ↓
                  </button>
                  {m.playerId !== playerId && (
                    <button
                      className="btn-ghost h-8 w-8 !p-0 text-sm text-seal-600"
                      onClick={() => actions.kick(m.playerId)}
                    >
                      ✕
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost && <TimerSettings key={JSON.stringify(lobby.timersMs)} timersMs={lobby.timersMs} />}

      {isHost ? (
        <button className="btn-gold text-lg" disabled={!canStart} onClick={actions.startGame}>
          {canStart ? '开局!' : `还差 ${Math.max(0, 6 - lobby.members.length)} 人开局`}
        </button>
      ) : (
        <p className="text-center text-muted-400">等房主开局…</p>
      )}

      <button className="btn-ghost" onClick={actions.leaveRoom}>
        离席
      </button>
    </div>
  );
}

const TIMER_FIELDS = [
  { key: 'action', label: '行动(单人回合)' },
  { key: 'speech', label: '发言(单人)' },
  { key: 'voting', label: '押币' },
  { key: 'reveal', label: '开票展示' },
  { key: 'identity', label: '身份揭示' },
] as const;

/** 房主设置:各阶段计时,单位秒(SPEC 5.2:时长写在房间配置里,房主可调) */
function TimerSettings({ timersMs }: { timersMs: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState<Record<string, number>>(() =>
    Object.fromEntries(TIMER_FIELDS.map((f) => [f.key, Math.round((timersMs[f.key] ?? 0) / 1000)])),
  );

  return (
    <div className="panel">
      <button
        className="flex w-full items-center justify-between text-sm text-muted-400"
        onClick={() => setOpen((o) => !o)}
      >
        <span>房主设置 · 各阶段计时(秒)</span>
        <span>{open ? '收起 ▲' : '展开 ▼'}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {TIMER_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-3 text-sm">
              <span className="flex-1">{f.label}</span>
              <input
                type="number"
                min={5}
                max={600}
                className="field !w-24 text-center"
                value={seconds[f.key]}
                onChange={(e) =>
                  setSeconds((s) => ({ ...s, [f.key]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
          <button
            className="btn-gold mt-1"
            onClick={() =>
              actions.saveTimers(
                Object.fromEntries(
                  Object.entries(seconds).map(([k, v]) => [k, Math.max(5, v) * 1000]),
                ),
              )
            }
          >
            保存计时设置
          </button>
        </div>
      )}
    </div>
  );
}
