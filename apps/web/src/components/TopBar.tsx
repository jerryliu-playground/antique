import { PHASE_NAME } from '../roles';
import { useStore } from '../store';
import Countdown from './Countdown';
import { VoiceButton } from './VoiceControls';

export default function TopBar() {
  const view = useStore((s) => s.view)!;
  const connected = useStore((s) => s.connected);

  return (
    <header className="flex items-center gap-2.5 border-b border-ink-600 bg-ink-900 px-3 py-2">
      <span
        className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-jade-500' : 'bg-seal-600'}`}
        title={connected ? '已连接' : '连接中断,重连中…'}
      />
      <span className="text-sm tracking-widest text-muted-400">{view.roomCode}</span>
      <span className="flex-1 text-center font-bold text-gold-300">
        第 {view.round.index + 1} 轮 · {PHASE_NAME[view.phase]}
      </span>
      <VoiceButton />
      <Countdown deadline={view.deadline} />
    </header>
  );
}
