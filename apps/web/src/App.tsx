import GameScreen from './components/GameScreen';
import HomeScreen from './components/HomeScreen';
import LobbyScreen from './components/LobbyScreen';
import Toasts from './components/Toasts';
import { useStore } from './store';

export default function App() {
  const screen = useStore((s) => s.screen);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ink-950 md:max-w-2xl">
      {screen === 'home' && <HomeScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && <GameScreen />}
      <Toasts />
    </div>
  );
}
