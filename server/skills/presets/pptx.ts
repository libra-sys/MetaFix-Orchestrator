import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';

export interface PptxInput {
  action: 'create' | 'read';
  filePath: string;
  slides?: Array<{ title: string; content: string }>;
}

export interface PptxResult {
  success: boolean;
  outputPath?: string;
  slideCount?: number;
  text?: string;
  error?: string;
}

export async function execute(input: PptxInput): Promise<PptxResult> {
  if (input.action === 'create') {
    return createPptx(input.filePath, input.slides || []);
  }
  if (input.action === 'read') {
    return readPptx(input.filePath);
  }
  return { success: false, error: `不支持的操作: ${input.action}` };
}

async function createPptx(filePath: string, slides: Array<{ title: string; content: string }>): Promise<PptxResult> {
  try {
    const fullPath = path.resolve(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    for (const slide of slides) {
      const s = pptx.addSlide();
      s.addText(slide.title, { x: 0.5, y: 0.5, w: '90%', h: 1, fontSize: 24, bold: true, color: '363636' });
      s.addText(slide.content, { x: 0.5, y: 1.8, w: '90%', h: 4, fontSize: 14, color: '666666' });
    }

    await pptx.writeFile({ fileName: fullPath });
    return { success: true, outputPath: fullPath, slideCount: slides.length };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

function readPptx(filePath: string): PptxResult {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return { success: false, error: '文件不存在' };
    const buffer = fs.readFileSync(fullPath);
    const text = buffer.toString('utf-8');
    const texts: string[] = [];
    const regex = /<a:t>([^<]*)<\/a:t>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      texts.push(match[1]);
    }
    const slideMatch = text.match(/<p:sld/g);
    return { success: true, text: texts.join('\n'), slideCount: slideMatch ? slideMatch.length : 0 };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}
