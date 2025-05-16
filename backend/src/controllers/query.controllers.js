import 'dotenv/config'
import fetch from 'node-fetch'
import { Pool } from 'pg'
import { clarifyPrompt } from '../utils/vague_prompt_analyzer.js'
import { cleanDataRows } from '../utils/data_cleaner.js'
import { getSchemaWithValues } from '../utils/schema_values.js'

const POOL = new Pool({ connectionString: process.env.DATABASE_URL })
const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`

async function withRetry(fn, retries = 2) {
  let lastError
  for (let i = 0; i <= retries; i++) {
    try { return await fn() }
    catch (e) {
      lastError = e
      if (i < retries) await new Promise(r => setTimeout(r, 2 ** i * 1000))
    }
  }
  throw lastError
}

function extractJSON(text) {
  text = text.replace(/```(?:json)?/g, '')
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('No JSON object found')
  return m[0]
}

async function generateSQL(prompt, schemaWithValues) {
  const systemText = `
You are a PostgreSQL SQL expert.  
Given the schema below—including sample values for each text column—generate a query to answer this question.

Schema & Sample Values:
${schemaWithValues}

Question:
"${prompt}"

Return *only* a JSON object:
{
  "sql": "<valid PostgreSQL SQL>",
  "summary": "<one-line description>"
}
Use PostgreSQL functions (e.g., DATE_TRUNC). Do NOT perform string cleanup in SQL.
`
  const res = await withRetry(() =>
    fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ contents:[{ parts:[{ text:systemText }] }] })
    })
  )
  if (!res.ok) throw new Error(`Gemini API ${res.status}`)
  const { candidates } = await res.json()
  const content = candidates?.[0]?.content
  const text = content?.parts
    ? content.parts.map(p => p.text).join('')
    : typeof content==='string'
      ? content
      : ''
  const jsonStr = extractJSON(text)
  const parsed = JSON.parse(jsonStr)
  if (!parsed.sql) throw new Error(`Missing sql field`)
  return parsed
}

async function runSQL(sql) {
  if (!sql.trim()) throw new Error('Empty SQL')
  const { rows } = await POOL.query(sql)
  return cleanDataRows(rows)
}

async function generateInsights(summary, data) {
  const promptText = `
Provide a concise analytical narrative highlighting trends and anomalies based on:
Summary: ${summary}
Data: ${JSON.stringify(data)}
`
  const res = await withRetry(() =>
    fetch(GEMINI_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ contents:[{ parts:[{ text:promptText }] }] })
    })
  )
  if (!res.ok) throw new Error(`Gemini API ${res.status}`)
  const { candidates } = await res.json()
  const content = candidates?.[0]?.content
  const text = content?.parts
    ? content.parts.map(p => p.text).join('')
    : typeof content==='string'
      ? content
      : ''
  return text.trim()
}

async function generateVisualization(summary, data) {
  const promptText = `
Based on the summary and data below, recommend the best chart (bar, line, pie, or radar)
and return *only* JSON:

{
  "type": "<chart type>",
  "config": {
    // for bar/line: "xAxis":"<field>", "yAxis":"<field>"
    // for pie: "category":"<field>", "value":"<field>"
    // for radar: "metrics":["<field1>","<field2>",...]
  }
}

Summary: ${summary}
Data: ${JSON.stringify(data)}
`
  const res = await withRetry(() =>
    fetch(GEMINI_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ contents:[{ parts:[{ text:promptText }] }] })
    })
  )
  if (!res.ok) throw new Error(`Gemini API ${res.status}`)
  const { candidates } = await res.json()
  const content = candidates?.[0]?.content
  const text = content?.parts
    ? content.parts.map(p => p.text).join('')
    : typeof content==='string'
      ? content
      : ''
  const jsonStr = extractJSON(text)
  const parsed = JSON.parse(jsonStr)
  return parsed
}

export default async function queryController(req, res) {
  const client = await POOL.connect()
  try {
    const rawPrompt = req.body.prompt
    if (!rawPrompt) return res.status(400).json({ error:'Provide req.body.prompt' })

    const { clarifiedPrompt, assumptions, sources } = await clarifyPrompt(rawPrompt)
    const schemaWithValues = await getSchemaWithValues()
    const { sql, summary } = await generateSQL(clarifiedPrompt, schemaWithValues)
    const data = await runSQL(sql)
    const narrative = await generateInsights(summary, data)
    const visualization = data.length ? await generateVisualization(summary, data) : null

    res.json({
      clarifiedPrompt,
      assumptions,
      sources,
      summary,
      narrative,
      data: data.length ? data : undefined,
      visualization
    })
  } catch (e) {
    res.status(500).json({ error:e.message })
  } finally {
    client.release()
  }
}