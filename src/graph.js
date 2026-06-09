/**
 * graph.js — 节点图谱核心
 * 平移缩放、节点拖拽（弹簧物理跟随）、折叠/展开、贝塞尔曲线连线、撤销
 */

// ─── 状态 ────────────────────────────────────────────────────────────────────
const NODE_RADIUS = 44
const CHILD_RADIUS = 36
const COLLISION_DIST = 90
const SPRING_K = 0.08
const SPRING_DAMPING = 0.82
const INERTIA_FRICTION = 0.92

let canvasContainer, transformContainer, svgEl, nodesContainer

let pan = { x: 0, y: 0 }
let zoom = 1
const ZOOM_MIN = 0.2
const ZOOM_MAX = 5

/** @type {Map<string, GraphNode>} */
const nodeMap = new Map()

let rootId = null
let currentWord = '' // 当前根词，用于 updateLatestHistory 校验

// 拖拽画布状态
let isPanning = false
let panStart = { x: 0, y: 0 }
let panStartOffset = { x: 0, y: 0 }

// 节点拖拽状态
let dragNode = null
let dragOffset = { x: 0, y: 0 }
let dragWorldStart = { x: 0, y: 0 }

// 弹簧物理
let springAnimations = new Map() // nodeId -> { vx, vy, targetX?, targetY? }

// 撤销栈
const undoStack = []

// 回调
let onGraphChange = null
let onZoomChange = null

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} zh
 * @property {string} en
 * @property {number} x
 * @property {number} y
 * @property {string|null} parentId
 * @property {string[]} children
 * @property {boolean} collapsed
 * @property {boolean} isRoot
 */

// ─── 初始化 ──────────────────────────────────────────────────────────────────
export function initGraph(opts) {
  canvasContainer = document.getElementById('canvas-container')
  transformContainer = document.getElementById('transform-container')
  svgEl = document.getElementById('connections-svg')
  nodesContainer = document.getElementById('nodes-container')

  onGraphChange = opts.onGraphChange || (() => {})
  onZoomChange = opts.onZoomChange || (() => {})

  // 画布拖拽 & 缩放绑定在 document 上
  document.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('wheel', handleWheel, { passive: false })

  // 触摸支持
  document.addEventListener('touchstart', handleTouchStart, { passive: false })
  document.addEventListener('touchmove', handleTouchMove, { passive: false })
  document.addEventListener('touchend', handleTouchEnd)

  // 键盘：Ctrl+Z 撤销
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    }
  })

  // 控件按钮
  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.2))
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2))
  document.getElementById('zoom-fit').addEventListener('click', fitView)
  document.getElementById('canvas-clear').addEventListener('click', clearCanvas)

  applyTransform()
}

// ─── 坐标转换 ────────────────────────────────────────────────────────────────

/**
 * 递归统计节点的所有后代数量
 */
function countDescendants(nodeId) {
  const node = nodeMap.get(nodeId)
  if (!node) return 0
  let count = node.children.length
  for (const childId of node.children) {
    count += countDescendants(childId)
  }
  return count
}

function screenToWorld(sx, sy) {
  const rect = canvasContainer.getBoundingClientRect()
  return {
    x: (sx - rect.left - pan.x) / zoom,
    y: (sy - rect.top - pan.y) / zoom
  }
}

// ─── 图谱数据操作 ─────────────────────────────────────────────────────────────
/**
 * 创建新图谱（根词 + 8 个联想词）
 */
