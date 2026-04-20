// Local storage-da 'backend_url' varsa onu istifadə et, yoxdursa cari hostu yoxla
const savedUrl = typeof window !== 'undefined' ? localStorage.getItem('backend_url') : null;

let base = savedUrl || (window.location.port === '5173' 
    ? `http://${window.location.hostname}:8000` 
    : '');

// Strip trailing slash to avoid double-slash (//) which causes FastAPI to return 405
export const API_BASE = base.replace(/\/+$/, '');

export const setBackendUrl = (url) => {
    const cleanUrl = (url || '').trim().replace(/\/+$/, '');
    localStorage.setItem('backend_url', cleanUrl);
    window.location.reload();
};
