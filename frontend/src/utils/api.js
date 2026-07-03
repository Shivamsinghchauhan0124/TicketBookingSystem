// C:\Users\shiva\.gemini\antigravity\scratch\ticket-booking-platform\frontend\src\utils\api.js

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-change'));
    }
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

export const api = {
  auth: {
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    me: () => request('/auth/me', { method: 'GET' }),
  },
  venues: {
    list: () => request('/venues', { method: 'GET' }),
    create: (body) => request('/venues', { method: 'POST', body }),
    get: (id) => request(`/venues/${id}`, { method: 'GET' }),
  },
  events: {
    list: (search = '', date = '') => {
      const query = new URLSearchParams();
      if (search) query.append('search', search);
      if (date) query.append('date', date);
      return request(`/events?${query.toString()}`, { method: 'GET' });
    },
    create: (body) => request('/events', { method: 'POST', body }),
    get: (id) => request(`/events/${id}`, { method: 'GET' }),
    organiserDashboard: () => request('/events/organiser/dashboard', { method: 'GET' }),
  },
  bookings: {
    hold: (eventId, seatIds) => request('/bookings/hold', { method: 'POST', body: { eventId, seatIds } }),
    release: (eventId, seatIds) => request('/bookings/release', { method: 'POST', body: { eventId, seatIds } }),
    confirm: (eventId, seatIds) => request('/bookings/confirm', { method: 'POST', body: { eventId, seatIds } }),
    cancel: (id) => request(`/bookings/cancel/${id}`, { method: 'POST' }),
    joinWaitlist: (eventId, category) => request('/bookings/waitlist', { method: 'POST', body: { eventId, category } }),
    history: () => request('/bookings/history', { method: 'GET' }),
  }
};
