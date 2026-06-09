/**
 * api.js — fetch 请求封装
 */

export async function fetchDiverge(word) {
  const res = await fetch('/api/diverge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word })
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || '请求失败')
  }

  return data
}
