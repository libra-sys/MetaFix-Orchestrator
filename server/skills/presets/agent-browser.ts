import { complete } from '../../llm/client.js';

export interface BrowserInput {
  url: string;
  action: 'fetch' | 'scrape' | 'fill_form' | 'screenshot_info';
  selector?: string;
  formData?: Record<string, string>;
}

export interface BrowserResult {
  success: boolean;
  title?: string;
  content?: string;
  links?: string[];
  error?: string;
}

export async function execute(input: BrowserInput): Promise<BrowserResult> {
  try {
    const resp = await fetch(input.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    if (input.action === 'fetch' || input.action === 'scrape') {
      // 用 LLM 提取结构化信息
      const systemPrompt = '你是一个网页内容提取专家。从 HTML 中提取关键信息。输出 JSON：{"title": "...", "content": "...", "links": ["..."]}';
      const userPrompt = `URL: ${input.url}\nHTML 片段:\n${html.slice(0, 10000)}\n\n请提取标题、正文内容和重要链接。`;
      try {
        const extracted = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.2 });
        const parsed = JSON.parse(extracted);
        return {
          success: true,
          title: parsed.title,
          content: parsed.content,
          links: Array.isArray(parsed.links) ? parsed.links : [],
        };
      } catch {
        return {
          success: true,
          title: extractTitle(html),
          content: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000),
          links: extractLinks(html, input.url),
        };
      }
    }

    return { success: true, title: extractTitle(html), content: html.slice(0, 2000) };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : 'No title';
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!links.includes(url)) links.push(url);
    } catch { /* ignore invalid urls */ }
  }
  return links.slice(0, 20);
}
