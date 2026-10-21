import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme';
import { ToastProvider } from './toast';
import { ProgressProvider } from './progress';
import { AppShell } from './AppShell';

const HomePage = lazy(() => import('./HomePage').then((m) => ({ default: m.HomePage })));
const ModelerPage = lazy(() => import('../features/modeler/ModelerPage'));
const LibraryPage = lazy(() => import('../features/library/LibraryPage'));
const LearnPage = lazy(() => import('../features/learning/LearnPage'));
const ConceptPage = lazy(() => import('../features/learning/ConceptPage'));
const EncyclopediaPage = lazy(() => import('../features/learning/EncyclopediaPage'));
const ChallengesPage = lazy(() => import('../features/challenges/ChallengesPage'));
const ChallengePage = lazy(() => import('../features/challenges/ChallengePage'));
const SimulationPage = lazy(() => import('../features/performance-simulation/SimulationPage'));
const ComparePage = lazy(() => import('../features/optimization/ComparePage'));
const AboutPage = lazy(() => import('./AboutPage'));

function Loading() {
  return (
    <div className="page" aria-busy="true">
      <div className="muted">Loading…</div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ProgressProvider>
          <HashRouter>
            <AppShell>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/modeler" element={<ModelerPage />} />
                  <Route path="/modeler/:diagramId" element={<ModelerPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/learn" element={<LearnPage />} />
                  <Route path="/learn/:conceptId" element={<ConceptPage />} />
                  <Route path="/encyclopedia" element={<EncyclopediaPage />} />
                  <Route path="/encyclopedia/:entryId" element={<EncyclopediaPage />} />
                  <Route path="/challenges" element={<ChallengesPage />} />
                  <Route path="/challenges/:challengeId" element={<ChallengePage />} />
                  <Route path="/simulate" element={<SimulationPage />} />
                  <Route path="/simulate/:diagramId" element={<SimulationPage />} />
                  <Route path="/compare" element={<ComparePage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </HashRouter>
        </ProgressProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
