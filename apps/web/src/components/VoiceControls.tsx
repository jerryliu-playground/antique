/** 顶栏麦克风(SPEC 7.1)+ 举手 ✋(SPEC 6.2)+ 自动播放拦截恢复 */
import { actions, useStore } from '../store';
import { resumeAudio, setMicWanted, startVoice } from '../voice';
import Name from './Name';

export function VoiceButton() {
  const enabled = useStore((s) => s.voiceEnabled);
  const status = useStore((s) => s.voiceStatus);
  const canSpeak = useStore((s) => s.voiceCanSpeak);
  const wantMic = useStore((s) => s.voiceWantMic);
  const hands = useStore((s) => s.voiceHands);
  const peers = useStore((s) => s.voicePeers);
  const audioBlocked = useStore((s) => s.voiceAudioBlocked);
  const micError = useStore((s) => s.voiceMicError);
  const playerId = useStore((s) => s.playerId);
  const view = useStore((s) => s.view);

  if (enabled === false) {
    return (
      <span className="text-sm opacity-50" title="语音未配置,建议开个 Discord(SPEC 6.4 降级)">
        🔇
      </span>
    );
  }
  if (enabled === null) return null; // 还没收到 voice:token

  if (status === 'off' || status === 'error') {
    return (
      <button
        className="rounded border border-gold-700 px-2 py-0.5 text-xs text-gold-300"
        onClick={() => void startVoice()}
      >
        🎙 开启语音
      </button>
    );
  }
  if (status === 'connecting') return <span className="text-sm">🎙…</span>;

  // 浏览器拦截了远端音频:这颗按钮的点击处理器里同步调 startAudio 才能解锁
  if (audioBlocked) {
    return (
      <button
        className="animate-pulse rounded border border-seal-600 bg-seal-600/20 px-2 py-0.5 text-xs font-bold text-seal-600"
        onClick={resumeAudio}
      >
        🔊 点此恢复声音
      </button>
    );
  }

  const handUp = playerId !== null && hands.includes(playerId);
  const inGame = view !== null && view.phase !== 'FINISHED';

  return (
    <span className="flex items-center gap-1.5">
      <button
        className="text-base"
        title={
          micError
            ? `麦克风不可用:${micError}`
            : canSpeak
              ? wantMic
                ? '麦克风开着,点击自我静音'
                : '已自我静音,点击开麦'
              : '当前阶段轮不到你说话(麦序由服务端控制)'
        }
        onClick={() => void setMicWanted(!wantMic)}
      >
        {micError ? '⚠️' : canSpeak ? (wantMic ? '🎙' : '🤐') : '🔇'}
      </button>
      <span className="text-[10px] text-muted-400" title="语音房里的人数">
        ×{peers}
      </span>
      {inGame && !canSpeak && (
        <button
          className={`rounded border px-1.5 py-0.5 text-xs ${
            handUp ? 'border-gold-500 text-gold-300' : 'border-ink-600 text-muted-400'
          }`}
          title="举手要麦:当前发言者或房主可以临时给你开麦"
          onClick={() => actions.raiseHand(!handUp)}
        >
          ✋{handUp ? '已举手' : '举手'}
        </button>
      )}
    </span>
  );
}

/** 举手名单条:当前发言者或房主可以点名给麦 */
export function HandsBar() {
  const hands = useStore((s) => s.voiceHands);
  const view = useStore((s) => s.view);
  const lobby = useStore((s) => s.lobby);
  const playerId = useStore((s) => s.playerId);

  if (hands.length === 0) return null;
  const canGrant =
    playerId !== null &&
    (lobby?.hostId === playerId || view?.round.currentSpeakerId === playerId);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-600 bg-ink-900/80 px-3 py-1.5 text-xs">
      <span className="text-muted-400">✋ 举手:</span>
      {hands.map((pid) =>
        canGrant ? (
          <button
            key={pid}
            className="rounded border border-gold-700 px-1.5 py-0.5"
            onClick={() => actions.grantMic(pid)}
          >
            给 <Name id={pid} /> 开麦
          </button>
        ) : (
          <Name key={pid} id={pid} />
        ),
      )}
    </div>
  );
}
