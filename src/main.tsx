import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CaptionPoc from './CaptionPoc';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{new URLSearchParams(location.search).has('caption-poc')?<CaptionPoc/>:<App/>}</React.StrictMode>);
