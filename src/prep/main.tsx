import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../site/styles/global.css';
import './prep.css';
import { PrepApp } from './PrepApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrepApp />
  </StrictMode>,
);
