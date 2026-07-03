'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import { api } from '../../utils/api';
import { Ticket, Calendar, Clock, DollarSign, Ban, RefreshCw, AlertTriangle } from 'lucide-react';

export default function HistoryPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await api.bookings.history();
      setBookings(data.bookings);
      setWaitlists(data.waitlists);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not load history details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchHistory();
  }, []);

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking? This action is irreversible and seats will immediately be offered to the waitlist.')) {
      return;
    }

    try {
      setCancelLoading(true);
      setError('');
      setSuccess('');
      const result = await api.bookings.cancel(bookingId);
      setSuccess(`Booking cancelled successfully. ${result.reallocatedSeatsCount} seats reallocated to waitlist users.`);
      await fetchHistory();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Cancellation failed.');
    } finally {
      setCancelLoading(false);
    }
  };

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
            <h1 className="hero-title" style={{ fontSize: '32px', textAlign: 'left', margin: 0 }}>My Bookings Dashboard</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              Manage your concert & movie bookings, cancel orders, and check active waitlists.
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

        {/* Bookings Section */}
        <section style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '22px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '20px' }}>Booking Orders</h2>
          
          {bookings.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Ticket size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <p>You have no tickets booked yet.</p>
            </div>
          ) : (
            <div className="dashboard-grid">
              {bookings.map((booking) => (
                <div key={booking.id} className="glass-panel" style={{ padding: '24px', position: 'relative' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <span className={`badge ${booking.status === 'CONFIRMED' ? 'badge-success' : 'badge-danger'}`} style={{ marginBottom: '8px' }}>
                        {booking.status}
                      </span>
                      <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>{booking.event.title}</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                        Reference: <code style={{ color: 'white', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{booking.bookingReference}</code>
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Paid</span>
                      <h4 style={{ fontSize: '24px', fontWeight: '800', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <DollarSign size={18} /> {booking.totalPrice}
                      </h4>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', margin: '20px 0', padding: '16px 0', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={16} />
                      <span>{new Date(booking.event.date).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={16} />
                      <span>{booking.event.time}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Venue: <strong>{booking.event.venue.name}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Seats: </span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
                        {booking.showSeats.map(ss => `${String.fromCharCode(64 + ss.seat.row)}${ss.seat.col}`).join(', ')}
                      </span>
                    </div>

                    {booking.status === 'CONFIRMED' && (
                      <button
                        onClick={() => handleCancelBooking(booking.id)}
                        className="btn btn-danger"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                        disabled={cancelLoading}
                      >
                        <Ban size={14} /> Cancel Booking
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </section>

        {/* Waitlists Section */}
        <section>
          <h2 style={{ fontSize: '22px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '20px' }}>Active Waitlists</h2>
          
          {waitlists.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <p>You are not on any waitlists.</p>
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '16px' }}>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Category</th>
                      <th>Joined Date</th>
                      <th>Status</th>
                      <th>Action / Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlists.map((wl) => (
                      <tr key={wl.id}>
                        <td style={{ fontWeight: '600' }}>{wl.event.title}</td>
                        <td>{wl.category}</td>
                        <td>{new Date(wl.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge ${
                            wl.status === 'WAITING' ? 'badge-info' : 
                            wl.status === 'OFFERED' ? 'badge-warning' : 
                            wl.status === 'COMPLETED' ? 'badge-success' : 'badge-danger'
                          }`}>
                            {wl.status}
                          </span>
                        </td>
                        <td>
                          {wl.status === 'OFFERED' ? (
                            <button
                              onClick={() => router.push(`/event/${wl.eventId}?claimSeatId=${wl.offeredSeatId}`)}
                              className="btn btn-accent"
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                            >
                              Claim Offered Seat
                            </button>
                          ) : wl.status === 'WAITING' ? (
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Waiting for cancellation</span>
                          ) : wl.status === 'COMPLETED' ? (
                            <span style={{ fontSize: '13px', color: '#10b981' }}>Seat Booked</span>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#f87171' }}>Offer Expired</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

      </main>
    </>
  );
}
