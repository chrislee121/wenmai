/**
 * DeepSeek Harness 用 snapshotJsonValue 接收工具返回值：
 * 拒绝 undefined、NaN、Infinity、-0，以及非普通对象。
 */
export function assertLosslessJson(value, loc = '$') {
  if (value === undefined) throw new Error(`${loc} is undefined`)
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
    throw new Error(`${loc} is not a lossless JSON number`)
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertLosslessJson(item, `${loc}[${index}]`))
    return
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`${loc} is not a plain object`)
    }
    for (const [key, child] of Object.entries(value)) {
      assertLosslessJson(child, `${loc}.${key}`)
    }
  }
}
