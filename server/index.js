import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001
const API_BASE_URL = (process.env.API_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
const API_KEY = process.env.API_KEY || process.env.DEEPSEEK_API_KEY || ''
const API_MODEL = process.env.API_MODEL || 'deepseek-chat'

app.post('/api/diverge', async (req, res) => {
  const { word } = req.body
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: '请提供一个词' })
  }

  if (!API_KEY || API_KEY === 'your_api_key_here') {
    return res.status(500).json({ error: '请在 .env 文件中配置 API_KEY' })
  }

  try {
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept-Encoding': 'identity'
      },
      body: JSON.stringify({
        model: API_MODEL,
        stream: false,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `你是一个创意联想助手，擅长从一个词出发，沿着具体的方向（工具、场景、人物、风格、趋势等）找到生动且强相关的联想词。你的联想让人感觉"妙啊，确实是这样"，而不是"这有什么关系？"。你只返回JSON数组，不返回其他内容。`
          },
          {
            role: 'user',
            content: `用户输入了"${word}"，请围绕它联想8个词。

核心原则：每个词必须和"${word}"强相关。联想可以巧妙、有趣，但不能牵强——如果别人看到这个词，应该能立刻明白"为什么从${word}想到了它"。

联想方向建议（每个方向挑一两个即可，不用全部覆盖）：
- 工具/设备：${word}常用什么工具
- 场景/空间：${word}在什么环境下工作或出现
- 上下游：${word}的上游输入或下游产出是什么
- 风格/流派：${word}领域内有什么分支或风格
- 代表人物/品牌：行业内公认的名字
- 痛点/需求：${word}面临什么困扰或用户需要什么
- 搭配/组合：${word}常和什么一起出现
- 趋势/新事物：${word}领域最近有什么新变化

要求：
1. 每个联想词必须是和"${word}"直接相关的具体事物，不能是抽象概念
2. 优先选生动、有画面感的词，让人能"看到"它
3. 网感可以有，但不能为了网感牺牲相关性
4. 每个词包含 zh 和 en，严格按JSON数组返回，不要其他文字

返回格式：[{"zh":"中文词","en":"english"},...]`
          }
        ]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('DeepSeek API error:', response.status, errText)
      return res.status(502).json({ error: `DeepSeek API 返回错误: ${response.status}` })
    }

    const rawText = await response.text()

    // 兼容 SSE 流式格式（data: {...}\n\n）和普通 JSON 格式
    let content = ''
    if (rawText.trimStart().startsWith('data:')) {
      // 流式：拼接所有 delta.content
      const lines = rawText.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const chunk = JSON.parse(payload)
          content += chunk.choices?.[0]?.delta?.content || ''
        } catch {}
      }
    } else {
      // 普通 JSON
      const data = JSON.parse(rawText)
      content = data.choices?.[0]?.message?.content || ''
    }

    // 从返回内容中提取 JSON 数组（兼容 markdown 代码块包裹）
    const jsonMatch = content.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) {
      console.error('无法解析返回内容:', content)
      return res.status(502).json({ error: '无法解析 DeepSeek 返回内容' })
    }

    const words = JSON.parse(jsonMatch[0])

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(502).json({ error: '返回数据格式不正确' })
    }

    res.json({ word, words })
  } catch (err) {
    console.error('Server error:', err)
    res.status(500).json({ error: err.message || '服务器内部错误' })
  }
})

app.listen(PORT, () => {
  console.log(`🚀 Creative Muse server running on http://localhost:${PORT}`)
})
