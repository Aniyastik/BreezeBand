// Local storage-da 'backend_url' varsa onu istifadə et, yoxdursa cari hostu yoxla
const savedUrl = typeof window !== 'undefined' ? localStorage.getItem('backend_url') : null;

let base = savedUrl || (window.location.port === '5173' 
    ? `http://${window.location.hostname}:8000` 
    : '');

// Strip trailing slash to avoid double-slash (//) which causes FastAPI to return 405
export const API_BASE = base.replace(/\/+$/, '');

export const setBackendUrl = (url) => {
    const cleanUrl = (url || '').trim().replace(/\/+$/, '');
    
    // Vercel URL-ni backend kimi istifadə etməyin qarşısını alırıq
    if (cleanUrl.includes('vercel.app')) {
        alert("Xəta: Siz backend əvəzinə frontend (Vercel) URL-ni daxil etdiniz! Zəhmət olmasa Render, Railway və ya lokal backend URL-ni daxil edin.");
        return;
    }
    
    localStorage.setItem('backend_url', cleanUrl);
    window.location.reload();
};
