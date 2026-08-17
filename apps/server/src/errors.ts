import { EngineError } from '@antique/shared';

/** 服务端层面的校验错误(房间不存在、非房主、人数不符等) */
export class ServerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/** 统一转换成 SPEC 4.2 的 error 事件 payload:{ code, message } */
export function toErrorPayload(err: unknown): { code: string; message: string } {
  if (err instanceof ServerError) return { code: err.code, message: err.message };
  if (err instanceof EngineError) return { code: err.code, message: err.message };
  return { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) };
}
