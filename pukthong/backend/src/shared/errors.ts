/**
 * FastAPI ตอบ error เป็น {"detail": "..."} และ web/src/api.ts อ่าน body.detail
 * ตรงๆ — Fastify ต้องตอบรูปแบบเดียวกันเป๊ะ ไม่งั้นผู้ใช้จะเห็นแต่ "HTTP 500"
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export const httpError = (status: number, detail: string, cause?: unknown) =>
  new HttpError(status, detail, { cause });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** id ทุกตัวที่เราสร้างเป็น UUID — เช็คก่อนยิง query จะได้ตอบ 422 แทนที่จะค้นเปล่า */
export function requireUuid(value: string, label = "id"): string {
  if (!UUID_RE.test(value)) throw httpError(422, `${label} ไม่ใช่ UUID ที่ถูกต้อง`);
  return value;
}
