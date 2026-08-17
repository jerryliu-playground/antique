import { useStore } from '../store';
import ActionPanel from './ActionPanel';
import BeastGrid from './BeastGrid';
import Drawer from './Drawer';
import PlayerStrip from './PlayerStrip';
import ResultPanel from './ResultPanel';
import TopBar from './TopBar';
import { HandsBar } from './VoiceControls';

export default function GameScreen() {
  const view = useStore((s) => s.view);
  if (!view) {
    return <div className="flex flex-1 items-center justify-center text-muted-400">恢复对局中…</div>;
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <HandsBar />
      <PlayerStrip />
      <main className="flex-1 space-y-3 overflow-y-auto px-3 pb-40 pt-3">
        {view.phase === 'FINISHED' ? (
          <ResultPanel />
        ) : (
          <>
            <BeastGrid />
            <ActionPanel />
          </>
        )}
      </main>
      <Drawer />
    </div>
  );
}
