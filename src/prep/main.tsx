import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../site/styles/global.css';
import { PrepApp } from './PrepApp';

// The prep page scrolls, unlike the site.
document.body.style.overflow = 'auto';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrepApp />
  </StrictMode>,
);
