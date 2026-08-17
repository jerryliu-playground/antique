/**
 * 自动打完整局的机器人客户端:只依赖 state:sync 下发的 PersonalView 行动,
 * 和真实前端拿到的信息完全一致(顺带验证 PersonalView 足够驱动完整对局)。
 */
import type { GameResult, PersonalView } from '@antique/shared';
import type { Socket } from 'socket.io-client';

export class Bot {
  view: PersonalView | null = null;
  result: GameResult | null = null;
  active = true;
  errors: { code: string; message: string }[] = [];

  private sentKeys = new Set<string>();

  constructor(
    public socket: Socket,
    public readonly playerId: string,
  ) {
    this.listen(socket);
  }

  /** 断线重连后换新 socket 继续(清掉去重键,凭全量视图重新决策) */
  attach(socket: Socket): void {
    this.socket = socket;
    this.sentKeys.clear();
    this.listen(socket);
  }

  private listen(socket: Socket): void {
    socket.on('state:sync', (view: PersonalView) => {
      this.view = view;
      this.tick();
    });
    socket.on('error', (e: { code: string; message: string }) => {
      // 重连后的重复提交(ALREADY_*)属正常噪音,记录下来供测试断言其余错误
      this.errors.push(e);
    });
  }

  private once(key: string): boolean {
    if (this.sentKeys.has(key)) return false;
    this.sentKeys.add(key);
    return true;
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  tick(): void {
    const v = this.view;
    if (!v || !this.active) return;

    if (v.phase === 'FINISHED') {
      this.result = v.result;
      return;
    }

    if (v.phase === 'ACTION' && v.round.currentActorId === this.playerId && v.round.turnStep) {
      const key = `A${v.round.index}:${v.round.actionOrder.length}:${v.round.turnStep}`;
      if (!this.once(key)) return;
      if (v.round.turnStep === 'APPRAISE') {
        const count = v.me.role === 'XU_YUAN' ? 2 : v.me.role === 'FANG_ZHEN' ? 0 : 1;
        const done = new Set(
          v.me.myAppraisals.filter((a) => a.round === v.round.index).map((a) => a.beastId),
        );
        const beastIds = v.round.exposedBeasts.filter((b) => !done.has(b)).slice(0, count);
        this.socket.emit('action:appraise', { beastIds });
      } else if (v.round.turnStep === 'SKILL') {
        this.socket.emit('action:skill', { use: false });
      } else {
        const candidates = v.players.filter((p) => !p.hasActed && p.id !== this.playerId);
        if (candidates.length > 0) {
          this.socket.emit('action:pass', { targetPlayerId: this.pick(candidates).id });
        }
      }
      return;
    }

    if (v.phase === 'SPEECH' && v.round.currentSpeakerId === this.playerId) {
      if (this.once(`S${v.round.index}:${this.playerId}`)) {
        this.socket.emit('speech:end', {});
      }
      return;
    }

    if (v.phase === 'VOTING') {
      if (this.once(`V${v.round.index}`)) {
        const spent = 6 - v.me.chips;
        const available = 2 * (v.round.index + 1) - spent;
        const distribution: Record<number, number> = {};
        if (available > 0 && Math.random() < 0.8) {
          const amount = Math.min(available, 1 + Math.floor(Math.random() * 2));
          distribution[this.pick(v.round.exposedBeasts)] = amount;
        }
        this.socket.emit('vote:submit', { distribution });
      }
      return;
    }

    if (v.phase === 'IDENTITY') {
      if (v.me.role === 'ZHENG_GUO_QU') return; // 郑国渠不指认
      if (this.once('I')) {
        const others = v.players.filter((p) => p.id !== this.playerId);
        this.socket.emit('identity:guess', { targetPlayerId: this.pick(others).id });
      }
      return;
    }
  }
}
