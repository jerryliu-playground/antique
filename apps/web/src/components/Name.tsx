import { seatColor } from '../colors';
import { useStore } from '../store';

/** 带座位色的玩家名 */
export default function Name({ id }: { id: string | null }) {
  const view = useStore((s) => s.view);
  const lobby = useStore((s) => s.lobby);
  if (!id) return <b>???</b>;
  const p = view?.players.find((x) => x.id === id);
  const m = lobby?.members.find((x) => x.playerId === id);
  const seat = p?.seat ?? m?.seat ?? 0;
  const name = p?.name ?? m?.name ?? '???';
  return <b style={{ color: seatColor(seat) }}>{name}</b>;
}
