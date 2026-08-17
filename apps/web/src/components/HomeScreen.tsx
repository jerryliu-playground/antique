import { useState } from 'react';
import { actions, useStore } from '../store';

export default function HomeScreen() {
  const connected = useStore((s) => s.connected);
  const name = useStore((s) => s.name);
  const [code, setCode] = useState('');

  const nameOk = name.trim().length > 0;

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-10">
      <header className="text-center">
        <p className="mb-2 tracking-[0.5em] text-muted-400">十二兽首 · 六真六赝</p>
        <h1 className="text-5xl font-black tracking-widest text-gold-300">古董局中局</h1>
        <p className="mt-3 text-sm text-muted-400">6–8 人 · 身份推理 · 三轮定局</p>
      </header>

      <div className="panel flex flex-col gap-3">
        <label className="text-sm text-muted-400">你的名号</label>
        <input
          className="field"
          value={name}
          maxLength={12}
          placeholder="报上名来"
          onChange={(e) => actions.setName(e.target.value)}
        />

        <button
          className="btn-gold mt-2"
          disabled={!nameOk || !connected}
          onClick={() => void actions.createRoom(name.trim())}
        >
          开设新局(当房主)
        </button>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-ink-600" />
          <span className="text-xs text-muted-400">或凭房号入局</span>
          <div className="h-px flex-1 bg-ink-600" />
        </div>

        <div className="flex gap-2">
          <input
            className="field flex-1 tracking-[0.3em]"
            value={code}
            inputMode="numeric"
            maxLength={6}
            placeholder="6 位房号"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            className="btn-ghost"
            disabled={!nameOk || code.length !== 6 || !connected}
            onClick={() => void actions.joinRoom(code, name.trim())}
          >
            入局
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-400">
        {connected ? '已连上茶馆掌柜' : '正在连接服务器…'}
      </p>
    </div>
  );
}
