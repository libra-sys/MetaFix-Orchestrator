import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';

export interface PdfInput {
  action: 'read' | 'merge' | 'split' | 'create';
  filePath: string;
  outputPath?: string;
  pages?: number[];
  mergeFiles?: string[];
  content?: string;
}

export interface PdfResult {
  success: boolean;
  outputPath?: string;
  text?: string;
  pageCount?: number;
  error?: string;
}

export async function execute(input: PdfInput): Promise<PdfResult> {
  switch (input.action) {
    case 'read': return readPdf(input.filePath);
    case 'merge': return mergePdfs(input.mergeFiles || [], input.outputPath || 'merged.pdf');
    case 'split': return splitPdf(input.filePath, input.pages || [], input.outputPath || 'split.pdf');
    case 'create': return createPdf(input.outputPath || 'output.pdf', input.content || '');
    default: return { success: false, error: `不支持的操作: ${input.action}` };
  }
}

async function readPdf(filePath: string): Promise<PdfResult> {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return { success: false, error: '文件不存在' };
    const buffer = fs.readFileSync(fullPath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    const info = await parser.getInfo();
    await parser.destroy();
    return {
      success: true,
      text: textResult.text.slice(0, 10000),
      pageCount: info.total || 0,
    };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

async function mergePdfs(files: string[], outputPath: string): Promise<PdfResult> {
  try {
    const out = path.resolve(outputPath);
    const merged = await PDFDocument.create();
    for (const file of files) {
      const fullPath = path.resolve(file);
      if (!fs.existsSync(fullPath)) continue;
      const buffer = fs.readFileSync(fullPath);
      const pdf = await PDFDocument.load(buffer);
      const copied = await merged.copyPages(pdf, pdf.getPageIndices());
      for (const page of copied) merged.addPage(page);
    }
    const buffer = await merged.save();
    fs.writeFileSync(out, buffer);
    return { success: true, outputPath: out, pageCount: merged.getPageCount() };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

async function splitPdf(filePath: string, pages: number[], outputPath: string): Promise<PdfResult> {
  try {
    const out = path.resolve(outputPath);
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return { success: false, error: '文件不存在' };
    const buffer = fs.readFileSync(fullPath);
    const pdf = await PDFDocument.load(buffer);
    const newPdf = await PDFDocument.create();
    const indices = pages.length > 0 ? pages.filter(p => p >= 0 && p < pdf.getPageCount()) : pdf.getPageIndices();
    const copied = await newPdf.copyPages(pdf, indices);
    for (const page of copied) newPdf.addPage(page);
    const newBuffer = await newPdf.save();
    fs.writeFileSync(out, newBuffer);
    return { success: true, outputPath: out, pageCount: newPdf.getPageCount() };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

async function createPdf(outputPath: string, content: string): Promise<PdfResult> {
  try {
    const out = path.resolve(outputPath);
    const dir = path.dirname(out);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = content.split('\n');

    let page = pdf.addPage([612, 792]);
    const { width, height } = page.getSize();
    let y = height - 50;
    const fontSize = 12;
    const lineHeight = fontSize * 1.2;
    const margin = 50;
    const maxWidth = width - margin * 2;

    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = pdf.addPage([612, 792]);
        y = height - 50;
      }
      const words = line.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);
        if (textWidth > maxWidth && currentLine) {
          page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
          y -= lineHeight;
          if (y < margin + lineHeight) {
            page = pdf.addPage([612, 792]);
            y = height - 50;
          }
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        y -= lineHeight;
      }
    }

    const buffer = await pdf.save();
    fs.writeFileSync(out, buffer);
    return { success: true, outputPath: out, pageCount: pdf.getPageCount() };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}
