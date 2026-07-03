'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import { api } from '../../utils/api';
import { Shield, PlusSquare, Grid, Settings } from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Venue form states
  const [name, setName] = useState('');
  const [rows, setRows] = useState('5');
  const [cols, setCols] = useState('6');
  const [premiumRowsInput, setPremiumRowsInput] = useState('1, 2');
  const [formLoading, setFormLoading] = useState(false);

  const fetchVenues = async () => {
    try {
      setLoading(true);
      const data = await api.venues.list();
      setVenues(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not load venues dashboard. Make sure you are logged in as an ADMIN.');
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
    if (user.role !== 'ADMIN') {
      router.push('/');
      return;
    }

    fetchVenues();
  }, []);

  const handleCreateVenue = async (e) => {
    e.preventDefault();
    if (!name || !rows || !cols) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setFormLoading(true);
      setError('');
      setSuccess('');

      // Parse comma-separated list of premium rows
      const premiumRows = premiumRowsInput
        .split(',')
        .map(r => parseInt(r.trim()))
        .filter(r => !isNaN(r) && r > 0);

      await api.venues.create({
        name,
        rows: parseInt(rows),
        cols: parseInt(cols),
        premiumRows
      });

      setSuccess('Venue and seats layout created successfully!');
      
      // Reset form
      setName('');
      setRows('5');
      setCols('6');
      setPremiumRowsInput('1, 2');

      // Refresh list
      await fetchVenues();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create venue.');
    } finally {
      setFormLoading(false);
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
            <h1 className="hero-title" style={{ fontSize: '32px', textAlign: 'left', margin: 0 }}>Administrator Control Panel</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              Design venue structures, configure seat categories, and manage the system.
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

        <div className="detail-layout">
          
          {/* List of configured venues */}
          <div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>System Venues</h2>

              {venues.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Grid size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <p>No venues registered in system yet. Use the designer form to register a new venue layout.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Venue Name</th>
                        <th>Seating Capacity</th>
                        <th>Layout Dimensions</th>
                        <th>Created Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {venues.map((v) => (
                        <tr key={v.id}>
                          <td style={{ fontWeight: '600', color: 'white' }}>{v.name}</td>
                          <td>
                            <strong>{v._count.seats}</strong> seats total
                          </td>
                          <td>
                            <code>{v.rows} rows x {v.cols} columns</code>
                          </td>
                          <td>{new Date(v.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Designer Form */}
          <div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <PlusSquare style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: '700' }}>Venue Designer</h2>
              </div>

              <form onSubmit={handleCreateVenue} className="auth-form" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="name">Venue Name</label>
                  <input
                    id="name"
                    type="text"
                    placeholder="e.g. Royal Hall, IMAX Theatre 1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="rows">Total Rows</label>
                    <input
                      id="rows"
                      type="number"
                      min="1"
                      max="30"
                      value={rows}
                      onChange={(e) => setRows(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cols">Seats Per Row</label>
                    <input
                      id="cols"
                      type="number"
                      min="1"
                      max="30"
                      value={cols}
                      onChange={(e) => setCols(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="premium">Premium Rows (Comma separated)</label>
                  <input
                    id="premium"
                    type="text"
                    placeholder="e.g. 1, 2"
                    value={premiumRowsInput}
                    onChange={(e) => setPremiumRowsInput(e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                    Specified row index numbers will generate as <strong>PREMIUM</strong> (gold) pricing seats.
                  </span>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={formLoading}>
                  {formLoading ? 'Creating Layout...' : 'Register Layout'}
                </button>
              </form>
            </div>
          </div>

        </div>

      </main>
    </>
  );
}
