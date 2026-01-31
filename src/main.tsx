import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './App.tsx';
import MapEditorPage from './pages/MapEditorPage.tsx';
import MoltbookPlaybookPage from './pages/MoltbookPlaybookPage.tsx';
import Erc8004OnboardingPage from './pages/Erc8004OnboardingPage.tsx';
import './index.css';
import 'uplot/dist/uPlot.min.css';
import 'react-toastify/dist/ReactToastify.css';
import ConvexClientProvider from './components/ConvexClientProvider.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexClientProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ai-town" element={<Home />} />
          <Route path="/moltbook" element={<MoltbookPlaybookPage />} />
          <Route path="/ai-town/moltbook" element={<MoltbookPlaybookPage />} />
          <Route path="/erc8004" element={<Erc8004OnboardingPage />} />
          <Route path="/ai-town/erc8004" element={<Erc8004OnboardingPage />} />
          <Route path="/map-editor" element={<MapEditorPage />} />
          <Route path="/ai-town/map-editor" element={<MapEditorPage />} />
        </Routes>
      </BrowserRouter>
    </ConvexClientProvider>
  </React.StrictMode>,
);
