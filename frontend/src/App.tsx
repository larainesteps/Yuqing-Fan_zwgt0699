// Application shell: the sidebar, the routed page area, and nothing else. Every page owns
// its own data and its own heading, so this file does not grow when a page is added — only
// `routes.ts` does.
import { Route, Routes, useLocation } from 'react-router-dom';
import { useApiResource } from './hooks/useApiResource';
import { SearchProvider } from './hooks/useSearch';
import { Sidebar } from './components/Sidebar';
import { routeFor } from './routes';
import type { CaseRow } from './types';

import OverviewPage from './pages/OverviewPage';
import SchedulePage from './pages/SchedulePage';
import CasesPage from './pages/CasesPage';
import ClinicalIntakePage from './pages/ClinicalIntakePage';
import ResourcesPage from './pages/ResourcesPage';
import EvaluationPage from './pages/EvaluationPage';

export default function App() {
  const location = useLocation();
  const route = routeFor(location.pathname);

  // The sidebar shows a case count on every page, so it is the one query the shell owns.
  const cases = useApiResource<CaseRow[]>('/cases', 'Cases');

  return (
    <SearchProvider>
      <div className="shell">
        <Sidebar caseCount={cases.data?.length ?? null} />
        <main key={route.path}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/cases" element={<CasesPage />} />
            <Route path="/intake" element={<ClinicalIntakePage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/evaluation" element={<EvaluationPage />} />
            <Route path="*" element={<OverviewPage />} />
          </Routes>
        </main>
      </div>
    </SearchProvider>
  );
}
