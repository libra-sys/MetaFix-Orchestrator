import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export interface XlsxInput {
  action: 'read' | 'write' | 'append';
  filePath: string;
  data?: Array<Record<string, string | number>>;
  sheetName?: string;
}

export interface XlsxResult {
  success: boolean;
  outputPath?: string;
  data?: Array<Record<string, string | number>>;
  sheetNames?: string[];
  error?: string;
}

export async function execute(input: XlsxInput): Promise<XlsxResult> {
  switch (input.action) {
    case 'read': return readXlsx(input.filePath);
    case 'write': return writeXlsx(input.filePath, input.data || [], input.sheetName || 'Sheet1');
    case 'append': return appendXlsx(input.filePath, input.data || []);
    default: return { success: false, error: `不支持的操作: ${input.action}` };
  }
}

function readXlsx(filePath: string): XlsxResult {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return { success: false, error: '文件不存在' };
    const workbook = XLSX.readFile(fullPath);
    const sheetNames = workbook.SheetNames;
    const result: Array<Record<string, string | number>> = [];
    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      if (json.length === 0) continue;
      const headers = json[0].map(h => String(h));
      for (let i = 1; i < json.length; i++) {
        const row: Record<string, string | number> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = json[i][j] !== undefined ? json[i][j] : '';
        }
        result.push(row);
      }
    }
    return { success: true, data: result, sheetNames };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

function writeXlsx(
  filePath: string,
  data: Array<Record<string, string | number>>,
  sheetName: string
): XlsxResult {
  try {
    const fullPath = path.resolve(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const workbook = XLSX.utils.book_new();
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    const rows = data.map(row => headers.map(h => row[h]));
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    XLSX.writeFile(workbook, fullPath);
    return { success: true, outputPath: fullPath };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

function appendXlsx(filePath: string, data: Array<Record<string, string | number>>): XlsxResult {
  try {
    const fullPath = path.resolve(filePath);
    let existing: Array<Record<string, string | number>> = [];
    if (fs.existsSync(fullPath)) {
      const result = readXlsx(filePath);
      if (result.success) existing = result.data || [];
    }
    const merged = [...existing, ...data];
    return writeXlsx(filePath, merged, 'Sheet1');
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}
