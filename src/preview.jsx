import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import './styles.css';
import './workspace-material.css';
import './visual-refinement.css';
import { PaperLibrary } from './paper-library.jsx';
import { NotesLibrary } from './notes-library.jsx';
import { UniverseBackground } from './universe-background.jsx';
import { ResearchProfileSettings } from './research-profile.jsx';
import { UserGuide } from './user-guide.jsx';
import { AutomationSettings } from './automation-settings.jsx';

document.documentElement.dataset.palette = 'light';
const view = new URLSearchParams(location.search).get('view');
const ideas = [{ id: 'idea-1', body: '小样本估计与分层抽样', excerpt: '', paper: '', page: '',
  created: '2026-11-10T09:00:00.000Z', discussion: [], status: 'idle' }];

createRoot(document.getElementById('root')).render(
  <div className="workspace" style={{ display: 'block', height: '100vh' }}>
    <UniverseBackground />
    <main className="workspace-content" style={{ height: '100%' }}>
      {view === 'notes' ? <NotesLibrary ideas={ideas} openIdea={() => {}} />
        : view === 'memory' ? <ResearchProfileSettings drafts={{}} setDrafts={() => {}} openIdea={() => {}} />
          : view === 'guide' ? <UserGuide />
            : view === 'automation' ? <div className="preferences"><div className="preferences-content"><AutomationSettings /></div></div>
            : <PaperLibrary />}
    </main>
  </div>,
);
