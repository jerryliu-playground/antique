import { seatColor } from '../colors';

/** 手机上"派票 / 选人"要好按:玩家做成大按钮,带座位色(SPEC 7.2) */
export interface PickablePlayer {
  id: string;
  name: string;
  seat?: number;
  hint?: string;
  disabled?: boolean;
}

export default function PlayerPicker(props: {
  players: PickablePlayer[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const { players, selectedId, onSelect } = props;
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((p) => {
        const color = p.seat !== undefined ? seatColor(p.seat) : undefined;
        const isSelected = selectedId === p.id;
        return (
          <button
            key={p.id}
            disabled={p.disabled}
            onClick={() => onSelect(p.id)}
            className={`flex min-h-14 flex-col items-center justify-center rounded-md border-2 px-2 py-2 text-base font-semibold transition active:scale-95 disabled:opacity-35 ${
              isSelected ? 'border-gold-500 bg-ink-700' : 'border-ink-600 bg-ink-800'
            }`}
            style={color ? { color, borderColor: isSelected ? undefined : `${color}55` } : undefined}
          >
            <span>{p.name}</span>
            {p.hint && <span className="text-[10px] font-normal text-muted-400">{p.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