export function createGraph(word, words) {
  clearAllNodes()
  undoStack.length = 0

  currentWord = word
  rootId = 'root'

  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2

  const rootNode = {
    id: rootId,
    zh: word,
    en: '',
    x: cx,
    y: cy,
    parentId: null,
    children: [],
    collapsed: false,
    isRoot: true
  }
  nodeMap.set(rootId, rootNode)

  const angleStep = (Math.PI * 2) / words.length
  const radius = 200
  words.forEach((w, i) => {
    const angle = angleStep * i - Math.PI / 2
    const id = `node-${Date.now()}-${i}`
    const child = {
      id,
      zh: w.zh || w,
      en: w.en || '',
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      parentId: rootId,
      children: [],
      collapsed: true,
      isRoot: false
    }
    rootNode.children.push(id)
    nodeMap.set(id, child)
  })

  // 平移到根词位置居中
  pan.x = 0
  pan.y = 0
  zoom = 1

  renderAll()
  fitView()
  emitGraphChange()
}

/**
 * 展开节点（获取子节点）
 */
export function expandNode(nodeId, words) {
  const node = nodeMap.get(nodeId)
  if (!node) return

  // 保存撤销快照
  pushUndo()

  // 计算已有子节点的角度，新节点放在空闲位置
  const occupiedAngles = node.children.map(cid => {
    const c = nodeMap.get(cid)
    return c ? Math.atan2(c.y - node.y, c.x - node.x) : null
  }).filter(a => a !== null)

  const radius = 160
  const total = words.length + occupiedAngles.length
  const spread = Math.PI * 1.2 // 展开范围更广
  const parentAngle = Math.atan2(
    node.y - (nodeMap.get(node.parentId)?.y || node.y),
    node.x - (nodeMap.get(node.parentId)?.x || node.x)
  )

  // 寻找空闲角度槽位
  function findFreeAngles(count) {
    // 把所有占用角度归一化到 [0, 2π)
    const sorted = occupiedAngles.map(a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b)
    if (sorted.length === 0) {
      // 没有已有子节点，按父方向居中扇形分布
      const step = count > 1 ? spread / (count - 1) : 0
      return Array.from({ length: count }, (_, i) =>
        count > 1 ? parentAngle - spread / 2 + step * i : parentAngle
      )
    }
    // 在已有节点间的空隙中均匀放置
    const angles = []
    let cursor = parentAngle - Math.PI
    for (let i = 0; i < count; i++) {
      // 找最近的未占用角度
      let bestAngle = cursor
      let bestDist = Infinity
      for (let tryAngle = cursor; tryAngle < cursor + 2 * Math.PI; tryAngle += 0.05) {
        const norm = ((tryAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        const minDist = sorted.reduce((min, occ) => {
          let d = Math.abs(norm - occ)
          d = Math.min(d, 2 * Math.PI - d)
          return Math.min(min, d)
        }, Infinity)
        if (minDist > bestDist) {
          break // 已过最近空隙中心
        }
        bestDist = minDist
        bestAngle = tryAngle
      }
      angles.push(bestAngle)
      sorted.push(((bestAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))
      sorted.sort((a, b) => a - b)
      cursor = bestAngle + 0.3
    }
    return angles
  }

  const newAngles = findFreeAngles(words.length)

  words.forEach((w, i) => {
    const angle = newAngles[i]
    const id = `node-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`
    const child = {
      id,
      zh: w.zh || w,
      en: w.en || '',
      x: node.x + Math.cos(angle) * radius,
      y: node.y + Math.sin(angle) * radius,
      parentId: nodeId,
      children: [],
      collapsed: true,
      isRoot: false
    }
    node.children.push(id)
    nodeMap.set(id, child)

    // 入场动画
    requestAnimationFrame(() => {
      const el = nodesContainer.querySelector(`[data-id="${id}"]`)
      if (el) el.classList.add('node-enter')
    })
  })

  node.collapsed = false
  renderAll()
  emitGraphChange()
}

/**
 * 折叠/展开子节点
 */
export function toggleCollapse(nodeId) {
  const node = nodeMap.get(nodeId)
  if (!node || node.children.length === 0) return
  pushUndo()
  node.collapsed = !node.collapsed
  renderAll()
  emitGraphChange()
}

// ─── 可见节点收集 ─────────────────────────────────────────────────────────────
function getVisibleNodes() {
  const result = []
  function walk(id) {
    const node = nodeMap.get(id)
    if (!node) return
    result.push(node)
    if (!node.collapsed) {
      node.children.forEach(walk)
    }
  }
  if (rootId) walk(rootId)
  return result
}

function getVisibleEdges() {
  const edges = []
  function walk(id) {
    const node = nodeMap.get(id)
    if (!node) return
    if (!node.collapsed) {
      node.children.forEach(cid => {
        const child = nodeMap.get(cid)
        if (child) {
          edges.push({ from: node, to: child })
          walk(cid)
        }
      })
    }
  }
  if (rootId) walk(rootId)
  return edges
}

// ─── 渲染 ────────────────────────────────────────────────────────────────────
function renderAll() {
  renderNodes()
  renderEdges()
}

function renderNodes() {
  const visible = getVisibleNodes()
  const existingIds = new Set(visible.map(n => n.id))

  // 移除不可见的 DOM 节点
  Array.from(nodesContainer.children).forEach(el => {
    if (!existingIds.has(el.dataset.id)) el.remove()
  })

  visible.forEach(node => {
    let el = nodesContainer.querySelector(`[data-id="${node.id}"]`)
    if (!el) {
      el = createNodeElement(node)
      nodesContainer.appendChild(el)
    }
    // 更新位置
    el.style.left = `${node.x - (node.isRoot ? NODE_RADIUS : CHILD_RADIUS)}px`
    el.style.top = `${node.y - (node.isRoot ? NODE_RADIUS : CHILD_RADIUS)}px`

    // 更新分支数量徽章（统计所有后代节点数）
    const badge = el.querySelector('.node-badge')
    if (badge) {
      const totalDescendants = countDescendants(node.id)
      if (totalDescendants > 0) {
        badge.textContent = totalDescendants
        badge.style.display = 'flex'
      } else {
        badge.style.display = 'none'
      }
    }
  })
}

function createNodeElement(node) {
  const el = document.createElement('div')
  el.className = `graph-node ${node.isRoot ? 'root-node' : 'child-node'}`
  el.dataset.id = node.id

  const inner = document.createElement('div')
  inner.className = 'node-inner'

  const zhSpan = document.createElement('span')
  zhSpan.className = 'node-zh'
  zhSpan.textContent = node.zh

  inner.appendChild(zhSpan)

  if (node.en) {
    const enSpan = document.createElement('span')
    enSpan.className = 'node-en'
    enSpan.textContent = node.en
    inner.appendChild(enSpan)
  }

  el.appendChild(inner)

  // 子节点数量徽章
  const badge = document.createElement('div')
  badge.className = 'node-badge'
  const totalDescendants = countDescendants(node.id)
  badge.style.display = totalDescendants > 0 ? 'flex' : 'none'
  badge.textContent = totalDescendants
  el.appendChild(badge)

  // 加号按钮：所有节点都可以继续发散
  const expandBtn = document.createElement('button')
  expandBtn.className = 'node-expand-btn'
  expandBtn.innerHTML = '+'
  expandBtn.title = '继续发散'
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    handleExpandClick(node.id)
  })
  el.appendChild(expandBtn)

  // 点击节点（拖拽判断在 mouseup 中处理）
  el.addEventListener('mousedown', (e) => {
    e.stopPropagation() // 阻止画布拖拽
    const liveNode = nodeMap.get(node.id)
    if (!liveNode) return
    const world = screenToWorld(e.clientX, e.clientY)
    dragNode = liveNode
    dragOffset = { x: world.x - liveNode.x, y: world.y - liveNode.y }
    dragWorldStart = { x: e.clientX, y: e.clientY }
  })

  return el
}

// ─── 贝塞尔曲线连线 ──────────────────────────────────────────────────────────
function renderEdges() {
  const edges = getVisibleEdges()
  const rect = canvasContainer.getBoundingClientRect()
  svgEl.setAttribute('width', rect.width)
  svgEl.setAttribute('height', rect.height)

  let pathStr = ''
  edges.forEach(({ from, to }) => {
    // 将世界坐标转换为 SVG 视口坐标（考虑 pan/zoom）
    const x1 = from.x * zoom + pan.x
    const y1 = from.y * zoom + pan.y
    const x2 = to.x * zoom + pan.x
    const y2 = to.y * zoom + pan.y

    // 贝塞尔控制点
    const dx = x2 - x1
    const dy = y2 - y1
    const cx1 = x1 + dx * 0.4
    const cy1 = y1 + dy * 0.1
    const cx2 = x1 + dx * 0.6
    const cy2 = y2 - dy * 0.1

    pathStr += `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2} `
  })

  svgEl.innerHTML = pathStr
    ? `<path d="${pathStr}" fill="none" stroke="var(--line-color)" stroke-width="2" stroke-linecap="round" opacity="0.6"/>`
    : ''
}

// ─── 变换 ────────────────────────────────────────────────────────────────────
function applyTransform() {
  transformContainer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
  transformContainer.style.transformOrigin = '0 0'
  renderEdges()
  if (onZoomChange) onZoomChange(zoom)
}

function zoomBy(factor, cx, cy) {
  const rect = canvasContainer.getBoundingClientRect()
  if (cx === undefined) cx = rect.width / 2
  if (cy === undefined) cy = rect.height / 2

  const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor))
  const ratio = newZoom / zoom

  pan.x = cx - ratio * (cx - pan.x)
  pan.y = cy - ratio * (cy - pan.y)
  zoom = newZoom

  applyTransform()
}

