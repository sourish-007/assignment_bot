import 'dotenv/config';
import fetch from 'node-fetch';
import { resolveUnnamedColumns } from './unnamed_schema_mapper.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

async function withRetry(fn, retries = 3) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, (2 ** i + Math.random()) * 1000));
    }
  }
  throw lastErr;
}

function extractJSON(text) {
  text = text.replace(/```(?:json)?/g, '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    try {
      const fixedJson = fixBrokenJson(text);
      return fixedJson;
    } catch (e) {
      return JSON.stringify({
        clarifiedPrompt: text.substring(0, 200),
        assumptions: ["Unable to parse response properly"],
        sources: []
      });
    }
  }
  return match[0];
}

function fixBrokenJson(text) {
  try {
    if (text.includes('"clarifiedPrompt"') && 
        text.includes('"assumptions"') && 
        text.includes('"sources"')) {
      
      const clarifiedPromptMatch = text.match(/"clarifiedPrompt"\s*:\s*"([^"]+)"/);
      const assumptionsMatch = text.match(/"assumptions"\s*:\s*\[([\s\S]*?)\]/);
      const sourcesMatch = text.match(/"sources"\s*:\s*\[([\s\S]*?)\]/);
      
      const clarifiedPrompt = clarifiedPromptMatch ? clarifiedPromptMatch[1] : "";
      
      let assumptions = [];
      if (assumptionsMatch) {
        const assumptionsText = assumptionsMatch[1];
        assumptions = assumptionsText
          .split(',')
          .map(item => item.trim().replace(/^"|"$/g, ''))
          .filter(item => item);
      }
      
      let sources = [];
      if (sourcesMatch) {
        const sourcesText = sourcesMatch[1];
        sources = sourcesText
          .split(',')
          .map(item => item.trim().replace(/^"|"$/g, ''))
          .filter(item => item);
      }
      
      return JSON.stringify({
        clarifiedPrompt,
        assumptions,
        sources
      });
    }
  } catch (e) {
    console.error("Error fixing broken JSON:", e);
  }
  
  throw new Error("Could not fix broken JSON");
}

function createFallbackResponse(question) {
  return {
    clarifiedPrompt: question,
    assumptions: ["Using original query due to processing error"],
    sources: []
  };
}

export async function clarifyPrompt(vagueQuestion) {
  try {
    const { readable } = await resolveUnnamedColumns().catch(err => {
      console.error("Error resolving unnamed columns:", err);
      return { readable: "Schema unavailable" };
    });

    const systemText = `
You are an expert data analyst and SQL professional. You'll receive a business question and database schema.
Your task:
1) Rewrite the question to be clear, specific, and answerable with SQL
2) List your assumptions that guided your clarification
3) List the tables (and key columns) you would use to answer this question

Very important: Respond ONLY with a JSON object in this format:
{
  "clarifiedPrompt": "your clear, specific question",
  "assumptions": ["assumption 1", "assumption 2", ...],
  "sources": ["table1", "table2", ...]
}

Even if the schema is incomplete or the question is very vague, make your best effort to provide a JSON response.`;

    const userText = `
Schema:
${readable}

Question:
"${vagueQuestion}"`;

    const payload = {
      contents: [{ parts: [{ text: systemText + '\n' + userText }] }]
    };

    const res = await withRetry(() =>
      fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
    
    if (!res.ok) {
      console.error(`Gemini API error: ${res.status}`);
      return createFallbackResponse(vagueQuestion);
    }
    
    const data = await res.json();
    const candidates = data?.candidates || [];
    
    if (!candidates.length || !candidates[0]?.content) {
      console.error("No candidates in Gemini response");
      return createFallbackResponse(vagueQuestion);
    }

    const content = candidates[0].content;
    let text = '';
    
    if (content?.parts) {
      text = content.parts.map(p => p.text || '').join('');
    } else if (typeof content === 'string') {
      text = content;
    } else {
      console.error("Unexpected Gemini response format");
      return createFallbackResponse(vagueQuestion);
    }

    if (!text.trim()) {
      console.error("Empty response from Gemini");
      return createFallbackResponse(vagueQuestion);
    }

    const jsonStr = extractJSON(text);
    try {
      const result = JSON.parse(jsonStr);
      
      // Validate the result structure and provide defaults if needed
      return {
        clarifiedPrompt: result.clarifiedPrompt || vagueQuestion,
        assumptions: Array.isArray(result.assumptions) ? result.assumptions : ["Using best interpretation of query"],
        sources: Array.isArray(result.sources) ? result.sources : []
      };
    } catch (e) {
      console.error(`Error parsing JSON response: ${e.message}`);
      return createFallbackResponse(vagueQuestion);
    }
  } catch (error) {
    console.error("Error in clarifyPrompt:", error);
    return createFallbackResponse(vagueQuestion);
  }
}