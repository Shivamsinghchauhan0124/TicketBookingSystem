'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import { api } from '../../utils/api';
import { PlusSquare, Calendar, MapPin, DollarSign, Users, Award, TrendingUp } from 'lucide-react';

export default function OrganizerDashboard() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Event form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venueId, setVenueId] = useState('');
  const [premiumPrice, setPremiumPrice] = useState('150');
  const [standardPrice, setStandardPrice] = useState('80');
  const [formLoading, setFormLoading] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const dashboardStats = await api.events.organiserDashboard();
      setEvents(dashboardStats);
      
      const venueList = await api.venues.list();
      setVenues(venueList);
      
      if (venueList.length > 0) {
        setVenueId(venueList[0].id);
      }
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not load organiser portal details. Make sure you are registered as an ORGANISER.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    const user = JSON.parse(userStr);
    if (user.role !== 'ORGANISER') {
      router.push('/');
      return;
    }

    fetchDashboardData();
  }, []);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!title || !date || !time || !venueId || !premiumPrice || !standardPrice) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setFormLoading(true);
      setError('');
      setSuccess('');

      const prices = {
        PREMIUM: parseFloat(premiumPrice),
        STANDARD: parseFloat(standardPrice)
      };

      await api.events.create({
        title,
        description,
        date,
        time,
        venueId,
        prices
      });

      setSuccess('Event listed successfully! Seats populated in database.');
      
      // Reset form
      setTitle('');
      setDescription('');
      setDate('');
      setTime('');
      setPremiumPrice('150');
      setStandardPrice('80');

      // Refresh dashboard list
      const stats = await api.events.organiserDashboard();
      setEvents(stats);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create event.');
    } finally {
      setFormLoading(false);
    }
  };

  const totalOrganizerRevenue = events.reduce((sum, e) => sum + e.totalRevenue, 0);
  const totalTicketsSold = events.reduce((sum, e) => sum + e.bookedSeats, 0);

  if (loading) {
    return (
      <>
        <Header />
        <div className="spinner"></div>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="container" style={{ paddingBottom: '80px', paddingTop: '40px' }}>
        
        <div className="dashboard-header">
          <div>
            <h1 className="hero-title" style={{ fontSize: '32px', textAlign: 'left', margin: 0 }}>Organiser Dashboard</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              Create event shows, monitor seating sales status, and analyze venue revenues.
            </p>
          </div>
        </div>

        {error && (
          <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', marginBottom: '24px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#10b981', marginBottom: '24px', fontSize: '14px' }}>
            {success}
          </div>
        )}

        {/* Sales High-level Metrics */}
        <div className="stat-grid">
          <div className="glass-panel stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="stat-label">Total Revenue</span>
              <div className="stat-value" style={{ color: '#10b981' }}>${totalOrganizerRevenue.toFixed(2)}</div>
            </div>
            <TrendingUp size={36} style={{ color: 'rgba(16, 185, 129, 0.2)' }} />
          </div>

          <div className="glass-panel stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="stat-label">Tickets Sold</span>
              <div className="stat-value" style={{ color: '#6366f1' }}>{totalTicketsSold}</div>
            </div>
            <Users size={36} style={{ color: 'rgba(99, 102, 241, 0.2)' }} />
          </div>

          <div className="glass-panel stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="stat-label">Active Events</span>
              <div className="stat-value" style={{ color: '#f59e0b' }}>{events.length}</div>
            </div>
            <Calendar size={36} style={{ color: 'rgba(245, 158, 11, 0.2)' }} />
          </div>
        </div>

        <div className="detail-layout">
          
          {/* List of Shows & seating stats */}
          <div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>Your Event Listings</h2>

              {events.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Calendar size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <p>No events listed yet. Create one using the form on the right.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Venue</th>
                        <th>Seating Capacity</th>
                        <th>Sold Seats</th>
                        <th>Revenue</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id}>
                          <td style={{ fontWeight: '600' }}>
                            <div style={{ color: 'white' }}>{e.title}</div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{e.date} at {e.time}</span>
                          </td>
                          <td>{e.venueName}</td>
                          <td>{e.totalSeats} seats</td>
                          <td>
                            {e.bookedSeats} ({Math.round((e.bookedSeats / e.totalSeats) * 100)}%)
                          </td>
                          <td style={{ fontWeight: '700', color: '#10b981' }}>${e.totalRevenue.toFixed(2)}</td>
                          <td>
                            {e.isSoldOut ? (
                              <span className="badge badge-danger">Sold Out</span>
                            ) : (
                              <span className="badge badge-success">Selling</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Create Event Form */}
          <div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <PlusSquare style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: '700' }}>Create Event</h2>
              </div>

              {venues.length === 0 ? (
                <div style={{ padding: '20px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: '#f59e0b', fontSize: '13px' }}>
                  No venues found. An administrator must create a venue (Admin Portal) before you can schedule event shows.
                </div>
              ) : (
                <form onSubmit={handleCreateEvent} className="auth-form" style={{ gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="title">Event Title</label>
                    <input
                      id="title"
                      type="text"
                      placeholder="e.g. Rock Fest 2026"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="desc">Description</label>
                    <textarea
                      id="desc"
                      placeholder="Add brief details about the event..."
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="date">Date</label>
                      <input
                        id="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="time">Time</label>
                      <input
                        id="time"
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="venue">Venue Location</label>
                    <select
                      id="venue"
                      value={venueId}
                      onChange={(e) => setVenueId(e.target.value)}
                    >
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.rows * v.cols} seats)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="premium-price">Premium Price ($)</label>
                      <input
                        id="premium-price"
                        type="number"
                        min="1"
                        value={premiumPrice}
                        onChange={(e) => setPremiumPrice(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="standard-price">Standard Price ($)</label>
                      <input
                        id="standard-price"
                        type="number"
                        min="1"
                        value={standardPrice}
                        onChange={(e) => setStandardPrice(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={formLoading}>
                    {formLoading ? 'Publishing event...' : 'Publish Event'}
                  </button>
                </form>
              )}
            </div>
          </div>

        </div>

      </main>
    </>
  );
}
