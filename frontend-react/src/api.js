export const API_BASE = window.location.port === '5173' 
    ? `http://${window.location.hostname}:8000` 
    : '';
