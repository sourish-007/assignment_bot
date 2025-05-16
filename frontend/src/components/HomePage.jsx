import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts'
import './HomePage.css'

export default function HomePage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isCriticalThinking, setIsCriticalThinking] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleSend = async () => {
    if (!input.trim()) return
    const userMsg = { id: Date.now(), text: input, isUser: true }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    const botMsg = { id: Date.now() + 1, thinking: true }
    setMessages(prev => [...prev, botMsg])
    try {
      const res = await fetch('http://localhost:5000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input, useCriticalThinking: isCriticalThinking }),
        credentials: 'include'
      })
      const data = await res.json()
      const botResponse = {
        id: botMsg.id,
        thinking: false,
        summary: data.summary,
        narrative: data.narrative,
        tableData: data.data,
        visualization: data.visualization
      }
      setMessages(prev => prev.map(m => m.id === botMsg.id ? botResponse : m))
    } catch (e) {
      setMessages(prev =>
        prev.map(m =>
          m.id === botMsg.id
            ? { ...m, thinking: false, narrative: `Error: ${e.message}` }
            : m
        )
      )
    }
  }

  const renderTable = data => {
    const keys = Object.keys(data[0])
    return (
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>{keys.map(k => <th key={k}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((row, i) =>
              <tr key={i}>
                {keys.map(k =>
                  <td key={k}>
                    {typeof row[k] === 'number'
                      ? row[k].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : row[k]}
                  </td>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const renderChart = (viz, data) => {
    if (!viz) return null
    const { type, config } = viz
    switch (type) {
      case 'bar':
        return (
          <BarChart width={500} height={300} data={data}>
            <XAxis dataKey={config.xAxis} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey={config.yAxis} />
          </BarChart>
        )
      case 'line':
        return (
          <LineChart width={500} height={300} data={data}>
            <XAxis dataKey={config.xAxis} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={config.yAxis} />
          </LineChart>
        )
      case 'pie':
        return (
          <PieChart width={400} height={300}>
            <Tooltip />
            <Legend />
            <Pie
              data={data}
              dataKey={config.value}
              nameKey={config.category}
              cx="50%" cy="50%" outerRadius={100} label
            />
          </PieChart>
        )
      case 'radar':
        return (
          <RadarChart
            outerRadius={90} width={500} height={300}
            data={config.metrics.map(m => ({
              subject: m,
              A: data.reduce((sum, d) => sum + (d[m] || 0), 0) / data.length
            }))}
          >
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis />
            <Radar dataKey="A" />
          </RadarChart>
        )
      default:
        return null
    }
  }

  const renderMessage = msg => (
    <div key={msg.id} className={`message-wrapper ${msg.isUser ? 'user-wrapper' : 'bot-wrapper'}`}>
      <div className={`message ${msg.isUser ? 'user-message' : 'bot-message'}`}>
        {msg.isUser
          ? msg.text
          : msg.thinking
            ? 'Thinking...'
            : (
              <>
                {msg.summary && <h2 className="summary">{msg.summary}</h2>}
                {msg.narrative && (
                  <div className="narrative">
                    <ReactMarkdown>{msg.narrative}</ReactMarkdown>
                  </div>
                )}
                {msg.visualization && renderChart(msg.visualization, msg.tableData)}
                {msg.tableData && renderTable(msg.tableData)}
              </>
            )
        }
      </div>
    </div>
  )

  return (
    <div className="app-container">
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
      <div className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
        <button className="new-chat-btn">New Chat</button>
      </div>
      <div className={`main-area ${sidebarOpen ? '' : 'expanded'}`}>
        <div className="messages-container">
          {messages.map(renderMessage)}
        </div>
        <div className="input-area">
          <div className="input-container">
            <button
              className={`thinking-btn ${isCriticalThinking ? 'active' : ''}`}
              onClick={() => setIsCriticalThinking(!isCriticalThinking)}
            >
              Critical Thinking
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              className="chat-input"
              placeholder="Ask about your business data..."
            />
            <button className="send-btn" onClick={handleSend}>Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}