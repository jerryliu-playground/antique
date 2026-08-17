# 《古董局中局》线上版 — 设计文档

面向 6–8 人朋友局的网页版实现。手机 / 桌面同一套响应式代码，内置语音。

---

## 目录

1. [游戏规则（权威版本）](#1-游戏规则权威版本)
2. [数据模型](#2-数据模型)
3. [规则引擎](#3-规则引擎)
4. [网络协议](#4-网络协议)
5. [断线、超时与托管](#5-断线超时与托管)
6. [语音设计](#6-语音设计)
7. [客户端 UI](#7-客户端-ui)
8. [实施阶段与验收标准](#8-实施阶段与验收标准)
9. [规则引擎测试用例](#9-规则引擎测试用例)
10. [待确认项](#10-待确认项)

---

## 1. 游戏规则（权威版本）

本节是规则的唯一事实来源。代码与本节冲突时，以本节为准。

### 1.1 基本设定

- 十二兽首，按生肖顺序编号 `0..11`：鼠、牛、虎、兔、龙、蛇、马、羊、猴、鸡、狗、猪
- 其中 **6 真 6 假**，开局随机分配，整局固定不变
- 游戏共 **3 轮**
- 玩家分为两大阵营：**许愿阵营**（好人）与 **老朝奉阵营**（坏人）

### 1.2 身份配置

**8 人局（标准）**

好人 5 人：

| 身份 | 能力 |
|---|---|
| **许愿** | 阵营首领。每轮可鉴定 **2 件** 兽首（其他人只能鉴 1 件） |
| **方震** | **无法鉴定兽首**。每轮可查验 1 名玩家的所属阵营 |
| **姬云浮** | 鉴定时**不受老朝奉技能影响**。一旦被药不然偷袭，**整局永久失去鉴定能力** |
| **木户加奈** | 无特殊技能。三轮中**随机 1 轮**无法鉴定 |
| **黄烟烟** | 无特殊技能。三轮中**随机 1 轮**无法鉴定 |

坏人 3 人：

| 身份 | 能力 |
|---|---|
| **老朝奉** | 阵营首领。鉴定后可发动：本轮内**行动顺位在他之后**的好人（姬云浮除外），鉴定任何兽首看到的结果**真假互换** |
| **药不然** | 鉴定后可偷袭任意 1 名玩家。被偷袭者**下一次轮到他时**无法鉴定、无法发动技能。**若偷袭到方震，许愿连带被偷袭** |
| **郑国渠** | **不知道自己的队友是谁**。鉴定后可覆盖 1 件兽首，本轮内在他之后鉴定该件的玩家只会看到"无法鉴定" |

**人数缩减**

- 7 人局：移除 **姬云浮**（好人 4，坏人 3）
- 6 人局：再移除 **郑国渠**（好人 4，坏人 2）

**互相认人**

- 老朝奉 ↔ 药不然 **互相知道对方身份**
- 郑国渠**不知道**任何队友，队友也不知道他 ⚠️ 待确认项 R-1
- 好人之间全部互不认识

### 1.3 单轮流程

一轮由三个阶段组成：**行动 → 发言 → 押币**。

#### 阶段 A：行动（Action Phase）

轮次开始时，系统从兽首池中放出 **4 件** 兽首供本轮鉴定，**必定 2 真 2 假**。

由本轮起始玩家开始。**每个玩家一轮只行动一次**，轮到你时依次做三件事：

1. **鉴定**：从本轮的 4 件中选 1 件（许愿选 2 件）。系统显示 `真` / `赝` / `无法鉴定`
2. **发动技能**：有技能的角色选择发动或不发动
3. **派票**：从本轮**尚未行动**的玩家中指定 1 人，由他接着行动

最后一名行动的玩家称为 **尾家**，他行动完毕后本轮行动阶段结束。**尾家将成为下一轮的起始玩家。**

> 首轮起始玩家由系统随机指定。

#### 阶段 B：发言（Speech Phase）

从**尾家左手边**（座位顺序的下一位）开始，按座位顺序依次发言。

发言为**绝对发言**：轮到谁谁说，其他人不得打断。（这一条直接决定了语音设计，见第 6 节。）

#### 阶段 C：押币（Voting Phase）

- 每名玩家整局共有 **6 枚投票筹码**
- 每轮开始时进入手中 **2 枚**，**本轮未用完的可以累积到下一轮**
- 所有玩家**同时暗投**，把手中筹码任意分配到本轮 4 件兽首上（可以全押一件，也可以一枚不投）
- 全员投完后**同时开票**

**开票结算：**

1. 按 `(票数降序, 生肖序号升序)` 对 4 件兽首排序
2. 排名第 1、第 2 的兽首被 **保护**
3. **只公开第 2 名的真伪**，第 1 名的真伪**隐藏到游戏结束**
4. 平票时生肖顺序靠前者视为票数更高（鼠 > 牛 > … > 猪）

> 边界情况：即使 4 件全部 0 票，仍然按生肖序取前 2 件保护。

### 1.4 游戏结束与计分

三轮结束后共保护了 **6 件** 兽首。

**即时胜利**：如果这 6 件全部为真品，许愿阵营**直接获胜**，跳过身份揭示阶段。

否则进入 **身份揭示阶段**（所有人同时进行）：

- **老朝奉** 指认他认为的**许愿**
- **药不然** 指认他认为的**方震**
- **每一名好人**（含许愿、方震本人）各自指认他认为的**老朝奉**
- 郑国渠不进行任何指认

**计分（只算许愿阵营的分数）：**

| 项目 | 分数 |
|---|---|
| 每保护到 1 件真品 | +1（最多 +6） |
| 老朝奉**没有**猜中许愿 | +2 |
| 药不然**没有**猜中方震 | +1 |
| **过半数**好人猜中老朝奉（8 人局 5 好人 → 需 ≥3 人） | +1 |

**许愿阵营总分 ≥ 6 获胜，否则老朝奉阵营获胜。** 理论最高 10 分。

---

## 2. 数据模型

全部定义在 `packages/shared/src/types.ts`。

```ts
// ============ 静态定义 ============

export const ZODIAC = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'] as const;
export type BeastId = 0|1|2|3|4|5|6|7|8|9|10|11;

export type Camp = 'GOOD' | 'EVIL';

export type Role =
  | 'XU_YUAN'        // 许愿   GOOD  首领
  | 'FANG_ZHEN'      // 方震   GOOD
  | 'JI_YUN_FU'      // 姬云浮 GOOD
  | 'MU_HU_JIA_NAI'  // 木户加奈 GOOD
  | 'HUANG_YAN_YAN'  // 黄烟烟 GOOD
  | 'LAO_CHAO_FENG'  // 老朝奉 EVIL 首领
  | 'YAO_BU_RAN'     // 药不然 EVIL
  | 'ZHENG_GUO_QU';  // 郑国渠 EVIL

export type AppraisalResult = 'REAL' | 'FAKE' | 'BLOCKED';
// BLOCKED = 无法鉴定（被偷袭 / 被覆盖 / 轮空 / 方震 / 姬云浮永久失能）

export type Phase =
  | 'LOBBY'
  | 'ACTION'      // 阶段 A
  | 'SPEECH'      // 阶段 B
  | 'VOTING'      // 阶段 C 暗投
  | 'REVEAL'      // 阶段 C 开票展示
  | 'IDENTITY'    // 身份揭示
  | 'FINISHED';

// ============ 服务端完整状态（绝不整体下发） ============

export interface Beast {
  id: BeastId;
  isReal: boolean;
  /** 在第几轮被放出（0/1/2），-1 表示尚未使用 */
  exposedRound: number;
  /** 在第几轮被保护，null = 未被保护 */
  protectedRound: number | null;
  /** 真伪是否已对全场公开 */
  publiclyRevealed: boolean;
}

export interface Player {
  id: string;            // 稳定 playerId，存 localStorage 用于重连
  name: string;
  seat: number;          // 0..n-1，座位顺序（决定发言顺序）
  role: Role;
  camp: Camp;
  connected: boolean;

  /** 剩余投票筹码 */
  chips: number;
  /** 木户加奈 / 黄烟烟：随机失能的轮次索引，其他角色为 null */
  blindRound: number | null;
  /** 被药不然偷袭，待消耗。true 时下次行动无法鉴定+无法用技能 */
  sniped: boolean;
  /** 姬云浮专用：被偷袭过 → 永久失能 */
  permanentlyBlinded: boolean;
}

export interface RoundState {
  index: number;              // 0 | 1 | 2
  exposedBeasts: BeastId[];   // 本轮 4 件
  startPlayerId: string;
  /** 已行动玩家的顺序，动态增长 */
  actionOrder: string[];
  currentActorId: string | null;
  /** 老朝奉本轮发动技能时的 actionIndex，null = 未发动 */
  laoChaoFengFlipAt: number | null;
  /** 郑国渠覆盖：{ beastId, atIndex } */
  covered: { beastId: BeastId; atIndex: number } | null;
  /** 发言阶段当前发言者 */
  currentSpeakerId: string | null;
  speechOrder: string[];
  /** playerId -> { beastId -> chips } */
  votes: Record<string, Partial<Record<BeastId, number>>>;
  /** 开票结果 */
  tally: { beastId: BeastId; count: number }[] | null;
  protectedTop1: BeastId | null;
  protectedTop2: BeastId | null;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  seed: number;              // 用于确定性重放
  rngCursor: number;
  playerCount: 6 | 7 | 8;
  players: Player[];
  beasts: Beast[];
  rounds: RoundState[];
  currentRound: number;      // 0..2

  /** 每个玩家的私有鉴定历史（服务端持有，分别下发） */
  appraisalLog: {
    round: number;
    playerId: string;
    beastId: BeastId;
    shown: AppraisalResult;   // 玩家看到的（可能被翻转）
    truth: boolean | null;    // 真实值，仅服务端
  }[];

  /** 方震的查验记录 */
  investigations: { round: number; targetId: string; camp: Camp }[];

  /** 身份揭示阶段的指认 */
  guesses: {
    laoChaoFengGuessXuYuan: string | null;
    yaoBuRanGuessFangZhen: string | null;
    goodGuessLaoChaoFeng: Record<string, string>;  // goodPlayerId -> guessedId
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
```

### 2.1 PersonalView（下发给客户端的唯一形态）

```ts
export interface PersonalView {
  roomCode: string;
  phase: Phase;
  me: {
    id: string;
    role: Role;
    camp: Camp;
    chips: number;
    sniped: boolean;              // 只在自己被偷袭且已生效时为 true
    permanentlyBlinded: boolean;
    /** 只有老朝奉/药不然能看到彼此 */
    knownTeammates: { id: string; role: Role }[];
    /** 我自己的鉴定历史 */
    myAppraisals: { round: number; beastId: BeastId; shown: AppraisalResult }[];
    /** 方震专属 */
    myInvestigations: { round: number; targetId: string; camp: Camp }[];
  };
  players: {
    id: string; name: string; seat: number; connected: boolean;
    hasActed: boolean;            // 本轮是否已行动
    chipsRemaining: number;       // 公开信息
  }[];
  round: {
    index: number;
    exposedBeasts: BeastId[];
    currentActorId: string | null;
    actionOrder: string[];        // 公开：谁在谁之后行动，是重要推理信息
    currentSpeakerId: string | null;
    /** 只在 REVEAL 之后才有值 */
    tally: { beastId: BeastId; count: number }[] | null;
  };
  /** 已公开真伪的兽首（每轮第 2 高票） */
  publicBeasts: { id: BeastId; isReal: boolean; protectedRound: number }[];
  /** 已被保护但真伪未公开的（每轮第 1 高票） */
  protectedUnknown: BeastId[];
  deadline: number | null;        // 当前阶段截止的服务器时间戳
  result: GameResult | null;      // 仅 FINISHED 时有值
}
```

> ⚠️ `actionOrder` 是**公开信息**——玩家必须能看到谁在谁之后行动，否则无法推理老朝奉的翻转范围。但"某人鉴了什么"是私密的。

---

## 3. 规则引擎

`packages/shared/src/engine/`，纯函数，零 IO。

```ts
export function reduce(
  state: GameState,
  action: GameAction
): { state: GameState; events: GameEvent[] };

export function toPersonalView(state: GameState, playerId: string): PersonalView;
```

### 3.1 开局初始化

```
1. 用 seed 初始化 RNG
2. 随机选 6 个 beastId 设为真品，其余 6 个为赝品
3. 把 6 真分成 3 组各 2 个，6 假分成 3 组各 2 个
   第 r 轮的 exposedBeasts = 真组[r] ∪ 假组[r]，打乱后存储
   → 保证每轮必定 2 真 2 假，且 12 件恰好每件出现一次
   ⚠️ 待确认项 R-2
4. 按人数取身份牌，洗牌发给玩家
5. 木户加奈、黄烟烟各自独立随机抽 0/1/2 作为 blindRound
6. 随机指定首轮 startPlayerId
7. 每人 chips = 6
8. phase = ACTION
```

### 3.2 鉴定结果解析（最关键的一段）

玩家 `P` 在本轮 `actionIndex = i` 鉴定兽首 `B`，按以下**顺序**判定，命中即返回：

```
function resolveAppraisal(state, P, B, i): AppraisalResult {

  // 1. 方震永远不能鉴定
  if (P.role === 'FANG_ZHEN')                       return 'BLOCKED';

  // 2. 姬云浮被偷袭过 → 永久失能
  if (P.permanentlyBlinded)                         return 'BLOCKED';

  // 3. 本次行动被药不然偷袭（标记在本回合开始时消耗）
  if (P.snipedConsumedThisTurn)                     return 'BLOCKED';

  // 4. 木户加奈 / 黄烟烟 的随机轮空
  if (P.blindRound === state.currentRound)          return 'BLOCKED';

  // 5. 郑国渠覆盖，且覆盖发生在我之前
  if (round.covered?.beastId === B
      && round.covered.atIndex < i)                 return 'BLOCKED';

  // 6. 正常鉴定
  let truth = beasts[B].isReal;

  // 7. 老朝奉翻转：发动在我之前 + 我是好人 + 我不是姬云浮
  if (round.laoChaoFengFlipAt !== null
      && round.laoChaoFengFlipAt < i
      && P.camp === 'GOOD'
      && P.role !== 'JI_YUN_FU') {
    truth = !truth;
  }

  return truth ? 'REAL' : 'FAKE';
}
```

**注意点：**

- 顺序不能改。例如"被覆盖"优先于"老朝奉翻转"——覆盖会直接返回 BLOCKED，不存在"翻转后的无法鉴定"。
- 老朝奉的翻转**只影响 GOOD 阵营**。郑国渠虽然不认识队友，但他是 EVIL，**不受影响**（⚠️ R-1）。
- 姬云浮免疫翻转，但**不免疫**覆盖和偷袭。
- 许愿一次鉴 2 件，两件用**同一个 `i`** 分别解析。

### 3.3 技能结算

| 角色 | 时机 | 效果 |
|---|---|---|
| 许愿 | 被动 | 鉴定阶段可选 2 件 |
| 方震 | 步骤 2 | `investigate(targetId)` → 返回该玩家 camp。被偷袭时不可用 |
| 姬云浮 | 被动 | 免疫翻转 |
| 木户/黄 | 被动 | blindRound 轮空 |
| 老朝奉 | 步骤 2 | `round.laoChaoFengFlipAt = i`，本轮有效，下轮重置 |
| 药不然 | 步骤 2 | `snipe(targetId)` → `target.sniped = true`；若 target 是方震，许愿也 `sniped = true`；若 target 是姬云浮，额外 `permanentlyBlinded = true` |
| 郑国渠 | 步骤 2 | `round.covered = { beastId, atIndex: i }`，本轮有效 |

**`sniped` 标记的消耗时机**：在被偷袭者**下一次回合开始时**消耗（设 `snipedConsumedThisTurn = true`，清除 `sniped`）。因此：

- 偷袭一个本轮**还没行动**的人 → 本轮就生效
- 偷袭一个本轮**已经行动过**的人 → 下一轮生效
- 跨轮保留，直到被消耗

**药不然可以偷袭任何人，包括自己和队友。**

### 3.4 行动阶段推进

```
onPlayerTurnStart(P):
  if (P.sniped) { P.snipedConsumedThisTurn = true; P.sniped = false; }

onAppraise(P, beastIds[]):
  校验：轮到 P、beastIds 全在 exposedBeasts 内、长度符合角色（许愿 2，方震 0，其余 1）
  对每个 beast 调用 resolveAppraisal，写入 appraisalLog
  → 进入技能步骤

onSkill(P, skillPayload | null):
  若 P.snipedConsumedThisTurn，强制跳过
  执行技能
  → 进入派票步骤

onPassTurn(P, targetId):
  校验：targetId 存在且本轮未行动
  actionOrder.push(targetId)
  currentActorId = targetId

  若无人可派（P 是最后一个）→ 尾家确定，phase = SPEECH
```

**尾家**是 `actionOrder[actionOrder.length - 1]`。下轮 `startPlayerId = 尾家`。

**发言顺序**：从尾家的**座位下一位**开始，按 `seat` 循环一圈，共 n 人。
`speechOrder = [ (尾家.seat + 1) % n, (尾家.seat + 2) % n, ... ]`

### 3.5 押币结算

```
onVoteSubmit(P, distribution: Record<BeastId, number>):
  校验：sum(distribution) <= P.chips，所有 key 在 exposedBeasts 内，值 >= 0
  记录，不下发

全员提交后（或超时）:
  P.chips -= sum(distribution)     // 未用完的自动累积到下轮
  tally = exposedBeasts.map(b => ({ beastId: b, count: sum of all votes on b }))
  sort by (count desc, beastId asc)
  protectedTop1 = tally[0].beastId   // 真伪不公开
  protectedTop2 = tally[1].beastId   // 真伪立即公开
  beasts[top1].protectedRound = round
  beasts[top2].protectedRound = round
  beasts[top2].publiclyRevealed = true
  phase = REVEAL → 展示若干秒 → 下一轮 ACTION 或 IDENTITY
```

**筹码额度的计算**

桌游里的"每轮把 2 枚拿进挡板、没用完的留到下轮"，等价于一个简单公式：

```
availableThisRound = 2 * (currentRound + 1) - totalSpentSoFar
```

| 轮次 | 累计发放 | 本轮可投上限 |
|---|---|---|
| 第 1 轮 | 2 | 2 |
| 第 2 轮 | 4 | 4 − 第 1 轮花费 |
| 第 3 轮 | 6 | 6 − 前两轮花费 |

整局总额 6 枚封顶。`Player.chips` 存**剩余总数**（初始 6），本轮可投额度按上式实时计算，不要额外存"本轮手里几枚"。

### 3.6 结算

```
protectedBeasts = 6 件（3 轮 × 2）
realProtected = count(protectedBeasts where isReal)

if (realProtected === 6):
  → instantWin, GOOD 获胜, 跳过 IDENTITY

phase = IDENTITY，等待所有指认（老朝奉 1 个、药不然 1 个、每个好人 1 个）

score = realProtected
score += (老朝奉猜的人 !== 许愿本人) ? 2 : 0
score += (药不然猜的人 !== 方震本人) ? 1 : 0
goodCount = 好人总数
correctGuesses = count(好人们猜中老朝奉的)
score += (correctGuesses * 2 >= goodCount) ? 1 : 0     // ≥ 半数

winner = score >= 6 ? 'GOOD' : 'EVIL'
```

> 6 人局无姬云浮无郑国渠：好人 4、坏人 2，半数 = 2。
> 7 人局无姬云浮：好人 4、坏人 3，半数 = 2。
> 8 人局：好人 5、坏人 3，半数 = 3（因为 3*2=6 >= 5）。

---

## 4. 网络协议

Socket.IO，全部事件带 `roomCode`。客户端连接时携带 `playerId`（localStorage）与 `roomCode` 用于重连。

### 4.1 客户端 → 服务端

| 事件 | Payload | 说明 |
|---|---|---|
| `room:create` | `{ name }` | 返回 6 位房号 |
| `room:join` | `{ roomCode, name, playerId? }` | 带 playerId 视为重连 |
| `room:leave` | `{}` | |
| `room:start` | `{}` | 仅房主，人数 6–8 才允许 |
| `action:appraise` | `{ beastIds: BeastId[] }` | |
| `action:skill` | `{ use: boolean, target?: string \| BeastId }` | |
| `action:pass` | `{ targetPlayerId }` | |
| `speech:end` | `{}` | 当前发言者主动结束 |
| `vote:submit` | `{ distribution: Record<BeastId, number> }` | |
| `identity:guess` | `{ targetPlayerId }` | |

### 4.2 服务端 → 客户端

| 事件 | Payload | 说明 |
|---|---|---|
| `state:sync` | `PersonalView` | **主要下发通道。** 任何状态变化都全量重推个人视图，不做增量 diff |
| `event:log` | `PublicEvent` | 公开事件流，用于界面上的"战报"（谁派票给谁、开票结果等），**不含私密信息** |
| `private:appraisal` | `{ round, beastId, shown }` | 鉴定结果，仅发给本人 |
| `private:investigation` | `{ round, targetId, camp }` | 仅发给方震 |
| `private:sniped` | `{}` | 仅发给被偷袭者，文案"你被药不然偷袭了！" |
| `voice:token` | `{ token, canPublish }` | LiveKit token 与麦序权限 |
| `error` | `{ code, message }` | |

**全量重推的理由**：这游戏状态很小（一个 PersonalView 几 KB），全量推送能彻底消除客户端状态漂移和重连拼接的 bug。不要做增量同步。

### 4.3 PublicEvent 类型

```ts
type PublicEvent =
  | { t: 'TURN_START'; playerId: string; index: number }
  | { t: 'APPRAISED'; playerId: string; count: number }        // 不含 beastId！
  | { t: 'SKILL_USED'; playerId: string }                      // ⚠️ 见下
  | { t: 'PASSED'; from: string; to: string }
  | { t: 'SPEECH_START'; playerId: string }
  | { t: 'VOTE_SUBMITTED'; playerId: string }                  // 不含票数
  | { t: 'TALLY'; entries: {beastId: BeastId; count: number}[]; top1: BeastId; top2: BeastId; top2IsReal: boolean }
  | { t: 'ROUND_START'; round: number; exposedBeasts: BeastId[]; startPlayerId: string };
```

> ⚠️ **`SKILL_USED` 绝对不能发**。如果广播"某人发动了技能"，等于直接暴露谁有技能。技能发动完全静默，只有效果体现在别人的鉴定结果里。已在类型里列出仅为提醒：**删掉它**。

---

## 5. 断线、超时与托管

8 人局挂一个人整局卡死，这部分是刚需。

### 5.1 重连

- 客户端首次加入时服务端生成 `playerId`，客户端存 localStorage
- 重连时 `room:join` 带上 `playerId` → 服务端匹配座位，`connected = true`，立即 `state:sync` 全量个人视图
- 断线期间**游戏不暂停**，计时器照常走
- 房间在全员断线后保留 30 分钟再销毁

### 5.2 阶段计时与托管

| 阶段 | 默认时长 | 超时行为 |
|---|---|---|
| 行动（单人回合） | 90s | 随机鉴定 1 件未鉴过的（许愿 2 件）、不发动技能、随机派票给一名未行动者 |
| 发言（单人） | 120s | 自动切下一位 |
| 押币 | 60s | 未提交者视为投 0 票（筹码累积到下轮） |
| 身份揭示 | 60s | 未指认者视为指认失败（按"没猜中"处理） |

时长写在房间配置里，房主可调。`deadline` 随 `PersonalView` 下发，客户端只做倒计时显示，**判定一律在服务端**。

### 5.3 崩溃恢复

每次 `reduce` 后把 `GameState` 序列化写入 `./data/rooms/{roomCode}.json`（debounce 500ms）。进程启动时扫描目录恢复房间。够用了，不要上数据库。

---

## 6. 语音设计

### 6.1 核心思路：麦序控制，不做自由混音

规则里发言是**绝对发言**——同一时刻只有一个人该说话。直接把这条规则变成技术方案：

**服务端持有发言权，只给当前发言者签发 `canPublish = true` 的 LiveKit token，其他人只订阅不发布。**

好处：

- 8 路上行变 1 路，带宽和 CPU 大幅下降
- 回声、抢麦、串音问题自然消失
- 完全贴合玩法，玩家不会觉得被限制

### 6.2 各阶段麦权

| 阶段 | 可发言者 |
|---|---|
| LOBBY | 全员自由（这时候需要闲聊约人） |
| ACTION | **全员静音**（行动阶段不该说话，避免泄露顺位信息） |
| SPEECH | 仅 `currentSpeakerId` |
| VOTING | 全员静音 |
| REVEAL | 全员自由（开票后会自然吵起来，这是乐趣的一部分） |
| IDENTITY | 全员静音 |
| FINISHED | 全员自由 |

实现：每次阶段切换，服务端给所有人重发 `voice:token`，客户端拿到后调用 LiveKit 的 `setMicrophoneEnabled()`。

另外保留一个**"举手"按钮**：非发言阶段可以举手，当前发言者或房主可以临时给麦。这个放 Phase 5。

### 6.3 移动端注意事项

1. **iOS Safari 必须由用户手势触发**才能 `getUserMedia`。进房间时必须有一个显眼的"开启语音"按钮，不能自动请求。
2. **切到后台音频会断**。监听 `visibilitychange` 和 LiveKit 的 reconnect 事件，回前台自动重连。
3. **必须 HTTPS**，本地开发用 `vite --host` + `mkcert` 自签证书，否则手机上测不了麦克风。
4. 播放远端音频的 `<audio>` 元素也需要用户手势才能 `play()`，同样挂在"开启语音"按钮上。

### 6.4 降级方案

如果 LiveKit 接入不顺，Phase 4 可以先跳过，让大家在 Discord 语音频道里开黑，网页只跑游戏逻辑。**不要因为语音卡住整个项目。**

---

## 7. 客户端 UI

### 7.1 布局

单页，响应式。手机竖屏是第一优先，桌面是把同样的布局横向展开。

```
┌─────────────────────────────┐
│ 顶栏：房号 · 第 N 轮 · 倒计时 · 麦克风  │
├─────────────────────────────┤
│ 玩家列表（横向头像条）              │
│ 高亮当前行动者 / 发言者              │
│ 显示：已行动✓ 剩余筹码 断线标记        │
├─────────────────────────────┤
│ 本轮 4 件兽首（大卡片）             │
│ 我鉴过的显示我看到的结果               │
│ 已公开的显示真/假角标                │
├─────────────────────────────┤
│ 操作区（随 phase 变化）             │
│ · 行动：选兽首 → 技能 → 派票         │
│ · 发言：计时条 + 结束发言按钮          │
│ · 押币：4 个 +/- 计数器 + 剩余筹码    │
├─────────────────────────────┤
│ 侧栏/抽屉：我的身份牌 · 我的鉴定历史 ·   │
│ 公开战报 · 十二兽首总览               │
└─────────────────────────────┘
```

### 7.2 设计要点

- **手机上"派票"要好按**：玩家头像做成大按钮，未行动的高亮可点，已行动的灰掉。
- **鉴定历史必须常驻可查**，这是玩家推理的全部依据。做成可下拉的抽屉，包含轮次、兽首、我看到的结果。
- **十二兽首总览面板**：12 个格子，标注每件的状态（未出现 / 本轮可鉴 / 已保护未公开 / 已公开真 / 已公开假）。这是推理的核心信息板。
- **身份牌常驻角落**，可折叠，含技能说明全文——不要让玩家去查规则。
- **视觉风格**：民国 / 古玩题材，深色底 + 暖褐金配色，衬线中文标题（如思源宋体）。不要用默认的蓝白 SaaS 风格。
- 不需要动画特效，但**开票瞬间**值得做一个逐票展开的动效，那是全场情绪高点。

---

## 8. 实施阶段与验收标准

### Phase 0 — 脚手架

- pnpm workspace，三个包：`shared` / `server` / `web`
- TypeScript strict、ESLint、Prettier、Vitest 配置好
- `packages/shared/src/types.ts` 按第 2 节写完整

**验收**：`pnpm -r build` 与 `pnpm -r test` 均通过（测试可为空）。

---

### Phase 1 — 规则引擎（最重要）

- `packages/shared/src/engine/` 实现完整 `reduce` + `toPersonalView`
- seeded RNG，同一 seed + 同一 action 序列必然得到同一结果
- 实现第 9 节的**全部**测试用例

**验收**：

1. 第 9 节所有测试用例通过
2. 能写一个脚本：给定 seed 与随机 action 序列，跑完整局 1000 次不抛异常、不进入非法状态
3. `toPersonalView` 有专门的**泄密测试**：对每个玩家的 view 做 `JSON.stringify`，断言不含其他玩家的 role、不含未公开兽首的真伪
4. **此阶段不写任何网络代码**

---

### Phase 2 — 服务端

- Fastify + Socket.IO，房间管理，第 4 节协议全部实现
- 计时器与托管逻辑
- 重连与 JSON 快照持久化

**验收**：

1. 用一个 Node 脚本模拟 8 个 socket 客户端，全自动打完一整局
2. 中途随机 kill 掉 3 个客户端再重连，游戏能正常走完
3. 中途 kill 掉服务端进程重启，房间能从快照恢复继续

---

### Phase 3 — Web 客户端

- React + Vite + Tailwind + Zustand
- 第 7 节全部界面，手机竖屏优先
- 无语音，纯游戏逻辑跑通

**验收**：手机浏览器 + 桌面浏览器混合 8 人，能完整打完一局，包括中途刷新页面能恢复。

---

### Phase 4 — 语音

- LiveKit 接入，服务端签发 token
- 第 6.2 节的麦序控制
- 移动端手势授权、后台恢复

**验收**：8 人真机（含至少 2 台 iPhone）能听清彼此，阶段切换时麦权自动变更且无残留音频。

---

### Phase 5 — 打磨（可选）

- 举手要麦
- 完整对局回放（用 action 序列重放）
- 战绩统计
- 房主可调计时、可踢人、可换座

---

## 9. 规则引擎测试用例

Phase 1 必须全部实现为 Vitest 用例。构造状态时直接手写 `GameState` fixture，不要经过随机初始化。

### 老朝奉翻转

- **T-01** 老朝奉在 index 2 发动。index 3 的许愿鉴定真品 → 看到 `FAKE`
- **T-02** 老朝奉在 index 2 发动。index 1 的黄烟烟（已行动）不受影响
- **T-03** 老朝奉在 index 2 发动。index 4 的药不然（EVIL）鉴定真品 → 看到 `REAL`
- **T-04** 老朝奉在 index 2 发动。index 4 的郑国渠（EVIL）鉴定真品 → 看到 `REAL`（⚠️ R-1）
- **T-05** 老朝奉在 index 2 发动。index 4 的姬云浮鉴定真品 → 看到 `REAL`（免疫）
- **T-06** 老朝奉不发动 → 所有人看到真实结果
- **T-07** 翻转效果**不跨轮**：第 1 轮发动，第 2 轮所有人看到真实结果

### 药不然偷袭

- **T-10** 偷袭本轮未行动的玩家 → 该玩家本轮回合鉴定得 `BLOCKED`，且技能被禁
- **T-11** 偷袭本轮已行动的玩家 → 本轮无影响，**下一轮**该玩家回合 `BLOCKED`
- **T-12** 偷袭方震 → 方震和许愿**都**被标记 `sniped`
- **T-13** 偷袭姬云浮 → 姬云浮 `permanentlyBlinded = true`，第 2、3 轮均 `BLOCKED`
- **T-14** 偷袭许愿 → 许愿本轮两件都 `BLOCKED`
- **T-15** 偷袭标记消耗后不残留：被偷袭者下下轮恢复正常
- **T-16** 药不然偷袭自己 → 合法，自己下回合被禁

### 郑国渠覆盖

- **T-20** 郑国渠在 index 2 覆盖兽首 X。index 3 玩家鉴 X → `BLOCKED`
- **T-21** index 3 玩家鉴 Y（未被覆盖）→ 正常结果
- **T-22** index 1 玩家（已行动）不受影响
- **T-23** 覆盖 + 老朝奉翻转同时存在，鉴被覆盖件 → `BLOCKED`（覆盖优先）
- **T-24** 覆盖不跨轮
- **T-25** 郑国渠自己的 `knownTeammates` 为空数组

### 轮空与方震

- **T-30** 木户加奈 `blindRound = 1`，第 1 轮（index 1）`BLOCKED`，第 0、2 轮正常
- **T-31** 方震任何时候鉴定都返回 `BLOCKED`
- **T-32** 方震查验玩家 → 返回正确 camp
- **T-33** 方震被偷袭 → 该回合无法查验
- **T-34** 方震查验老朝奉 → `EVIL`；查验郑国渠 → `EVIL`

### 行动顺序

- **T-40** 派票给已行动的玩家 → 抛错
- **T-41** 派票给自己 → 抛错
- **T-42** 最后一名玩家行动完 → `phase` 变为 `SPEECH`，`actionOrder.length === playerCount`
- **T-43** 尾家成为下一轮 `startPlayerId`
- **T-44** 发言顺序从尾家座位 +1 开始，循环 n 人
- **T-45** 非当前行动者提交 action → 抛错

### 押币与开票

- **T-50** 第 1 轮最多投 2 枚；投 3 枚 → 抛错
- **T-51** 第 1 轮投 0 枚 → 第 2 轮最多可投 4 枚
- **T-52** 第 1 轮投 2 枚 → 第 2 轮最多可投 2 枚
- **T-53** 三轮总花费不超过 6
- **T-54** 平票时生肖序号小的排前（鼠 vs 虎 同票 → 鼠为 top1）
- **T-55** 全员 0 票 → 仍按生肖序保护前 2 件
- **T-56** top2 真伪立即 `publiclyRevealed = true`，top1 保持 `false`
- **T-57** 投票给不在本轮 exposedBeasts 里的兽首 → 抛错

### 结算

- **T-60** 6 件保护全为真 → `instantWin = true`，`winner = GOOD`，跳过 IDENTITY
- **T-61** 4 真 + 老朝奉猜错许愿(+2) → 6 分 → GOOD 胜
- **T-62** 4 真 + 老朝奉猜中许愿 + 药不然猜错方震(+1) + 3 好人猜中老朝奉(+1) → 6 分 → GOOD 胜
- **T-63** 3 真 + 全部加分项(+4) → 7 分 → GOOD 胜
- **T-64** 5 真 + 老朝奉猜中 + 药不然猜中 + 好人只有 2 人猜中 → 5 分 → EVIL 胜
- **T-65** 8 人局 5 好人，3 人猜中老朝奉 → 加分；2 人猜中 → 不加分
- **T-66** 6 人局 4 好人，2 人猜中 → 加分

### 信息安全（重点）

- **T-70** 任意玩家的 `PersonalView` 序列化后，不含其他玩家的 `role` 字段
- **T-71** `PersonalView` 不含未公开兽首的 `isReal`
- **T-72** 好人的 `knownTeammates` 为空
- **T-73** 老朝奉的 `knownTeammates` 只含药不然（不含郑国渠）
- **T-74** 药不然的 `knownTeammates` 只含老朝奉
- **T-75** `PersonalView` 不含其他玩家的 `myAppraisals`
- **T-76** VOTING 阶段的 `PersonalView` 不含任何人的票数分配
- **T-77** REVEAL 之后 `tally` 才出现

### 人数变体

- **T-80** 7 人局身份牌不含姬云浮
- **T-81** 6 人局身份牌不含姬云浮和郑国渠
- **T-82** 6 人局仍是 12 兽首 6 真 6 假、每轮 4 件

---

## 10. 待确认项

实现时按**默认值**处理，并在代码里留 `// RULE-DECISION: R-x` 注释。

| 编号 | 问题 | 默认处理 |
|---|---|---|
| **R-1** | 老朝奉的翻转对郑国渠是否生效？规则原文说"己方阵营不受影响"，但郑国渠不知道队友，他自己也无法判断结果是否被翻转 | **不生效**（按阵营判定）。若你们的房规是"生效"，改 `resolveAppraisal` 第 7 步的条件即可 |
| **R-2** | 每轮的 4 件兽首是从 12 件里**不重复分配**（12 件恰好每件出现一次），还是**每轮重新抽**（可能重复出现已鉴过的）？ | **不重复分配**。这样每轮 2 真 2 假、三轮覆盖全部 12 件，且"保护满 6 件真品"的即时胜利恰好可达。实现为独立函数 `buildRoundPools()`，改起来是一处 |
| **R-3** | 药不然能否偷袭自己或队友？ | **可以**（原文"任意玩家"） |
| **R-4** | 玩家能否鉴定本轮已经鉴过的同一件？ | **不能**，每轮每件每人只能鉴一次。许愿的 2 件必须不同 |
| **R-5** | 郑国渠的覆盖对自己阵营是否生效？ | **生效**（原文说"在他后面选择鉴定此宝物的玩家，都只会显示无法鉴定"，无阵营限制） |
| **R-6** | 老朝奉被药不然偷袭后能否发动翻转？ | **不能**（被偷袭者"无法鉴定也无法发动能力"） |
| **R-7** | 身份揭示阶段，许愿本人和方震本人是否也要指认老朝奉？ | **要**（原文"所有的好人各自选出"），且计入半数统计 |

### 10.1 已拍板决定（2026-08-12）

以下决定已由房主确认，实现以本表为准（代码中有对应 `RULE-DECISION` 注释）：

| 编号 | 决定 |
|---|---|
| **D-1** | 4.3 的 `APPRAISED` 事件**不带 `count` 字段**（count=2 暴露许愿、count=0 暴露方震）。战报只显示"某人完成了鉴定"。 |
| **D-2** | 被偷袭者**轮到自己行动时才得知**被偷袭（`private:sniped` 在其回合开始、标记消耗时才发；立刻通知会暴露当前行动者是药不然）。待消耗的 sniped 标记不出现在任何 PersonalView 里；姬云浮的 `permanentlyBlinded` 同样在标记消耗时才落地。 |
| **D-3** | `PersonalView.me` 增加 `mySkillHistory`（只含本人的技能使用记录），供断线重连后恢复"我翻转/偷袭/覆盖/查验过什么"。 |
| **D-4** | 身份揭示**不能指认自己**；押币**一轮只能提交一次**、单件数量不限、上限=手中持有（每轮进 2 枚、没用完可攒，即 3.5 的公式，维持原状）；**方震不能查验自己**（防误操作）。 |
| **D-5** | T-54 平票规则确认：任意两件同票时，生肖序号小者视为票数更高（鼠 vs 马同票 → 鼠为 top1）。 |
| **D-6** | `PersonalView.round` 增加 `turnStep`（当前行动者所处步骤，公开信息），供重连后恢复行动 UI；所有角色都要显式走完三步，不泄露谁有技能。 |

---

## 附：给 Claude Code 的第一条指令建议

```
读完 CLAUDE.md 和 SPEC.md，然后只做 Phase 0 和 Phase 1。
不要写任何网络代码、不要写任何 React 代码。
Phase 1 完成的标志是第 9 节的全部测试用例通过。
做完后告诉我哪些测试用例的预期行为你不确定。
```
