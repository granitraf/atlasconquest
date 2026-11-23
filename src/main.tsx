import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installWoodTexture } from './map/wood';
// Pixel fonts, bundled with the build: VT323 for text, Press Start 2P for titles and big numbers.
import '@fontsource/vt323';
import '@fontsource/press-start-2p';
import './styles.css';

// The plank texture behind the start-screen map is drawn once, before the first paint.
installWoodTexture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
