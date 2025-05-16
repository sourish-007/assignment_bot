export async function determineColumnType(columnName, sampleValue, geminiUrl, geminiKey) {
  if (sampleValue === null || sampleValue === undefined) return 'unknown';
  
  if (typeof sampleValue !== 'string') return typeof sampleValue;
  
  const moneyPattern = /^\$?[\d,.]+$/;
  const percentPattern = /^[\d,.]+%$/;
  const datePattern = /^\d{1,4}[-/\.]\d{1,2}[-/\.]\d{1,4}|\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}$/;
  const timePattern = /^\d{1,2}:\d{2}(:\d{2})?(\s*[AaPp][Mm])?$/;
  const numericPattern = /^[\d,.]+$/;
  
  const lowercaseColumn = columnName.toLowerCase();
  
  if (lowercaseColumn.includes('date') || lowercaseColumn.includes('time') || 
      lowercaseColumn.includes('created') || lowercaseColumn.includes('updated') ||
      datePattern.test(sampleValue)) {
    return 'date';
  }
  
  if (lowercaseColumn.includes('time') && timePattern.test(sampleValue)) {
    return 'time';
  }
  
  if (lowercaseColumn.includes('price') || lowercaseColumn.includes('cost') || 
      lowercaseColumn.includes('amount') || lowercaseColumn.includes('total') ||
      lowercaseColumn.includes('revenue') || lowercaseColumn.includes('sales') ||
      lowercaseColumn.includes('expense') || lowercaseColumn.includes('budget') ||
      moneyPattern.test(sampleValue)) {
    return 'money';
  }
  
  if (lowercaseColumn.includes('percent') || lowercaseColumn.includes('rate') ||
      lowercaseColumn.includes('ratio') || percentPattern.test(sampleValue)) {
    return 'percentage';
  }
  
  if (lowercaseColumn.includes('count') || lowercaseColumn.includes('number') ||
      lowercaseColumn.includes('qty') || lowercaseColumn.includes('quantity') ||
      lowercaseColumn.includes('id') || lowercaseColumn.includes('age') ||
      numericPattern.test(sampleValue)) {
    return 'number';
  }
  
  if (sampleValue.length > 100) {
    return 'text';
  }
  
  try {
    const promptText = `
    Analyze this column name "${columnName}" with sample value "${sampleValue}".
    What data type is it most likely? Choose from:
    1. date (dates in any format)
    2. time (times in any format)
    3. money (monetary values)
    4. percentage (percentage values)
    5. number (any numeric values)
    6. boolean (true/false values)
    7. text (general text)
    
    Return ONLY the single word answer with no explanation.`;
    
    const payload = { contents: [{ parts: [{ text: promptText }] }] };
    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) return 'text';
    
    const { candidates } = await res.json();
    const content = candidates?.[0]?.content;
    const text = content?.parts
      ? content.parts.map(p => p.text).join('').toLowerCase().trim()
      : 'text';
    
    if (['date', 'time', 'money', 'percentage', 'number', 'boolean'].includes(text)) {
      return text;
    }
    
    return 'text';
  } catch (e) {
    return 'text';
  }
}

export function cleanDataRow(row, columnTypes) {
  const cleanedRow = {};
  
  for (const key in row) {
    const value = row[key];
    const type = columnTypes[key] || 'text';
    
    if (value === null || value === undefined) {
      cleanedRow[key] = null;
      continue;
    }
    
    if (typeof value === 'string') {
      switch (type) {
        case 'money':
          cleanedRow[key] = parseFloat(value.replace(/[\$,]/g, '')) || 0;
          break;
        
        case 'percentage':
          cleanedRow[key] = parseFloat(value.replace(/[%,]/g, '')) / 100 || 0;
          break;
        
        case 'number':
          cleanedRow[key] = parseFloat(value.replace(/,/g, '')) || 0;
          break;
        
        case 'boolean':
          const lowVal = value.toLowerCase().trim();
          if (['true', 'yes', '1', 'y', 't'].includes(lowVal)) {
            cleanedRow[key] = true;
          } else if (['false', 'no', '0', 'n', 'f'].includes(lowVal)) {
            cleanedRow[key] = false;
          } else {
            cleanedRow[key] = value;
          }
          break;
        
        case 'date':
          try {
            cleanedRow[key] = new Date(value).toISOString();
          } catch (e) {
            cleanedRow[key] = value;
          }
          break;
        
        default:
          cleanedRow[key] = value;
      }
    } else {
      cleanedRow[key] = value;
    }
  }
  
  return cleanedRow;
}

export async function cleanDataRows(rows, geminiUrl, geminiKey) {
  if (!rows || rows.length === 0) return [];
  
  const columnTypes = {};
  
  const firstRow = rows[0];
  
  for (const key in firstRow) {
    columnTypes[key] = await determineColumnType(key, firstRow[key], geminiUrl, geminiKey);
  }
  
  return rows.map(row => cleanDataRow(row, columnTypes));
}