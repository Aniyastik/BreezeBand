// Production: frontend və backend eyni serverdədir (Railway)
// Development: localhost üzərindən 8000-ci portda işləyən backendə müraciət
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port !== '8000';

export const API_BASE = isDev ? 'http://localhost:8000' : '';
