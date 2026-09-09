import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/App.jsx';
import '@xyflow/react/dist/style.css';
import './style.css';
createRoot(document.getElementById('root')).render(React.createElement(App));
