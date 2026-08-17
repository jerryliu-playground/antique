import { useEffect, useState } from 'react';
import { fmtClock } from '../format';

/** 只做倒计时显示,判定一律在服务端(SPEC 5.2) */
export default function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (deadline === null) return null;
  const remain = deadline - now;
  return (
    <span className={`tabular-nums ${remain < 15_000 ? 'text-seal-600' : 'text-paper-300'}`}>
      {fmtClock(remain)}
    </span>
  );
}
