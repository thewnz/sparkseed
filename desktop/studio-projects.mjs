import { randomUUID } from 'node:crypto';
import { normalizeFigureDraft } from './scientific-figure.mjs';
import { normalizeFigureBrief } from './figure-brief.mjs';
import { normalizeFlowStyle } from './flow-style-brief.mjs';
import { normalizeFlowReviewRules } from './flow-review-rules.mjs';
import { flowPromptLimit, overviewDetailLayout } from './figure-workflow.mjs';
import { pictureTypes, pictureWorkflowOf } from './picture-workflow.mjs';

const emptyDraft = { type: 'slides', prompt: '', ideaId: '', coverId: '' };
const string = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';

function flowEditorDraft(value) {
  return {
    flowId: string(value.flowId, 80),
    selected: Number.isInteger(value.selected) && value.selected >= 0 && value.selected < 12 ? value.selected : null,
    blocks: Object.fromEntries(Object.entries(value.blocks || {}).filter(([id]) => /^(?:[0-9]|1[01])$/.test(id)).map(([id, block]) => [id, {
      kind: block?.kind === 'paper' ? 'paper' : 'agent', query: string(block?.query, 160), feedback: string(block?.feedback, 1500),
    }])),
    layoutFeedback: string(value.layoutFeedback, 1500),
    composition: ['stacked', 'overviewDetail'].includes(value.composition) ? value.composition : '',
    layoutArchetype: ['grid', 'vertical', 'horizontal', 'single'].includes(value.layoutArchetype) ? value.layoutArchetype : '',
  };
}

function studioDraft(draft) {
  const type = ['image', 'figure'].includes(draft?.type) ? draft.type : 'slides';
  return {
    type, prompt: string(draft?.prompt, 3000), ideaId: string(draft?.ideaId, 80), coverId: string(draft?.coverId, 80),
    ...(typeof draft?.slidesPrompt === 'string' ? { slidesPrompt: string(draft.slidesPrompt, 3000) } : {}),
    ...(typeof draft?.imagePrompt === 'string' ? { imagePrompt: string(draft.imagePrompt, 3000) } : {}),
    ...(type === 'figure' || draft?.figure ? { figure: normalizeFigureDraft(draft?.figure) } : {}),
    ...(draft?.flowFigure ? { flowFigure: normalizeFigureDraft({ ...draft.flowFigure, kind: 'diagram' }) } : {}),
    ...(draft?.flowEditor && typeof draft.flowEditor === 'object' ? { flowEditor: flowEditorDraft(draft.flowEditor) } : {}),
    ...(draft?.revisions && typeof draft.revisions === 'object' ? { revisions: Object.fromEntries(
      Object.entries(draft.revisions).filter(([id, text]) => /^[\w-]{1,80}$/.test(id) && typeof text === 'string')
        .map(([id, text]) => [id, string(text, 1500)])) } : {}),
    ...(typeof draft?.flowPrompt === 'string' ? { flowPrompt: string(draft.flowPrompt, flowPromptLimit) } : {}),
    ...(typeof draft?.flowRequirements === 'string' ? { flowRequirements: string(draft.flowRequirements, flowPromptLimit) } : {}),
    ...(typeof draft?.flowConstraints === 'string' ? { flowConstraints: string(draft.flowConstraints, flowPromptLimit) } : {}),
    ...(draft?.flowStyle ? { flowStyle: normalizeFlowStyle(draft.flowStyle) } : {}),
    ...(typeof draft?.flowStyleConfirmed === 'boolean' ? { flowStyleConfirmed: draft.flowStyleConfirmed } : {}),
    ...(Array.isArray(draft?.flowReviewRules) ? { flowReviewRules: normalizeFlowReviewRules(draft.flowReviewRules) } : {}),
    ...(['auto', 'overview-detail', 'parallel-merge', 'feedback-cycle', 'swimlane', 'matrix-feature', 'compact-method'].includes(draft?.flowReferenceId)
      ? { flowReferenceId: draft.flowReferenceId } : {}),
    ...(typeof draft?.flowStyleVersion === 'string' ? { flowStyleVersion: string(draft.flowStyleVersion, 80) } : {}),
    ...(type === 'figure' || draft?.figureBrief ? { figureBrief: normalizeFigureBrief(draft?.figureBrief) } : {}),
    ...(typeof draft?.concept === 'string' ? { concept: string(draft.concept, 3000) } : {}),
    ...(draft?.conceptLayout === overviewDetailLayout ? { conceptLayout: overviewDetailLayout } : {}),
    ...(Object.hasOwn(pictureTypes, draft?.pictureType) ? { pictureType: draft.pictureType } : {}),
    ...(pictureWorkflowOf(draft?.pictureWorkflow) ? { pictureWorkflow: draft.pictureWorkflow } : {}),
    ...(['local', 'concept'].includes(draft?.figureMode) ? { figureMode: draft.figureMode } : {}),
  };
}

