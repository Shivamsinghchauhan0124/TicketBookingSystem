'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { api } from '../utils/api';
import { Search, Calendar, MapPin, Ticket, Flame } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const data = await api.events.list(search, date);
      setEvents(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not load events. Make sure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchEvents();
  }, [search, date]);

  return (
    <>
      <Header />
      <main className="container" style={{ paddingBottom: '80px' }}>
        <section className="hero-section">
          <h1 className="hero-title">Experience Live Entertainment</h1>
          <p className="hero-subtitle">
            Book prime seats instantly with our high-concurrency protected visual mapping, waitlists, and instant secure QR ticketing.
          </p>
        </section>

        {/* Search & Filter Bar */}
        <div className="glass-panel filter-bar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, position: 'relative', minWidth: '240px' }}>
            <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <Search size={18} />
            </span>
            <input
              type="text"
              placeholder="Search movies, concerts, or festivals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '48px' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '16px', minWidth: '240px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                <Calendar size={18} />
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ paddingLeft: '48px' }}
              />
            </div>
            
            {(search || date) && (
              <button 
                onClick={() => { setSearch(''); setDate(''); }} 
                className="btn btn-secondary"
                style={{ padding: '12px 18px' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#ef4444', textAlign: 'center', marginBottom: '30px' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="spinner"></div>
        ) : events.length === 0 ? (
          <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Ticket size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
            <h3>No events found</h3>
            <p style={{ marginTop: '8px' }}>Try modifying your search or check back later!</p>
          </div>
        ) : (
          <div className="grid-events">
            {events.map((event) => {
              // Find price ranges
              const minPrice = event.prices.length > 0 ? Math.min(...event.prices.map(p => p.price)) : 0;
              const maxPrice = event.prices.length > 0 ? Math.max(...event.prices.map(p => p.price)) : 0;
              
              return (
                <div key={event.id} className="glass-panel event-card">
                  <div className="event-card-body">
                    <span className="event-tag event-tag-standard">
                      {event.venue.name}
                    </span>
                    <h2 className="event-title">{event.title}</h2>
                    <p className="event-desc">{event.description}</p>
                    
                    <div className="event-meta">
                      <div className="event-meta-item">
                        <Calendar size={15} />
                        <span>{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      </div>
                      <div className="event-meta-item">
                        <MapPin size={15} />
                        <span>{event.time} | {event.venue.name}</span>
                      </div>
                    </div>

                    <div className="event-price-info">
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>Tickets from</span>
                        <span className="price-tag">${minPrice} - ${maxPrice}</span>
                      </div>
                      
                      <button 
                        onClick={() => router.push(`/event/${event.id}`)}
                        className="btn btn-primary"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        Book Seats
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
