/**
 * main.js — 应用入口，初始化所有模块
 */
import './style.css'
import { initGraph, createGraph, expandNode, restoreGraph, getGraphData, getCurrentWord, setExpandCallback, getZoom } from './graph.js'
import { initInput, setInputValue, moveInputToBottom, moveInputToCenter, setLoading, getInputValue } from './input.js'
import { fetchDiverge } from './api.js'
import { saveHistory, getHistory, deleteHistory, updateLatestHistory } from './history.js'

// ─── 暗色模式 ────────────────────────────────────────────────────────────────
const THEME_KEY = 'creative-muse-theme'

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark') {
    document.documentElement.classList.add('dark')
  }
  document.getElementById('theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark')
    const isDark = document.documentElement.classList.contains('dark')
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
  })
}

// ─── 历史记录 UI ─────────────────────────────────────────────────────────────
function initHistoryUI() {
  const toggle = document.getElementById('history-toggle')
  const drawer = document.getElementById('history-drawer')
  const overlay = document.getElementById('drawer-overlay')
  const closeBtn = document.getElementById('drawer-close')

  function openDrawer() {
    drawer.classList.add('open')
    overlay.classList.add('open')
    renderHistoryList()
  }

  function closeDrawer() {
    drawer.classList.remove('open')
    overlay.classList.remove('open')
  }

  toggle.addEventListener('click', openDrawer)
  closeBtn.addEventListener('click', closeDrawer)
  overlay.addEventListener('click', closeDrawer)
}

function renderHistoryList() {
  const list = document.getElementById('history-list')
  const history = getHistory()

  if (history.length === 0) {
    list.innerHTML = '<p class="history-empty">暂无历史记录</p>'
    return
  }

  list.innerHTML = history.map(item => {
    const date = new Date(item.timestamp)
    const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
    return `
      <div class="history-item" data-timestamp="${item.timestamp}" data-word="${escapeHtml(item.word)}">
        <div class="history-item-info">
          <span class="history-word">${escapeHtml(item.word)}</span>
          <span class="history-time">${timeStr}</span>
        </div>
        <div class="history-actions">
          <button class="glass-btn history-restore" title="恢复">↩</button>
          <button class="glass-btn history-delete" title="删除">✕</button>
        </div>
      </div>
    `
  }).join('')

  // 事件委托
  list.querySelectorAll('.history-restore').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.history-item')
      const timestamp = parseInt(item.dataset.timestamp)
      const word = item.dataset.word
      const history = getHistory()
      const record = history.find(h => h.timestamp === timestamp)
      if (record) {
        setInputValue(record.word)
        moveInputToBottom()
        restoreGraph(record.graph, record.word)
        document.getElementById('welcome-state').style.display = 'none'
        document.getElementById('drawer-overlay').click() // 关闭抽屉
      }
    })
  })

  list.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.history-item')
      const timestamp = parseInt(item.dataset.timestamp)
      deleteHistory(timestamp)
      renderHistoryList()
    })
  })
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// ─── 搜索流程 ────────────────────────────────────────────────────────────────
async function handleSearch(word) {
  moveInputToBottom()
  document.getElementById('welcome-state').style.display = 'none'
  setLoading(true)

  const loadingEl = document.getElementById('loading-indicator')
  loadingEl.style.display = 'flex'

  try {
    const data = await fetchDiverge(word)
    createGraph(data.word, data.words)
    saveHistory(data.word, getGraphData())
  } catch (err) {
    alert('联想失败: ' + err.message)
  } finally {
    setLoading(false)
    loadingEl.style.display = 'none'
  }
}

// ─── 展开节点回调 ────────────────────────────────────────────────────────────
async function handleExpand(nodeId) {
  const graph = getGraphData()
  const node = graph.nodes[nodeId]
  if (!node) return

  setLoading(true)
  try {
    const data = await fetchDiverge(node.zh)
    expandNode(nodeId, data.words)
    // 更新历史（校验 word 一致）
    updateLatestHistory(getCurrentWord(), getGraphData())
  } catch (err) {
    alert('展开失败: ' + err.message)
  } finally {
    setLoading(false)
  }
}

// ─── 缩放百分比显示 ──────────────────────────────────────────────────────────
function updateZoomDisplay(zoom) {
  const el = document.getElementById('zoom-level')
  if (el) el.textContent = `${Math.round(zoom * 100)}%`
}

// ─── 初始化 ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme()
  initHistoryUI()

  initGraph({
    onGraphChange: (graphData, word) => {
      updateLatestHistory(word, graphData)
    },
    onZoomChange: updateZoomDisplay
  })

  initInput(handleSearch)
  setExpandCallback(handleExpand)

  updateZoomDisplay(getZoom())
})