function fitView() {
  const visible = getVisibleNodes()
  if (visible.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  visible.forEach(n => {
    const r = n.isRoot ? NODE_RADIUS : CHILD_RADIUS
    minX = Math.min(minX, n.x - r)
    minY = Math.min(minY, n.y - r)
    maxX = Math.max(maxX, n.x + r)
    maxY = Math.max(maxY, n.y + r)
  })

  const rect = canvasContainer.getBoundingClientRect()
  const pad = 80
  const contentW = maxX - minX + pad * 2
  const contentH = maxY - minY + pad * 2

  zoom = Math.min(1.5, Math.max(ZOOM_MIN, Math.min(rect.width / contentW, rect.height / contentH)))
  pan.x = (rect.width - (minX + maxX) * zoom) / 2
  pan.y = (rect.height - (minY + maxY) * zoom) / 2

  applyTransform()
}

// ─── 鼠标事件 ────────────────────────────────────────────────────────────────
function isUIElement(target) {
  return target.closest('.input-area') ||
    target.closest('.canvas-controls') ||
    target.closest('.history-drawer') ||
    target.closest('.history-toggle') ||
    target.closest('.theme-toggle') ||
    target.closest('.loading-indicator') ||
    target.closest('.welcome-state') ||
    target.closest('.undo-toast')
}

function handleMouseDown(e) {
  if (isUIElement(e.target)) return
  if (e.button !== 0) return
  // 如果点击的是节点，节点自己的 mousedown 已经处理了
  if (e.target.closest('.graph-node')) return

  isPanning = true
  panStart = { x: e.clientX, y: e.clientY }
  panStartOffset = { x: pan.x, y: pan.y }
  canvasContainer.style.cursor = 'grabbing'
}

function handleMouseMove(e) {
  if (isPanning) {
    pan.x = panStartOffset.x + (e.clientX - panStart.x)
    pan.y = panStartOffset.y + (e.clientY - panStart.y)
    applyTransform()
    return
  }

  if (dragNode) {
    const world = screenToWorld(e.clientX, e.clientY)
    dragNode.x = world.x - dragOffset.x
    dragNode.y = world.y - dragOffset.y

    // 弹簧物理：带动子节点
    updateSpringPhysics(dragNode.id)

    renderAll()
  }
}

function handleMouseUp(e) {
  if (isPanning) {
    isPanning = false
    canvasContainer.style.cursor = ''
    return
  }

  if (dragNode) {
    const dist = Math.hypot(e.clientX - dragWorldStart.x, e.clientY - dragWorldStart.y)
    const nodeId = dragNode.id
    if (dist < 5) {
      // 判定为点击
      if (dragNode.children.length > 0) {
        toggleCollapse(nodeId)
      }
    } else {
      // 松开后惯性收尾
      startInertia(nodeId)
    }
    dragNode = null
  }
}

function handleWheel(e) {
  if (isUIElement(e.target)) return
  e.preventDefault()

  const rect = canvasContainer.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top

  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  zoomBy(factor, cx, cy)
}

// ─── 触摸事件 ────────────────────────────────────────────────────────────────
let lastTouchDist = 0
let lastTouchCenter = { x: 0, y: 0 }

function handleTouchStart(e) {
  if (isUIElement(e.target)) return

  if (e.touches.length === 2) {
    e.preventDefault()
    const t1 = e.touches[0], t2 = e.touches[1]
    lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
    lastTouchCenter = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }
    return
  }

  if (e.touches.length === 1) {
    const touch = e.touches[0]
    if (isUIElement(touch.target)) return
    if (touch.target.closest('.graph-node')) return

    isPanning = true
    panStart = { x: touch.clientX, y: touch.clientY }
    panStartOffset = { x: pan.x, y: pan.y }
  }
}

