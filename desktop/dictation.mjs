import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function dictate(signal) {
  if (process.platform !== 'win32') throw new Error('当前系统无法在应用内听写。');
  const program = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let result;
  try {
    const script = await readFile(new URL('./dictation.ps1', import.meta.url), 'utf8');
    const { stdout } = await execute(program, ['-NoLogo', '-NoProfile', '-NonInteractive',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 35000, signal, encoding: 'utf8' });
    result = JSON.parse(stdout);
  } catch (error) {
    if (signal.aborted) return '';
    if (error.killed) throw new Error('听写超时，可以重试。');
    throw new Error('无法启动 Windows 听写。可在输入框中按 Win + H 使用系统语音输入。');
  }
  if (result.status === 'unavailable') throw new Error('Windows 缺少兼容的本地语音识别组件。可尝试 Win + H。');
  if (result.status === 'empty') throw new Error('没有听清语音，请重试。');
  if (result.status !== 'ok') throw new Error('无法使用本地语音识别，请检查麦克风和 Windows 语音权限。也可尝试 Win + H。');
  if (!result.text) throw new Error('没有听清语音，请重试。');
  return result.text.trim().slice(0, 8000);
}
