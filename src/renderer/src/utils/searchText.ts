/**
 * 按搜索范围取条目的小写文本，结果按「条目对象 + 范围」缓存。
 *
 * 账号表与 Key 表都只整体替换、从不就地改字段，所以同一个对象的文本不会变：
 * 每敲一个字符都要给上千个条目拼一遍字符串再转小写，缓存后只算一次。
 * WeakMap 跟着条目对象一起回收，不会越攒越多。
 *
 * @param readers 每个范围怎么取原文；'all'（智能搜索）通常是几个字段拼起来
 */
export function createScopedSearchText<T extends object, S extends string>(
  readers: Record<S, (item: T) => string>
): (item: T, scope: S) => string {
  const caches = {} as Record<S, WeakMap<T, string>>
  for (const scope of Object.keys(readers) as S[]) caches[scope] = new WeakMap()

  return (item, scope) => {
    const cache = caches[scope]
    let text = cache.get(item)
    if (text === undefined) cache.set(item, (text = readers[scope](item).toLowerCase()))
    return text
  }
}
