import { ulid } from "ulid";

/** 生成一个新的 ULID 作为实体标识符 */
export function generateId(): string {
  return ulid();
}