function handleTouchMove(e) {
  if (e.touches.length === 2) {
    e.preventDefault()
    const t1 = e.touches[0], t2 = e.touches[1]
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
    const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }

    const rect = canvasContainer.getBoundingClientRect()
    const cx = center.x - rect.left
    const cy = center.y - rect.top
    zoomBy(dist / lastTouchDist, cx, cy)

    pan.x += center.x - lastTouchCenter.x
    pan.y += center.y - lastTouchCenter.y
    applyTransform()

    lastTouchDist = dist
    lastTouchCenter = center
    return
  }

  if (e.touches.length === 1 && isPanning) {
    const touch = e.touches[0]
    pan.x = panStartOffset.x + (touch.clientX - panStart.x)
    pan.y = panStartOffset.y + (touch.clientY - panStart.y)
    applyTransform()
  }
}

function handleTouchEnd() {
  isPanning = false
}

// ─── 弹簧物理 ────────────────────────────────────────────────────────────────
function updateSpringPhysics(parentId) {
  const parent = nodeMap.get(parentId)
  if (!parent) return

  // 递归带动所有后代
  function propagate(pid, depth) {
    const pNode = nodeMap.get(pid)
    if (!pNode || pNode.collapsed) return

    pNode.children.forEach(cid => {
      const child = nodeMap.get(cid)
      if (!child || child === dragNode) return

      // 弹簧力：向父节点的期望位置移动
      const dx = pNode.x - child.x
      const dy = pNode.y - child.y
      const dist = Math.hypot(dx, dy)
      const targetDist = 160
      const force = (dist - targetDist) * SPRING_K

      if (dist > 0) {
        child.x += (dx / dist) * force
        child.y += (dy / dist) * force
      }

      // 碰撞避让
      pNode.children.forEach(otherId => {
        if (otherId === cid) return
        const other = nodeMap.get(otherId)
        if (!other || other === dragNode) return
        const ox = child.x - other.x
        const oy = child.y - other.y
        const od = Math.hypot(ox, oy)
        if (od < COLLISION_DIST && od > 0) {
          const push = (COLLISION_DIST - od) * 0.3
          child.x += (ox / od) * push
          child.y += (oy / od) * push
        }
      })

      propagate(cid, depth + 1)
    })
  }

  propagate(parentId, 0)
}

