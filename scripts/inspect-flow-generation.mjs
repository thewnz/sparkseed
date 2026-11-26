import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { renderCompositeFlow } from '../desktop/composite-flow.mjs';
import { modelFigureArtifact } from '../desktop/model-figure.mjs';
import { exportFlowArchive } from '../desktop/flow-design.mjs';

const directory = new URL('../artifacts/flow-generation-check/', import.meta.url);
const electron = process.versions.electron ? await import('electron') : null;
const app = electron?.app;
try {
  if (app) {
    app.setPath('userData', await mkdtemp(join(tmpdir(), 'sparkseed-flow-check-')));
    await app.whenReady();
  }
  const exporter = app ? await import('../desktop/figure-export.mjs') : null;
  for (const name of process.argv.slice(2)) {
    if (!['wavelength', 'hydrology'].includes(name)) throw new Error('Choose wavelength or hydrology.');
    const zipPath = new URL(name + '.zip', directory);
    const zip = await JSZip.loadAsync(await readFile(zipPath));
    const figure = JSON.parse(await zip.file('figure.json').async('string'));
    const { specification, flowPlan, designBrief } = figure;
    const svg = renderCompositeFlow(flowPlan, specification, designBrief);
    const artifact = modelFigureArtifact({ svg }, specification, figure);
    const { data } = artifact;
    if (exporter) {
      const checks = await exporter.inspectRenderedFigure(data);
      artifact.figure.renderChecks = checks;
      for (const format of ['png', 'pdf']) {
        await writeFile(new URL(name + '.' + format, directory), await exporter.renderFigureExport(data, format));
      }
      await writeFile(new URL(name + '-render.json', directory), JSON.stringify(checks, null, 2));
      console.log(name, JSON.stringify(checks));
    }
    await writeFile(new URL(name + '.svg', directory), Buffer.from(data.split(',')[1], 'base64'));
    await writeFile(zipPath, await exportFlowArchive(artifact));
  }
} catch (error) {
  console.error(error);
  if (app) app.exit(1);
  else process.exitCode = 1;
}
app?.quit();
