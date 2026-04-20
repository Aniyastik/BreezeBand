// Local storage-da 'backend_url' varsa onu istifadə et, yoxdursa cari hostu yoxla
const savedUrl = typeof window !== 'undefined' ? localStorage.getItem('backend_url') : null;

export const API_BASE = savedUrl || (window.location.port === '5173' 
    ? `http://${window.location.hostname}:8000` 
    : '');

export const setBackendUrl = (url) => {
    localStorage.setItem('backend_url', url);
    window.location.reload();
};
