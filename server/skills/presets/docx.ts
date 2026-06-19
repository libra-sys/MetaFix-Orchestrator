import fs from 'fs';
import path from 'path';
import {
  Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow,
  AlignmentType, HeadingLevel, Header, Footer, PageNumber
} from 'docx';
import type { IParagraphOptions } from 'docx';

export interface DocxInput {
  action: 'create' | 'read' | 'modify';
  filePath: string;
  content?: string;
  templatePath?: string;
  title?: string;
  tables?: Array<Array<string>>;
}

export interface DocxResult {
  success: boolean;
  outputPath?: string;
  content?: string;
  error?: string;
}

export async function execute(input: DocxInput): Promise<DocxResult> {
  if (input.action === 'create') {
    return createDocx(input.filePath, input.content || '', input.title, input.tables);
  }
  if (input.action === 'read') {
    return readDocx(input.filePath);
  }
  if (input.action === 'modify') {
    return modifyDocx(input.filePath, input.content || '');
  }
  return { success: false, error: `不支持的操作: ${input.action}` };
}

async function createDocx(
  filePath: string,
  content: string,
  title?: string,
  tables?: Array<Array<string>>
): Promise<DocxResult> {
  try {
    const fullPath = path.resolve(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const children: (Paragraph | Table)[] = [];

    if (title) {
      children.push(new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }));
      children.push(new Paragraph({ text: '' }));
    }

    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        children.push(new Paragraph({
          text: line.slice(2),
          heading: HeadingLevel.HEADING_1,
        }));
      } else if (line.startsWith('## ')) {
        children.push(new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
        }));
      } else if (line.startsWith('### ')) {
        children.push(new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_3,
        }));
      } else if (line.trim()) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line })],
        }));
      } else {
        children.push(new Paragraph({ text: '' }));
      }
    }

    if (tables && tables.length > 0) {
      children.push(new Paragraph({ text: '' }));
      const rows = tables.map(row =>
        new TableRow({
          children: row.map(cell =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: cell })] })],
            })
          ),
        })
      );
      children.push(new Table({ rows }));
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children,
        headers: {
          default: new Header({
            children: [new Paragraph({ text: title || 'Document', alignment: AlignmentType.RIGHT })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [
                new TextRun({ text: 'Page ' }),
                new TextRun({ children: [PageNumber.CURRENT] }),
              ],
              alignment: AlignmentType.CENTER,
            })],
          }),
        },
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(fullPath, buffer);
    return { success: true, outputPath: fullPath };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

function readDocx(filePath: string): DocxResult {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return { success: false, error: '文件不存在' };
    const buffer = fs.readFileSync(fullPath);
    const text = buffer.toString('utf-8');
    const texts: string[] = [];
    const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      texts.push(match[1]);
    }
    return { success: true, content: texts.join(' ') || text.slice(0, 5000) };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

async function modifyDocx(filePath: string, newContent: string): Promise<DocxResult> {
  return createDocx(filePath, newContent);
}
