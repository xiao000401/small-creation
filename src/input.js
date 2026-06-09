/**
 * input.js — 输入框组件
 */

let inputEl, submitBtn, inputArea
let onSubmitCallback = null

export function initInput(onSubmit) {
  inputEl = document.getElementById('word-input')
  submitBtn = document.getElementById('submit-btn')
  inputArea = document.getElementById('input-area')
  onSubmitCallback = onSubmit

  submitBtn.addEventListener('click', handleSubmit)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit()
  })
}

function handleSubmit() {
  const word = inputEl.value.trim()
  if (!word || !onSubmitCallback) return
  onSubmitCallback(word)
}

export function setInputValue(val) {
  if (inputEl) inputEl.value = val
}

export function getInputValue() {
  return inputEl ? inputEl.value.trim() : ''
}

/**
 * 输入框移动到底部停靠状态（从居中状态移开，避免与画布重叠）
 */
export function moveInputToBottom() {
  if (inputArea) inputArea.classList.add('docked')
}

/**
 * 输入框恢复居中状态
 */
export function moveInputToCenter() {
  if (inputArea) inputArea.classList.remove('docked')
}

export function setLoading(loading) {
  if (submitBtn) submitBtn.disabled = loading
  if (inputEl) inputEl.disabled = loading
}
