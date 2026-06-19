import fs from 'fs';
import path from 'path';

export function readFileSafe(filePath: string, maxLength = 10000): string {
  try {
    const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
    if (content.length > maxLength) return content.slice(0, maxLength) + '\n... (truncated)';
    return content;
  } catch (e: any) {
    return `读取失败: ${e?.message}`;
  }
}

export function writeFileSafe(filePath: string, content: string): string {
  try {
    const fullPath = path.resolve(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return `写入成功: ${fullPath}`;
  } catch (e: any) {
    return `写入失败: ${e?.message}`;
  }
}

export function listFiles(dir: string, pattern?: string): string[] {
  try {
    const files = fs.readdirSync(path.resolve(dir), { recursive: true, withFileTypes: true })
      .filter((f: any) => f.isFile())
      .map((f: any) => path.join(f.parentPath || f.path, f.name).replace(/\\/g, '/'));
    if (pattern) return files.filter(f => f.includes(pattern));
    return files;
  } catch {
    return [];
  }
}

export function searchInFiles(dir: string, pattern: string, extensions: string[]): string[] {
  const results: string[] = [];
  try {
    const files = listFiles(dir);
    for (const file of files) {
      if (extensions.length > 0 && !extensions.some(ext => file.endsWith(ext))) continue;
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes(pattern)) results.push(file);
      } catch { /* ignore unreadable */ }
    }
  } catch { /* ignore */ }
  return results;
}
