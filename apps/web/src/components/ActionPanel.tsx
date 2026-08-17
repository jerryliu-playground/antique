/** 操作区:随 phase 变化(SPEC 7.1)。所有判定在服务端,这里只发操作。 */
import { ZODIAC } from '@antique/shared';
import { useEffect, useState } from 'react';
import { beastEmoji, beastName, shownText } from '../format';
import { ROLE_INFO } from '../roles';
import { actions, useStore } from '../store';
import Name from './Name';
import PlayerPicker from './PlayerPicker';
import RevealPanel from './RevealPanel';
import VotePanel from './VotePanel';

export default function ActionPanel() {
  const view = useStore((s) => s.view)!;
  const selected = useStore((s) => s.selectedBeasts);
  const votedRounds = useStore((s) => s.votedRounds);
  const guessed = useStore((s) => s.guessed);

  const me = view.me;
  const round = view.round;
  const nameOf = (id: string | null) =>
    view.players.find((p) => p.id === id)?.name ?? '???';

  const turnKey = `${round.index}:${round.actionOrder.length}:${round.turnStep ?? ''}`;
  const [skillTarget, setSkillTarget] = useState<string | number | null>(null);
  useEffect(() => setSkillTarget(null), [turnKey]);

  // ============ 行动阶段 ============
  if (view.phase === 'ACTION') {
    const myTurn = round.currentActorId === me.id;
    if (!myTurn) {
      return (
        <section className="panel text-center text-muted-400">
          等待 <Name id={round.currentActorId} /> 行动…
          <p className="mt-1 text-xs">行动顺序:{round.actionOrder.map(nameOf).join(' → ')}</p>
        </section>
      );
    }

    const myRoundAppraisals = me.myAppraisals.filter((a) => a.round === round.index);
    const resultChips = myRoundAppraisals.length > 0 && (
      <p className="mb-2 text-sm text-paper-300">
        本轮鉴定:
        {myRoundAppraisals.map((a) => (
          <span key={a.beastId} className="ml-2 rounded bg-ink-950 px-1.5 py-0.5">
            {beastName(a.beastId)}·{shownText(a.shown)}
          </span>
        ))}
      </p>
    );

    // 步骤 1:鉴定
    if (round.turnStep === 'APPRAISE') {
      const need = me.role === 'XU_YUAN' ? 2 : me.role === 'FANG_ZHEN' ? 0 : 1;
      return (
        <section className="panel">
          <h2 className="mb-2 font-bold text-gold-300">轮到你了 · 第一步:鉴定</h2>
          {me.sniped && (
            <p className="mb-2 rounded border border-seal-600 bg-seal-600/15 px-2 py-1 text-sm text-seal-600">
              你被药不然偷袭了——本回合看什么都是「无法鉴定」,技能也被封。
            </p>
          )}
          {need === 0 ? (
            <>
              <p className="mb-3 text-sm text-muted-400">方震无法鉴定兽首,直接进入查验环节。</p>
              <button className="btn-gold w-full" onClick={() => actions.appraise([])}>
                跳过鉴定
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-400">
                在上方选 {need} 件兽首(已选 {selected.length}/{need})
              </p>
              <button
                className="btn-gold w-full"
                disabled={selected.length !== need}
                onClick={() => actions.appraise(selected)}
              >
                鉴定{selected.map((b) => beastName(b)).join('、')}
              </button>
            </>
          )}
        </section>
      );
    }

    // 步骤 2:技能
    if (round.turnStep === 'SKILL') {
      const skip = (
        <button className="btn-ghost w-full" onClick={() => actions.useSkill({ use: false })}>
          不发动,继续
        </button>
      );

      if (me.sniped) {
        return (
          <section className="panel">
            <h2 className="mb-2 font-bold text-gold-300">第二步:技能</h2>
            {resultChips}
            <p className="mb-3 text-sm text-seal-600">被偷袭中,本回合无法发动技能。</p>
            {skip}
          </section>
        );
      }

      const skillUi = (() => {
        switch (me.role) {
          case 'LAO_CHAO_FENG':
            return (
              <button
                className="btn-seal w-full"
                onClick={() => actions.useSkill({ use: true })}
              >
                发动:本轮在你之后鉴定的好人,结果真假互换
              </button>
            );
          case 'YAO_BU_RAN':
            return (
              <>
                <p className="mb-2 text-sm text-muted-400">选择偷袭目标(任意玩家):</p>
                <PlayerPicker
                  players={view.players.map((p) => ({
                    id: p.id,
                    name: p.name,
                    seat: p.seat,
                    hint: p.id === me.id ? '自己(合法)' : undefined,
                  }))}
                  selectedId={typeof skillTarget === 'string' ? skillTarget : null}
                  onSelect={(id) => setSkillTarget(id)}
                />
                <button
                  className="btn-seal mt-2 w-full"
                  disabled={typeof skillTarget !== 'string'}
                  onClick={() => actions.useSkill({ use: true, target: skillTarget as string })}
                >
                  偷袭 {typeof skillTarget === 'string' ? nameOf(skillTarget) : '…'}
                </button>
              </>
            );
          case 'FANG_ZHEN':
            return (
              <>
                <p className="mb-2 text-sm text-muted-400">选择查验目标:</p>
                <PlayerPicker
                  players={view.players
                    .filter((p) => p.id !== me.id)
                    .map((p) => ({ id: p.id, name: p.name, seat: p.seat }))}
                  selectedId={typeof skillTarget === 'string' ? skillTarget : null}
                  onSelect={(id) => setSkillTarget(id)}
                />
                <button
                  className="btn-gold mt-2 w-full"
                  disabled={typeof skillTarget !== 'string'}
                  onClick={() => actions.useSkill({ use: true, target: skillTarget as string })}
                >
                  查验 {typeof skillTarget === 'string' ? nameOf(skillTarget) : '…'} 的阵营
                </button>
              </>
            );
          case 'ZHENG_GUO_QU':
            return (
              <>
                <p className="mb-2 text-sm text-muted-400">选择要覆盖的兽首(本轮之后的人鉴它只见「无法鉴定」):</p>
                <div className="mb-2 grid grid-cols-4 gap-2">
                  {round.exposedBeasts.map((b) => (
                    <button
                      key={b}
                      onClick={() => setSkillTarget(b)}
                      className={`flex flex-col items-center rounded-md border-2 py-1.5 ${
                        skillTarget === b
                          ? 'border-gold-500 bg-ink-700 text-gold-300'
                          : 'border-ink-600 bg-ink-800'
                      }`}
                    >
                      <span className="text-2xl leading-none">{beastEmoji(b)}</span>
                      <span className="mt-0.5 text-[10px]">{ZODIAC[b]}首</span>
                    </button>
                  ))}
                </div>
                <button
                  className="btn-seal w-full"
                  disabled={typeof skillTarget !== 'number'}
                  onClick={() => actions.useSkill({ use: true, target: skillTarget as number })}
                >
                  覆盖{typeof skillTarget === 'number' ? beastName(skillTarget) : '…'}
                </button>
              </>
            );
          default:
            return <p className="mb-3 text-sm text-muted-400">{ROLE_INFO[me.role].name}没有主动技能。</p>;
        }
      })();

      return (
        <section className="panel">
          <h2 className="mb-2 font-bold text-gold-300">第二步:技能</h2>
          {resultChips}
          <div className="flex flex-col gap-2">{skillUi}{skip}</div>
        </section>
      );
    }

    // 步骤 3:派票
    const candidates = view.players.filter((p) => !p.hasActed && p.id !== me.id);
    return (
      <section className="panel">
        <h2 className="mb-2 font-bold text-gold-300">第三步:派票</h2>
        {resultChips}
        <p className="mb-2 text-sm text-muted-400">指定下一个行动的人(点击即派):</p>
        <PlayerPicker
          players={candidates.map((p) => ({ id: p.id, name: p.name, seat: p.seat, hint: '尚未行动' }))}
          onSelect={(id) => actions.passTurn(id)}
        />
      </section>
    );
  }

  // ============ 发言阶段 ============
  if (view.phase === 'SPEECH') {
    const mySpeech = round.currentSpeakerId === me.id;
    return (
      <section className="panel text-center">
        {mySpeech ? (
          <>
            <h2 className="mb-2 font-bold text-gold-300">该你发言了(绝对发言,无人可打断)</h2>
            <button className="btn-gold w-full" onClick={actions.endSpeech}>
              结束发言
            </button>
          </>
        ) : (
          <p className="text-muted-400">
            <Name id={round.currentSpeakerId} /> 正在发言,请勿插话…
          </p>
        )}
      </section>
    );
  }

  // ============ 押币阶段 ============
  if (view.phase === 'VOTING') {
    if (votedRounds.includes(round.index)) {
      return (
        <section className="panel text-center text-muted-400">已提交押币,等待其他人暗投…</section>
      );
    }
    return <VotePanel />;
  }

  // ============ 开票展示 ============
  if (view.phase === 'REVEAL') {
    return <RevealPanel />;
  }

  // ============ 身份揭示 ============
  if (view.phase === 'IDENTITY') {
    if (me.role === 'ZHENG_GUO_QU') {
      return (
        <section className="panel text-center text-muted-400">
          郑国渠不参与指认,等待众人落笔…
        </section>
      );
    }
    if (guessed) {
      return <section className="panel text-center text-muted-400">已指认,等待其他人…</section>;
    }
    const prompt =
      me.role === 'LAO_CHAO_FENG'
        ? '指认你认为的「许愿」'
        : me.role === 'YAO_BU_RAN'
          ? '指认你认为的「方震」'
          : '指认你认为的「老朝奉」';
    return (
      <section className="panel">
        <h2 className="mb-2 font-bold text-gold-300">身份揭示 · {prompt}</h2>
        <PlayerPicker
          players={view.players
            .filter((p) => p.id !== me.id)
            .map((p) => ({ id: p.id, name: p.name, seat: p.seat }))}
          selectedId={typeof skillTarget === 'string' ? skillTarget : null}
          onSelect={(id) => setSkillTarget(id)}
        />
        <button
          className="btn-gold mt-2 w-full"
          disabled={typeof skillTarget !== 'string'}
          onClick={() => actions.guessIdentity(skillTarget as string)}
        >
          落笔指认 {typeof skillTarget === 'string' ? nameOf(skillTarget) : '…'}
        </button>
      </section>
    );
  }

  return null;
}
