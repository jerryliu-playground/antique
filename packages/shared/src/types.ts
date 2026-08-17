/**
 * 全部类型定义。规则以 SPEC.md 第 1 节为唯一事实来源。
 *
 * 相对 SPEC 第 2 节的少量补充(均已注明理由):
 * - `Player.snipedConsumedThisTurn`:SPEC 3.2/3.4 的伪代码直接引用了该标记,故落到类型上
 * - `RoundState.turnStep`:行动回合内部的三步(鉴定→技能→派票)需要显式状态机
 * - `GameState.roundPools`:R-2 开局一次性分配三轮兽首池,轮次开始前不能泄露,存服务端状态
 */

// ============ 静态定义 ============

export const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const;
export type BeastId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export const ALL_BEAST_IDS: readonly BeastId[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export type Camp = 'GOOD' | 'EVIL';

export type Role =
  | 'XU_YUAN' //       许愿     GOOD 首领
  | 'FANG_ZHEN' //     方震     GOOD
  | 'JI_YUN_FU' //     姬云浮   GOOD
  | 'MU_HU_JIA_NAI' // 木户加奈 GOOD
  | 'HUANG_YAN_YAN' // 黄烟烟   GOOD
  | 'LAO_CHAO_FENG' // 老朝奉   EVIL 首领
  | 'YAO_BU_RAN' //    药不然   EVIL
  | 'ZHENG_GUO_QU'; // 郑国渠   EVIL

export const ROLE_CAMP: Record<Role, Camp> = {
  XU_YUAN: 'GOOD',
  FANG_ZHEN: 'GOOD',
  JI_YUN_FU: 'GOOD',
  MU_HU_JIA_NAI: 'GOOD',
  HUANG_YAN_YAN: 'GOOD',
  LAO_CHAO_FENG: 'EVIL',
  YAO_BU_RAN: 'EVIL',
  ZHENG_GUO_QU: 'EVIL',
};

/** 面向玩家的文案一律用游戏原文中文术语(CLAUDE.md 铁律 5) */
export const ROLE_NAME_CN: Record<Role, string> = {
  XU_YUAN: '许愿',
  FANG_ZHEN: '方震',
  JI_YUN_FU: '姬云浮',
  MU_HU_JIA_NAI: '木户加奈',
  HUANG_YAN_YAN: '黄烟烟',
  LAO_CHAO_FENG: '老朝奉',
  YAO_BU_RAN: '药不然',
  ZHENG_GUO_QU: '郑国渠',
};

export type AppraisalResult = 'REAL' | 'FAKE' | 'BLOCKED';
// BLOCKED = 无法鉴定(被偷袭 / 被覆盖 / 轮空 / 方震 / 姬云浮永久失能)

export type Phase =
  | 'LOBBY'
  | 'ACTION' //   阶段 A
  | 'SPEECH' //   阶段 B
  | 'VOTING' //   阶段 C 暗投
  | 'REVEAL' //   阶段 C 开票展示
  | 'IDENTITY' // 身份揭示
  | 'FINISHED';

/** 行动回合内的三步:鉴定 → 技能 → 派票 */
export type TurnStep = 'APPRAISE' | 'SKILL' | 'PASS';

// ============ 服务端完整状态(绝不整体下发) ============

export interface Beast {
  id: BeastId;
  isReal: boolean;
  /** 在第几轮被放出(0/1/2),-1 表示尚未使用 */
  exposedRound: number;
  /** 在第几轮被保护,null = 未被保护 */
  protectedRound: number | null;
  /** 真伪是否已对全场公开 */
  publiclyRevealed: boolean;
}

export interface Player {
  id: string; // 稳定 playerId,存 localStorage 用于重连
  name: string;
  seat: number; // 0..n-1,座位顺序(决定发言顺序)
  role: Role;
  camp: Camp;
  connected: boolean;

  /** 剩余投票筹码(整局总额 6,本轮可投额度按 SPEC 3.5 公式实时计算) */
  chips: number;
  /** 木户加奈 / 黄烟烟:随机失能的轮次索引,其他角色为 null */
  blindRound: number | null;
  /** 被药不然偷袭,待消耗。true 时下次行动无法鉴定+无法用技能 */
  sniped: boolean;
  /** sniped 标记在本回合开始时被消耗(SPEC 3.4),本回合鉴定/技能全部被禁 */
  snipedConsumedThisTurn: boolean;
  /** 姬云浮专用:被偷袭过 → 永久失能 */
  permanentlyBlinded: boolean;
}

export interface RoundState {
  index: number; // 0 | 1 | 2
  exposedBeasts: BeastId[]; // 本轮 4 件
  startPlayerId: string;
  /** 已行动玩家的顺序,动态增长;最后一个元素是当前(或最后)行动者 */
  actionOrder: string[];
  currentActorId: string | null;
  /** 当前行动者所处的步骤,非行动阶段为 null */
  turnStep: TurnStep | null;
  /** 老朝奉本轮发动技能时的 actionIndex,null = 未发动 */
  laoChaoFengFlipAt: number | null;
  /** 郑国渠覆盖:{ beastId, atIndex } */
  covered: { beastId: BeastId; atIndex: number } | null;
  /** 发言阶段当前发言者 */
  currentSpeakerId: string | null;
  speechOrder: string[];
  /** playerId -> { beastId -> chips },开票前绝不下发 */
  votes: Record<string, Partial<Record<BeastId, number>>>;
  /** 开票结果,结算前为 null */
  tally: { beastId: BeastId; count: number }[] | null;
  protectedTop1: BeastId | null;
  protectedTop2: BeastId | null;
}

export interface AppraisalLogEntry {
  round: number;
  playerId: string;
  beastId: BeastId;
  shown: AppraisalResult; // 玩家看到的(可能被翻转)
  truth: boolean | null; // 真实值,仅服务端;BLOCKED 时为 null
}

/**
 * 主动技能使用记录(服务端持有)。只会以 me.mySkillHistory 的形式下发给本人,
 * 用于断线重连后恢复"我翻转/偷袭/覆盖/查验过什么"(拍板 2026-08-12)。
 */
export interface SkillLogEntry {
  round: number;
  playerId: string;
  skill: 'INVESTIGATE' | 'FLIP' | 'SNIPE' | 'COVER';
  targetPlayerId?: string;
  targetBeastId?: BeastId;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  seed: number; // 用于确定性重放
  rngCursor: number;
  playerCount: 6 | 7 | 8;
  players: Player[];
  beasts: Beast[];
  /**
   * RULE-DECISION: R-2 —— 开局把 12 件一次性不重复分配到 3 轮(每轮必 2 真 2 假)。
   * 轮次开始前属于私密信息,只存在服务端状态里。
   */
  roundPools: BeastId[][];
  rounds: RoundState[];
  currentRound: number; // 0..2

  /** 每个玩家的私有鉴定历史(服务端持有,分别下发) */
  appraisalLog: AppraisalLogEntry[];

  /** 主动技能使用记录(服务端持有,只把本人的下发给本人) */
  skillLog: SkillLogEntry[];

  /** 方震的查验记录 */
  investigations: { round: number; targetId: string; camp: Camp }[];

  /** 身份揭示阶段的指认 */
  guesses: {
    laoChaoFengGuessXuYuan: string | null;
    yaoBuRanGuessFangZhen: string | null;
    goodGuessLaoChaoFeng: Record<string, string>; // goodPlayerId -> guessedId
  };

  result: GameResult | null;
}

export interface GameResult {
  winner: 'GOOD' | 'EVIL';
  instantWin: boolean;
  score: number;
  breakdown: {
    realProtected: number;
    xuYuanSurvivedBonus: 0 | 2;
    fangZhenSurvivedBonus: 0 | 1;
    laoChaoFengFoundBonus: 0 | 1;
  };
  reveal: {
    beasts: { id: BeastId; isReal: boolean; protectedRound: number | null }[];
    roles: { playerId: string; role: Role }[];
  };
}

// ============ PersonalView(下发给客户端的唯一形态) ============

export interface PersonalView {
  roomCode: string;
  phase: Phase;
  me: {
    id: string;
    role: Role;
    camp: Camp;
    chips: number;
    /**
     * 只在"本回合被偷袭封禁"时为 true。待消耗的偷袭标记不下发——
     * 被偷袭者轮到自己行动时才得知(拍板 2026-08-12,立刻通知会暴露药不然)。
     */
    sniped: boolean;
    permanentlyBlinded: boolean;
    /** 只有老朝奉/药不然能看到彼此 */
    knownTeammates: { id: string; role: Role }[];
    /** 我自己的鉴定历史 */
    myAppraisals: { round: number; beastId: BeastId; shown: AppraisalResult }[];
    /** 方震专属 */
    myInvestigations: { round: number; targetId: string; camp: Camp }[];
    /** 我自己的主动技能使用记录(重连恢复用) */
    mySkillHistory: {
      round: number;
      skill: SkillLogEntry['skill'];
      targetPlayerId?: string;
      targetBeastId?: BeastId;
    }[];
  };
  players: {
    id: string;
    name: string;
    seat: number;
    connected: boolean;
    hasActed: boolean; // 本轮是否已行动(含正在行动)
    chipsRemaining: number; // 公开信息
  }[];
  round: {
    index: number;
    exposedBeasts: BeastId[];
    currentActorId: string | null;
    /** 当前行动者所处步骤(公开;所有角色都要走完三步,不泄露技能有无) */
    turnStep: TurnStep | null;
    actionOrder: string[]; // 公开:谁在谁之后行动,是重要推理信息
    currentSpeakerId: string | null;
    /** 只在 REVEAL 之后才有值 */
    tally: { beastId: BeastId; count: number }[] | null;
  };
  /** 已公开真伪的兽首(每轮第 2 高票) */
  publicBeasts: { id: BeastId; isReal: boolean; protectedRound: number }[];
  /** 已被保护但真伪未公开的(每轮第 1 高票) */
  protectedUnknown: BeastId[];
  deadline: number | null; // 当前阶段截止的服务器时间戳(引擎不管时间,由服务端填)
  result: GameResult | null; // 仅 FINISHED 时有值
}

// ============ 动作(客户端/服务端 → 引擎) ============

export type GameAction =
  | { type: 'APPRAISE'; playerId: string; beastIds: BeastId[] }
  | {
      type: 'SKILL';
      playerId: string;
      use: boolean;
      /** 方震查验 / 药不然偷袭的目标 */
      targetPlayerId?: string;
      /** 郑国渠覆盖的目标 */
      targetBeastId?: BeastId;
    }
  | { type: 'PASS_TURN'; playerId: string; targetPlayerId: string }
  | { type: 'SPEECH_END'; playerId: string }
  | { type: 'VOTE_SUBMIT'; playerId: string; distribution: Partial<Record<BeastId, number>> }
  /** 押币超时:未提交者视为投 0 票(服务端计时器触发) */
  | { type: 'VOTE_FINALIZE' }
  /** 开票展示结束 → 下一轮或身份揭示(服务端计时器触发) */
  | { type: 'REVEAL_CONTINUE' }
  | { type: 'IDENTITY_GUESS'; playerId: string; targetPlayerId: string }
  /** 身份揭示超时:未指认视为没猜中(服务端计时器触发) */
  | { type: 'IDENTITY_FINALIZE' }
  /** 服务端标记断线/重连,任意阶段可用 */
  | { type: 'SET_CONNECTED'; playerId: string; connected: boolean };

// ============ 事件(引擎 → 服务端,由服务端翻译成 socket 下发) ============

/**
 * 公开事件流,用于界面"战报"。不含任何私密信息。
 *
 * RULE-DECISION(拍板 2026-08-12): SPEC 4.3 中 APPRAISED 的 count 字段已确认删除——
 * count=2 会直接暴露许愿、count=0 会直接暴露方震。战报只显示"某人完成了鉴定"。
 * SKILL_USED 按 SPEC 要求直接删除。
 */
export type PublicEvent =
  | { t: 'TURN_START'; playerId: string; index: number }
  | { t: 'APPRAISED'; playerId: string }
  | { t: 'PASSED'; from: string; to: string }
  | { t: 'SPEECH_START'; playerId: string }
  | { t: 'VOTE_SUBMITTED'; playerId: string } // 不含票数
  | {
      t: 'TALLY';
      entries: { beastId: BeastId; count: number }[];
      top1: BeastId;
      top2: BeastId;
      top2IsReal: boolean;
    }
  | { t: 'ROUND_START'; round: number; exposedBeasts: BeastId[]; startPlayerId: string };

export type GameEvent =
  | { kind: 'PUBLIC'; event: PublicEvent }
  | {
      kind: 'PRIVATE_APPRAISAL';
      toPlayerId: string;
      round: number;
      beastId: BeastId;
      shown: AppraisalResult;
    }
  | {
      kind: 'PRIVATE_INVESTIGATION';
      toPlayerId: string;
      round: number;
      targetId: string;
      camp: Camp;
    }
  /** 在被偷袭者自己的回合开始(标记消耗)时才发,文案"你被药不然偷袭了!" */
  | { kind: 'PRIVATE_SNIPED'; toPlayerId: string };