export function createStudioProjects(db, setSetting) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_projects (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, draft TEXT NOT NULL,
      updated TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS studio_versions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES studio_projects(id),
      title TEXT NOT NULL, type TEXT NOT NULL, created TEXT, raster INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS studio_versions_project ON studio_versions(project_id);
  `);
  const read = db.prepare('SELECT * FROM studio_projects WHERE id = ?');
  const versions = db.prepare(`SELECT v.id, v.title, CASE
      WHEN v.type = 'image' AND json_valid(s.value) THEN
        CASE WHEN json_type(s.value, '$.concept') = 'object' THEN 'concept' ELSE v.type END
      ELSE v.type END AS type, v.created, v.raster
    FROM studio_versions v LEFT JOIN settings s ON v.type = 'image' AND s.key = 'studio:artifact:' || v.id
    WHERE v.project_id = ? ORDER BY v.rowid DESC`);
  const insertProject = db.prepare('INSERT INTO studio_projects (id, title, draft, updated) VALUES (?, ?, ?, ?)');
  const insertVersion = db.prepare('INSERT INTO studio_versions (id, project_id, title, type, created, raster) VALUES (?, ?, ?, ?, ?, ?)');
  const touch = db.prepare('UPDATE studio_projects SET updated = ? WHERE id = ?');
  const updateDraft = db.prepare('UPDATE studio_projects SET draft = ?, updated = ? WHERE id = ?');
  const archive = db.prepare('UPDATE studio_projects SET archived = ?, updated = ? WHERE id = ?');
  const rename = db.prepare('UPDATE studio_projects SET title = ?, updated = ? WHERE id = ?');
  const removeVersions = db.prepare('DELETE FROM studio_versions WHERE project_id = ?');
  const removeProject = db.prepare('DELETE FROM studio_projects WHERE id = ?');
  const removeSetting = db.prepare('DELETE FROM settings WHERE key = ?');
  const newestVersion = db.prepare('SELECT id FROM studio_versions ORDER BY rowid DESC LIMIT 1');
  const currentArtifact = db.prepare("SELECT json_extract(value, '$') AS id FROM settings WHERE key = 'studio:last' AND json_valid(value)");
  const attachmentIds = db.prepare(`
    SELECT json_extract(item.value, '$.artifact.id') AS message, json_extract(item.value, '$.answer.artifact.id') AS reply
    FROM ideas, json_each(CASE WHEN json_valid(ideas.discussion) THEN ideas.discussion ELSE '[]' END) AS item
    WHERE item.type = 'object'`);
  const otherCovers = db.prepare("SELECT json_extract(draft, '$.coverId') AS id FROM studio_projects WHERE id <> ? AND json_valid(draft)");
  const now = () => new Date().toISOString();

  function transaction(operation) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function parseDraft(value) {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : { ...emptyDraft }; }
    catch { return { ...emptyDraft }; }
  }
  function get(id) {
    const project = read.get(id);
    if (!project) throw new Error('找不到图文项目。');
    return { ...project, draft: parseDraft(project.draft), versions: versions.all(id) };
  }
  function projectTitle(value) {
    const title = string(value, 80).trim();
    if (!title) throw new Error('请输入项目名称。');
    return title;
  }
  function create(title, ideaId, figure) {
    const id = randomUUID();
    const initial = { ...emptyDraft, ideaId: string(ideaId, 80), ...(figure ? { type: 'figure', figure } : {}) };
    insertProject.run(id, projectTitle(title), JSON.stringify(studioDraft(initial)), now());
    return id;
  }

  function importLegacy() {
    const marker = db.prepare("SELECT 1 FROM settings WHERE key = 'studio:project-import'");
    if (marker.get()) return;
    transaction(() => {
      if (marker.get()) return;
      const rows = db.prepare(`SELECT substr(s.key, 17) AS id,
        json_extract(value, '$.title') AS title, json_extract(value, '$.type') AS type,
        (coalesce(json_extract(value, '$.data'), '') GLOB 'data:image/png;base64,*' OR
         coalesce(json_extract(value, '$.data'), '') GLOB 'data:image/jpeg;base64,*') AS raster
        FROM settings s WHERE s.key GLOB 'studio:artifact:*'
          AND NOT EXISTS (SELECT 1 FROM studio_versions v WHERE v.id = substr(s.key, 17)) ORDER BY s.rowid`).all();
      const artifacts = rows.filter(row => /^[a-f0-9-]{36}$/i.test(row.id) && row.title && ['slides', 'image'].includes(row.type));
      if (artifacts.length) {
        const id = create('历史作品');
        for (const artifact of artifacts) insertVersion.run(artifact.id, id, artifact.title, artifact.type, null, artifact.raster);
      }
      setSetting('studio:project-import', true);
    });
  }

  return {
    list() {
      importLegacy();
      return db.prepare(`SELECT id, title, updated, archived,
        json_extract(draft, '$.type') AS type,
        (SELECT count(*) FROM studio_versions WHERE project_id = p.id) AS versionCount
        FROM studio_projects p ORDER BY updated DESC, rowid DESC`).all();
    },
    get,
    create,
    rename(id, title) { get(id); rename.run(projectTitle(title), now(), id); },
    archive(id, archived) { get(id); archive.run(archived ? 1 : 0, now(), id); },
    remove(id) {
      importLegacy();
      return transaction(() => {
        const project = get(id);
        const versionIds = project.versions.map(version => version.id);
        const retained = new Set([
          ...attachmentIds.all().flatMap(row => [row.message, row.reply]),
          ...otherCovers.all(id).map(row => row.id),
        ]);
        removeVersions.run(id);
        removeProject.run(id);
        for (const versionId of versionIds) {
          if (!retained.has(versionId)) removeSetting.run('studio:artifact:' + versionId);
        }
        if (versionIds.includes(currentArtifact.get()?.id)) {
          const newest = newestVersion.get();
          if (newest) setSetting('studio:last', newest.id);
          else removeSetting.run('studio:last');
        }
      });
    },
    draft(id, draft) {
      const project = read.get(id);
      if (!project || project.archived) throw new Error('此项目无法编辑。');
      const { flowAssembly } = parseDraft(project.draft);
      const next = JSON.stringify({ ...studioDraft(draft), ...(flowAssembly ? { flowAssembly } : {}) });
      if (next !== project.draft) updateDraft.run(next, now(), id);
    },
    saveFlowAssembly(id, flowAssembly) {
      const project = read.get(id);
      if (!project || project.archived) throw new Error('此项目无法编辑。');
      const draft = parseDraft(project.draft);
      updateDraft.run(JSON.stringify({ ...draft, flowAssembly }), now(), id);
    },
    record(artifact, projectId) {
      transaction(() => {
        if (projectId && read.get(projectId)?.archived !== 0) throw new Error('此项目无法保存作品。');
        const created = now();
        setSetting('studio:artifact:' + artifact.id, artifact);
        setSetting('studio:last', artifact.id);
        if (projectId) {
          const raster = artifact.type === 'image' && /^data:image\/(png|jpeg);base64,/.test(artifact.data);
          const type = artifact.figure ? 'figure' : artifact.concept ? 'concept' : artifact.type;
          insertVersion.run(artifact.id, projectId, artifact.title, type, created, Number(raster));
          touch.run(created, projectId);
        }
      });
    },
  };
}
