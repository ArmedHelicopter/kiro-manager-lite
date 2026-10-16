// 账号与 API Key 共用的「多分组 + 回收站」字段读写。
//
// 分组从单选改成多选后，存档里有两种形态：
//  - 老数据：只有 groupId（单个分组）
//  - 新数据：groupIds（多个分组），同时把第一个分组镜像写进 groupId
// 镜像是为了兼容回退：退回旧版本时它只认 groupId，至少还能保住第一个分组，不会全部变成未分组。
// 读取一律经 groupIdsOf，写入一律经 withGroupIds，不要直接读写这两个字段。

export interface Groupable {
  /** 旧版单分组字段；新版写入时镜像为 groupIds 的第一个 */
  groupId?: string
  groupIds?: string[]
}

const NO_GROUPS: readonly string[] = Object.freeze([])

/**
 * 条目所属的分组 id（去重、去空）；新字段优先，没有时回落旧的单分组字段。
 *
 * 分组计数、筛选每次数据变化都要对上千个条目各调一次，所以常见情况不分配新数组：
 * 没分组返回共享的空数组，已经是干净数组（写入时经 withGroupIds 去过重）直接返回原数组。
 * 返回值只读，调用方不要就地修改。
 */
export function groupIdsOf(item: Groupable): string[] {
  const list = item.groupIds
  if (Array.isArray(list)) {
    if (list.length === 0) return NO_GROUPS as string[]
    if (list.length === 1) return typeof list[0] === 'string' && list[0] ? list : (NO_GROUPS as string[])
    return [...new Set(list.filter((id): id is string => typeof id === 'string' && !!id))]
  }
  return item.groupId ? [item.groupId] : (NO_GROUPS as string[])
}

/**
 * 返回设置了分组的新对象（不改原对象）。
 * 空数组表示未分组：两个字段都不存，避免把 undefined / [] 写进存档。
 */
export function withGroupIds<T extends Groupable>(item: T, ids: readonly string[]): T {
  const unique = [...new Set(ids.filter(Boolean))]
  const { groupId: _legacy, groupIds: _list, ...rest } = item
  if (!unique.length) return rest as T
  return { ...rest, groupIds: unique, groupId: unique[0] } as T
}

/** 两组分组 id 是否相同（与顺序无关） */
export function sameGroupIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/** 只保留仍然存在的分组；分组被删除后残留的 id 一律忽略 */
export function validGroupIdsOf(item: Groupable, exists: (id: string) => boolean): string[] {
  return groupIdsOf(item).filter(exists)
}

export interface Trashable {
  /** 放入回收站的时间；不存在表示正常条目 */
  trashedAt?: number
}

export function isTrashed(item: Trashable): boolean {
  return typeof item.trashedAt === 'number' && item.trashedAt > 0
}
