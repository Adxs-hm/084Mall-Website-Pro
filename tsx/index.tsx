
import React from 'react';
import ReactDOM from 'react-dom/client';

// The application has been converted to a multi-page vanilla HTML/CSS/JS architecture.
// This file is preserved to prevent build environment errors but is largely inactive.

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
       <div style={{padding: 20}}>Running in Multi-Page Mode. Check html/index.html</div>
    </React.StrictMode>
  );
} else {
  console.log('084 Mall: Running in Native HTML Mode.');
}