function startInertia(nodeId) {
  // 简化惯性：在接下来的帧中逐步衰减子节点的相对偏移
  const node = nodeMap.get(nodeId)
  if (!node || node.collapsed) return

  const initialPositions = new Map()
  node.children.forEach(cid => {
    const child = nodeMap.get(cid)
    if (child) initialPositions.set(cid, { x: child.x, y: child.y })
  })

  let frame = 0
  const maxFrames = 30
  function tick() {
    frame++
    if (frame >= maxFrames) return

    let changed = false
    node.children.forEach(cid => {
      const child = nodeMap.get(cid)
      const init = initialPositions.get(cid)
      if (!child || !init) return

      // 轻微回弹
      const dx = node.x - child.x
      const dy = node.y - child.y
      const dist = Math.hypot(dx, dy)
      const targetDist = 160

      if (Math.abs(dist - targetDist) > 1) {
        const force = (dist - targetDist) * 0.03
        child.x += (dx / dist) * force
        child.y += (dy / dist) * force
        changed = true
      }
    })

    if (changed) {
      renderAll()
      requestAnimationFrame(tick)
    }
  }
  requestAnimationFrame(tick)
}

// ─── 展开点击处理 ────────────────────────────────────────────────────────────
let expandCallback = null

export function setExpandCallback(cb) {
  expandCallback = cb
}

