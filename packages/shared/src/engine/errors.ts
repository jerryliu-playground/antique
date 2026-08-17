export type EngineErrorCode =
  | 'BAD_PHASE'
  | 'NOT_YOUR_TURN'
  | 'BAD_STEP'
  | 'BAD_COUNT'
  | 'BAD_BEAST'
  | 'DUPLICATE_BEAST'
  | 'BAD_TARGET'
  | 'ALREADY_ACTED'
  | 'SKILL_BLOCKED'
  | 'NO_ACTIVE_SKILL'
  | 'BAD_DISTRIBUTION'
  | 'CHIPS_EXCEEDED'
  | 'ALREADY_SUBMITTED'
  | 'ALREADY_GUESSED'
  | 'BAD_ROLE'
  | 'UNKNOWN_PLAYER'
  | 'BAD_CONFIG'
  | 'CORRUPT_STATE';

/** 引擎校验失败统一抛这个错;reduce 抛错时保证不修改状态(immer produce 中断即丢弃) */
export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function invariant(cond: unknown, message: string): asserts cond {
  if (!cond) throw new EngineError('CORRUPT_STATE', message);
}
