'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Header from '../../../components/Header';
import { api } from '../../../utils/api';
import { Ticket, Calendar, MapPin, Clock, Award, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function EventDetailPage() {
  const router = useRouter();
  const { id: eventId } = useParams();
  const searchParams = useSearchParams();
  const claimSeatId = searchParams.get('claimSeatId');

  const [event, setEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [categoriesStatus, setCategoriesStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Hold Timer state
  const [holdExpiresAt, setHoldExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);
  const pollingRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  const fetchEventData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.events.get(eventId);
      setEvent(data.event);
      setSeats(data.seats);
      setCategoriesStatus(data.categoriesStatus);
      
      // Look for active hold in seats list to recover/set countdown timer
      const myHolds = data.seats.filter(s => s.isMyHold);
      if (myHolds.length > 0) {
        // Use the furthest expiry time
        const maxExpiry = new Date(Math.max(...myHolds.map(h => new Date(h.holdExpiresAt))));
        setHoldExpiresAt(maxExpiry);
      } else {
        setHoldExpiresAt(null);
      }
      
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not fetch seat map.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Handle URL Claimed Seat (Waitlist Direct Offer link)
  const handleClaimedSeat = async () => {
    if (claimSeatId && seats.length > 0) {
      const seat = seats.find(s => s.seatId === claimSeatId);
      if (seat && seat.status === 'AVAILABLE') {
        try {
          await handleSeatClick(seat);
          showToast('Your waitlisted seat has been locked. Complete booking within the limit!', 'success');
        } catch (e) {
          console.error("Auto claim hold failed: ", e);
        }
      }
    }
  };

  // Setup Initial Loading and Real-Time Seat Map Polling (5-second intervals)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
      }
      router.push('/login');
      return;
    }
    
    fetchEventData().then(() => {
      handleClaimedSeat();
    });

    // Setup periodic polling to sync seat state with other users in real time
    pollingRef.current = setInterval(() => {
      fetchEventData(true);
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [eventId]);

  // Hold Countdown Timer Logic
  useEffect(() => {
    if (holdExpiresAt) {
      const updateTimer = () => {
        const diffMs = new Date(holdExpiresAt) - new Date();
        const secondsLeft = Math.max(0, Math.floor(diffMs / 1000));
        setTimeLeft(secondsLeft);

        if (secondsLeft <= 0) {
          clearInterval(timerRef.current);
          setHoldExpiresAt(null);
          showToast('Your seat hold has expired. Seats released.', 'warning');
          fetchEventData(true);
        }
      };

      updateTimer();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(updateTimer, 1000);
    } else {
      setTimeLeft(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [holdExpiresAt]);

  const myHeldSeats = seats.filter(s => s.isMyHold);

  // Lock or Release a seat
  const handleSeatClick = async (seat) => {
    try {
      setError('');
      if (seat.status === 'BOOKED') return;

      if (seat.isMyHold) {
        // Release hold
        await api.bookings.release(eventId, [seat.seatId]);
        showToast('Seat released.', 'info');
        await fetchEventData(true);
      } else {
        // Place Hold
        const result = await api.bookings.hold(eventId, [seat.seatId]);
        setHoldExpiresAt(new Date(result.holdExpiresAt));
        showToast('Seat locked for 10 minutes.', 'success');
        await fetchEventData(true);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to update seat status.');
      showToast(err.message || 'Seat selection failed.', 'danger');
    }
  };

  // Complete checkout purchase
  const handleConfirmBooking = async () => {
    if (myHeldSeats.length === 0) return;
    
    try {
      setBookingLoading(true);
      setError('');
      const seatIds = myHeldSeats.map(s => s.seatId);
      const result = await api.bookings.confirm(eventId, seatIds);
      
      setSuccessMsg(`Booking Confirmed! Ref: ${result.booking.bookingReference}. We've sent your QR Code ticket to your registered email.`);
      setHoldExpiresAt(null);
      showToast('Booking confirmed! Email sent.', 'success');
      
      // Reload event layout
      await fetchEventData(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Checkout payment failed.');
      showToast(err.message || 'Booking confirmation failed.', 'danger');
    } finally {
      setBookingLoading(false);
    }
  };

  // Join waitlist for a sold-out category
  const handleJoinWaitlist = async (category) => {
    try {
      setWaitlistLoading(true);
      setError('');
      await api.bookings.joinWaitlist(eventId, category);
      showToast(`Joined the ${category} waitlist queue.`, 'success');
      await fetchEventData(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to join waitlist.');
      showToast(err.message || 'Waitlist entry failed.', 'danger');
    } finally {
      setWaitlistLoading(false);
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

  if (!event) {
    return (
      <>
        <Header />
        <div className="container" style={{ padding: '60px 0', textAlign: 'center' }}>
          <h2>Event not found.</h2>
        </div>
      </>
    );
  }

  // Formatting pricing object mapping
  const pricesMap = {};
  event.prices.forEach(p => {
    pricesMap[p.category] = p.price;
  });

  const totalCheckoutPrice = myHeldSeats.reduce((sum, s) => sum + (pricesMap[s.category] || 0), 0);

  // Group seats by row for grid rendering
  const seatGrid = {};
  seats.forEach(s => {
    if (!seatGrid[s.row]) seatGrid[s.row] = [];
    seatGrid[s.row].push(s);
  });
  // Sort columns in each row
  Object.keys(seatGrid).forEach(row => {
    seatGrid[row].sort((a, b) => a.col - b.col);
  });

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Header />
      <main className="container" style={{ paddingBottom: '80px' }}>
        
        {/* Banner Breadcrumb */}
        <div style={{ marginTop: '24px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Events / <strong style={{ color: 'white' }}>{event.title}</strong>
          </span>
        </div>

        {successMsg && (
          <div className="glass-panel" style={{ padding: '24px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', color: '#10b981', display: 'flex', gap: '16px', alignItems: 'flex-start', marginTop: '24px' }}>
            <CheckCircle2 size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h3 style={{ margin: 0, color: 'white' }}>Success!</h3>
              <p style={{ marginTop: '4px', fontSize: '15px' }}>{successMsg}</p>
              <button onClick={() => router.push('/history')} className="btn btn-primary" style={{ marginTop: '16px', padding: '8px 16px', fontSize: '13px' }}>
                View in My Bookings
              </button>
            </div>
          </div>
        )}

        <div className="detail-layout">
          
          {/* Visual Seat Map section */}
          <div>
            <div className="glass-panel seatmap-container">
              <h2 style={{ fontSize: '20px', marginBottom: '8px', color: 'white' }}>Select Your Seats</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px' }}>
                Tap available seats to reserve them. Locked seats are secure for 10 minutes.
              </p>

              <div className="screen-indicator"></div>

              {/* Grid layout */}
              <div 
                className="seat-grid"
                style={{ 
                  gridTemplateColumns: `repeat(${event.venue.cols}, 36px)`,
                  width: 'fit-content'
                }}
              >
                {Object.keys(seatGrid).map((rowNum) => (
                  <div key={rowNum} style={{ display: 'contents' }}>
                    {seatGrid[rowNum].map((seat) => {
                      const isMyHold = seat.isMyHold;
                      let seatClass = `seat-item ${seat.category.toLowerCase()}`;
                      
                      if (seat.status === 'BOOKED') seatClass += ' booked';
                      else if (seat.status === 'HELD') seatClass += ' held';
                      else if (seat.status === 'WAITLIST_HELD') seatClass += ' waitlist_held';
                      
                      if (isMyHold) seatClass += ' my-hold';

                      return (
                        <button
                          key={seat.id}
                          className={seatClass}
                          onClick={() => handleSeatClick(seat)}
                          disabled={seat.status === 'BOOKED' || (seat.status !== 'AVAILABLE' && !isMyHold)}
                          title={`Row ${seat.row}, Col ${seat.col} (${seat.category}) - ${seat.status}`}
                        >
                          {String.fromCharCode(64 + parseInt(seat.row))}{seat.col}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Map Legend */}
              <div className="seat-legend">
                <div className="legend-item">
                  <div className="legend-color" style={{ border: '1.5px solid var(--standard)', background: 'rgba(59, 130, 246, 0.05)' }}></div>
                  <span>Standard (${pricesMap['STANDARD']})</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ border: '1.5px solid var(--premium)', background: 'rgba(245, 158, 11, 0.05)' }}></div>
                  <span>Premium (${pricesMap['PREMIUM']})</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ background: 'var(--my-hold)' }}></div>
                  <span>My Lock</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ background: 'var(--booked)' }}></div>
                  <span>Booked</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ border: '1.5px solid var(--held)', background: 'rgba(244, 63, 94, 0.2)' }}></div>
                  <span>Held / Pending</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar details panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Event Details Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '16px' }}>{event.title}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px', lineHeight: '1.6' }}>{event.description}</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '20px', fontSize: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calendar size={18} style={{ color: 'var(--primary)' }} />
                  <span>{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Clock size={18} style={{ color: 'var(--primary)' }} />
                  <span>{event.time}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MapPin size={18} style={{ color: 'var(--primary)' }} />
                  <span>{event.venue.name}</span>
                </div>
              </div>
            </div>

            {/* Hold Cart and Expiry Countdown */}
            <div className="glass-panel checkout-panel">
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Booking Cart</h3>
              
              {myHeldSeats.length > 0 ? (
                <>
                  <div className={`timer-box ${timeLeft < 60 ? 'pulse' : ''}`}>
                    <Clock size={16} />
                    <span>Seat Lock TTL: {formatTime(timeLeft)}</span>
                  </div>

                  <div className="selected-seats-list">
                    {myHeldSeats.map((seat) => (
                      <div key={seat.id} className="selected-seat-row">
                        <span>Row {seat.row}, Seat {seat.col} ({seat.category})</span>
                        <span style={{ fontWeight: '600' }}>${pricesMap[seat.category]}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Total Price</span>
                    <span style={{ fontSize: '20px', fontWeight: '800', color: 'white' }}>${totalCheckoutPrice}</span>
                  </div>

                  <button 
                    onClick={handleConfirmBooking} 
                    className="btn btn-primary" 
                    style={{ width: '100%' }}
                    disabled={bookingLoading}
                  >
                    {bookingLoading ? 'Processing Ticket...' : 'Confirm and Pay'}
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <p>No seats selected yet. Click on the visual map to select seats.</p>
                </div>
              )}
            </div>

            {/* Waitlist Category Card if Sold Out */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>Sold-out Waitlist</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: '1.5' }}>
                If your desired seat category is sold out, join the waitlist queue. When someone cancels, seats are offered in FIFO order.
              </p>

              {Object.keys(categoriesStatus).map((cat) => {
                const status = categoriesStatus[cat];
                return (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <div>
                      <span style={{ fontWeight: '600', fontSize: '14px', color: 'white' }}>{cat} Seats</span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {status.available} available / {status.total} total
                      </span>
                    </div>

                    {status.isSoldOut ? (
                      <button
                        onClick={() => handleJoinWaitlist(cat)}
                        className="btn btn-accent"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        disabled={waitlistLoading}
                      >
                        Join Waitlist
                      </button>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '10px' }}>Available</span>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* Global Toast Banner */}
        {toast.show && (
          <div className="notification-toast" style={{ borderLeftColor: toast.type === 'success' ? '#10b981' : toast.type === 'danger' ? '#ef4444' : toast.type === 'warning' ? '#f59e0b' : '#6366f1' }}>
            <span>{toast.message}</span>
          </div>
        )}
      </main>
    </>
  );
}
