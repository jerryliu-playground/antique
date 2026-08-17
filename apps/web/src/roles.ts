import type { Camp, Role } from '@antique/shared';

/** 身份牌文案(SPEC 7.2:含技能说明全文,不让玩家去查规则) */
export const ROLE_INFO: Record<Role, { name: string; camp: Camp; skill: string }> = {
  XU_YUAN: {
    name: '许愿',
    camp: 'GOOD',
    skill: '阵营首领。每轮可鉴定 2 件兽首(其他人只能鉴 1 件)。',
  },
  FANG_ZHEN: {
    name: '方震',
    camp: 'GOOD',
    skill: '无法鉴定兽首。每轮可查验 1 名玩家的所属阵营。',
  },
  JI_YUN_FU: {
    name: '姬云浮',
    camp: 'GOOD',
    skill: '鉴定时不受老朝奉技能影响。一旦被药不然偷袭,整局永久失去鉴定能力。',
  },
  MU_HU_JIA_NAI: {
    name: '木户加奈',
    camp: 'GOOD',
    skill: '无特殊技能。三轮中随机 1 轮无法鉴定。',
  },
  HUANG_YAN_YAN: {
    name: '黄烟烟',
    camp: 'GOOD',
    skill: '无特殊技能。三轮中随机 1 轮无法鉴定。',
  },
  LAO_CHAO_FENG: {
    name: '老朝奉',
    camp: 'EVIL',
    skill: '阵营首领。鉴定后可发动:本轮内行动顺位在他之后的好人(姬云浮除外),鉴定任何兽首看到的结果真假互换。',
  },
  YAO_BU_RAN: {
    name: '药不然',
    camp: 'EVIL',
    skill: '鉴定后可偷袭任意 1 名玩家。被偷袭者下一次轮到他时无法鉴定、无法发动技能。若偷袭到方震,许愿连带被偷袭。',
  },
  ZHENG_GUO_QU: {
    name: '郑国渠',
    camp: 'EVIL',
    skill: '不知道自己的队友是谁。鉴定后可覆盖 1 件兽首,本轮内在他之后鉴定该件的玩家只会看到「无法鉴定」。',
  },
};

export const campName = (c: Camp): string => (c === 'GOOD' ? '许愿阵营' : '老朝奉阵营');

export const PHASE_NAME: Record<string, string> = {
  LOBBY: '大厅',
  ACTION: '行动',
  SPEECH: '发言',
  VOTING: '押币',
  REVEAL: '开票',
  IDENTITY: '身份揭示',
  FINISHED: '终局',
};
