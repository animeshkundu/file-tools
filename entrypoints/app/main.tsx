import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../assets/tailwind.css';
import App from './App';

// Prevent the browser from navigating the tab when a file is dropped outside
// the Dropzone. Without this guard a stray drop replaces the extension page
// with the dropped file, destroying any in-progress extraction state.
// The Dropzone's own onDrop handler runs at the target element before the
// event bubbles here, so drops onto the Dropzone continue to work normally;
// this guard only suppresses the default browser navigation for drops that
// land anywhere else.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
