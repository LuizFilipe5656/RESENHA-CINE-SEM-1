import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import '../App/styles.less';
import AdminApp from './AdminApp';

i18n
    .use(initReactI18next)
    .init({
        resources: { 'pt-BR': { translation: {} } },
        lng: 'pt-BR',
        fallbackLng: 'pt-BR',
        interpolation: { escapeValue: false },
    });

const root = ReactDOM.createRoot(document.getElementById('app')!);
root.render(
    <React.StrictMode>
        <AdminApp />
    </React.StrictMode>,
);
