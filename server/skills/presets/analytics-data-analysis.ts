import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { writeFileSafe } from '../../utils/file-utils.js';

export interface DataAnalysisInput {
  dataFile: string;
  analysisType: 'summary' | 'correlation' | 'visualization' | 'prediction';
  outputDir: string;
}

export interface DataAnalysisResult {
  success: boolean;
  outputFiles: string[];
  summary: string;
  error?: string;
}

export async function execute(input: DataAnalysisInput): Promise<DataAnalysisResult> {
  const outputFiles: string[] = [];
  const dataPath = path.resolve(input.dataFile);
  const outDir = path.resolve(input.outputDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(dataPath)) {
    return { success: false, outputFiles: [], summary: '', error: `数据文件不存在: ${dataPath}` };
  }

  try {
    const ext = path.extname(dataPath).toLowerCase();
    let script = '';

    if (ext === '.csv' || ext === '.json') {
      script = generatePythonAnalysis(dataPath, input.analysisType, outDir);
      const scriptPath = path.join(outDir, 'analysis.py');
      writeFileSafe(scriptPath, script);
      const output = execSync(`python "${scriptPath}"`, { encoding: 'utf-8', timeout: 120000 });
      outputFiles.push(path.join(outDir, 'analysis_report.txt'));
      writeFileSafe(path.join(outDir, 'analysis_report.txt'), output);
      return { success: true, outputFiles, summary: output.slice(0, 2000) };
    }

    if (ext === '.xlsx' || ext === '.xls') {
      script = generateExcelAnalysis(dataPath, input.analysisType, outDir);
      const scriptPath = path.join(outDir, 'analysis.py');
      writeFileSafe(scriptPath, script);
      const output = execSync(`python "${scriptPath}"`, { encoding: 'utf-8', timeout: 120000 });
      return { success: true, outputFiles, summary: output.slice(0, 2000) };
    }

    return { success: false, outputFiles: [], summary: '', error: `不支持的文件格式: ${ext}` };
  } catch (e: any) {
    return { success: false, outputFiles, summary: '', error: e?.stderr || e?.message || String(e) };
  }
}

function generatePythonAnalysis(dataPath: string, type: string, outDir: string): string {
  return `
import pandas as pd
import json

data = pd.read_csv('${dataPath.replace(/\\/g, '/')}') if '${dataPath}'.endswith('.csv') else pd.read_json('${dataPath.replace(/\\/g, '/')}')
print(f"数据形状: {data.shape}")
print(f"列名: {list(data.columns)}")
print("\\n统计摘要:")
print(data.describe())

if '${type}' == 'correlation':
    print("\\n相关性矩阵:")
    print(data.corr(numeric_only=True))

if '${type}' == 'visualization':
    try:
        import matplotlib.pyplot as plt
        for col in data.select_dtypes(include=['number']).columns[:3]:
            plt.figure()
            data[col].hist()
            plt.title(col)
            plt.savefig('${outDir.replace(/\\/g, '/')}/hist_{col}.png')
        print("图表已保存")
    except ImportError:
        print("matplotlib 未安装")
`;
}

function generateExcelAnalysis(dataPath: string, type: string, outDir: string): string {
  return `
import pandas as pd
data = pd.read_excel('${dataPath.replace(/\\/g, '/')}')
print(f"Sheet 数量: {len(data.sheet_names) if hasattr(data, 'sheet_names') else 1}")
print(f"数据形状: {data.shape}")
print("\\n统计摘要:")
print(data.describe())
`;
}
