// Production: frontend və backend eyni serverdədir (Railway)
// Development: Vite dev server port 5173-dən, backend port 8000-dən işləyir
const isDev = typeof window !== 'undefined' && window.location.port === '5173';

export const API_BASE = isDev ? 'http://localhost:8000' : '';
