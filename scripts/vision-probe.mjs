// 临时探针：用 safeStorage 解出连接密钥，测试供应商是否支持读图。不打印密钥。
import { app, safeStorage } from 'electron';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const profile = process.argv.find(arg => arg.startsWith('--profile='))?.slice(10);
const imagePath = process.argv.find(arg => arg.startsWith('--image='))?.slice(8) ||
  'C:/Users/lenovo/Desktop/想法记录器/public/brand-mark.png';
const models = (process.argv.find(arg => arg.startsWith('--models='))?.slice(9) || 'MiniMax-VL-01,MiniMax-M3,MiniMax-M2.7').split(',');

app.whenReady().then(async () => {
  try {
    const db = new DatabaseSync(profile.replace(/\//g, '\\') + '\\ideas.sqlite', { readOnly: true });
    const row = db.prepare("select value from settings where key='minimax'").get();
    db.close();
    const config = JSON.parse(row.value);
    const key = safeStorage.decryptString(Buffer.from(config.secret, 'base64'));
    console.log('key decrypted:', Boolean(key), 'base:', config.base, 'configured model:', config.model);
    const image = readFileSync(imagePath).toString('base64');
    for (const model of models) {
      const body = {
        model,
        messages: [{ role: 'user', content: [
          { type: 'text', text: '这张图里主要元素是什么？只回答一句中文。' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + image } },
        ] }],
        max_tokens: 120,
      };
      const started = Date.now();
      try {
        const response = await fetch(config.base.replace(/\/+$/, '').replace(/\/(chat\/completions|messages)$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90000),
        });
        const text = await response.text();
        console.log('---', model, 'HTTP', response.status, (Date.now() - started) + 'ms');
        console.log(text.slice(0, 500).replace(/sk-[\w-]+/g, '<key>'));
      } catch (error) {
        console.log('---', model, 'ERR', error?.name, String(error?.message || error).slice(0, 200));
      }
    }
  } catch (error) {
    console.log('PROBE FAILED', String(error?.stack || error).slice(0, 800));
  } finally {
    app.quit();
  }
});
