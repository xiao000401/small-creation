/**
 * history.js — localStorage 历史记录管理
 */

const STORAGE_KEY = 'creative-muse-history'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

/**
 * 保存一条历史记录
 * @param {string} word  根词
 * @param {object} graph 完整图谱数据 { nodes, rootId }
 */
export function saveHistory(word, graph) {
  const list = load()
  // 去重：如果已存在相同 word，移到最前
  const filtered = list.filter(item => item.word !== word)
  filtered.unshift({
    word,
    graph,
    timestamp: Date.now()
  })
  // 最多保留 50 条
  save(filtered.slice(0, 50))
}

/**
 * 获取所有历史记录
 */
export function getHistory() {
  return load()
}

/**
 * 删除一条历史记录
 */
export function deleteHistory(timestamp) {
  const list = load().filter(item => item.timestamp !== timestamp)
  save(list)
}

/**
 * 更新最新一条历史记录（用于 expandNode 后保存新图谱）
 * 只在 word 匹配时更新，防止新搜索时旧记录被覆盖
 */
export function updateLatestHistory(word, graph) {
  const list = load()
  if (list.length === 0) return
  if (list[0].word !== word) return // word 不匹配，跳过
  list[0].graph = graph
  list[0].timestamp = Date.now()
  save(list)
}