function handleExpandClick(nodeId) {
  if (expandCallback) expandCallback(nodeId)
}

// ─── 撤销 ────────────────────────────────────────────────────────────────────
function pushUndo() {
  const snapshot = {
    nodes: new Map(nodeMap),
    rootId
  }
  undoStack.push(snapshot)
  if (undoStack.length > 30) undoStack.shift()
  showUndoToast()
}

function undo() {
  if (undoStack.length === 0) return
  const snapshot = undoStack.pop()

  nodeMap.clear()
  snapshot.nodes.forEach((v, k) => {
    nodeMap.set(k, { ...v, children: [...v.children] })
  })
  rootId = snapshot.rootId

  renderAll()
  emitGraphChange()
  if (undoStack.length === 0) hideUndoToast()
}

function showUndoToast() {
  const toast = document.getElementById('undo-toast')
  if (toast) toast.style.display = 'flex'
}

function hideUndoToast() {
  const toast = document.getElementById('undo-toast')
  if (toast) toast.style.display = 'none'
}

// ─── 清空 ────────────────────────────────────────────────────────────────────
function clearAllNodes() {
  nodeMap.clear()
  rootId = null
  currentWord = ''
  nodesContainer.innerHTML = ''
  svgEl.innerHTML = ''
}

export function clearCanvas() {
  clearAllNodes()
  undoStack.length = 0
  pan = { x: 0, y: 0 }
  zoom = 1
  applyTransform()
  emitGraphChange()
  hideUndoToast()
}

// ─── 导出图谱数据 ────────────────────────────────────────────────────────────
export function getGraphData() {
  const nodes = {}
  nodeMap.forEach((v, k) => {
    nodes[k] = { ...v, children: [...v.children] }
  })
  return { nodes, rootId }
}

export function getCurrentWord() {
  return currentWord
}

/**
 * 从历史记录恢复图谱
 */
export function restoreGraph(graph, word) {
  clearAllNodes()
  undoStack.length = 0

  currentWord = word
  rootId = graph.rootId

  Object.entries(graph.nodes).forEach(([id, data]) => {
    nodeMap.set(id, { ...data, children: [...data.children] })
  })

  renderAll()
  fitView()
}

// ─── 图谱变更回调 ────────────────────────────────────────────────────────────
function emitGraphChange() {
  if (onGraphChange) onGraphChange(getGraphData(), currentWord)
}

// ─── 控件导出 ────────────────────────────────────────────────────────────────
export function getZoom() {
  return zoom
}
