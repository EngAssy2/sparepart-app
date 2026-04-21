import axios from 'axios';

const client = axios.create({
    baseURL: '/api',
    timeout: 15000,
});

// Attach token to every request
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 globally
client.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            if (window.location.pathname !== '/login') {
                window.dispatchEvent(new CustomEvent('session-expired'));
            }
        }
        return Promise.reject(err);
    }
);

export default client;
