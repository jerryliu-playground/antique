import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './voice'; // 注册 voice:token / voice:hands 监听(Phase 4)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
