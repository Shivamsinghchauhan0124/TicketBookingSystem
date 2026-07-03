'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Ticket, LogOut, User, Calendar, History, PlusSquare, Shield } from 'lucide-react';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState(null);

  const loadUser = () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          setCurrentUser(JSON.parse(userStr));
        } catch (e) {
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
    }
  };

  useEffect(() => {
    loadUser();
    
    // Listen for storage or custom auth changes
    window.addEventListener('auth-change', loadUser);
    window.addEventListener('storage', loadUser);
    
    return () => {
      window.removeEventListener('auth-change', loadUser);
      window.removeEventListener('storage', loadUser);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentUser(null);
    window.dispatchEvent(new Event('auth-change'));
    router.push('/login');
  };

  return (
    <header className="header">
      <div className="container header-nav">
        <Link href="/" className="logo">
          <Ticket size={28} style={{ color: '#818cf8' }} />
          <span>EpicTickets</span>
        </Link>

        <nav className="nav-links">
          {currentUser ? (
            <>
              <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
                Browse Events
              </Link>
              
              {currentUser.role === 'CUSTOMER' && (
                <Link href="/history" className={`nav-link ${pathname === '/history' ? 'active' : ''}`}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <History size={16} /> My Bookings
                  </span>
                </Link>
              )}

              {currentUser.role === 'ORGANISER' && (
                <Link href="/organizer" className={`nav-link ${pathname === '/organizer' ? 'active' : ''}`}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={16} /> Organiser Portal
                  </span>
                </Link>
              )}

              {currentUser.role === 'ADMIN' && (
                <Link href="/admin" className={`nav-link ${pathname === '/admin' ? 'active' : ''}`}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Shield size={16} /> Admin Portal
                  </span>
                </Link>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '8px', borderLeft: '1px solid var(--border-light)', paddingLeft: '16px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <User size={16} /> {currentUser.name}
                  <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                    {currentUser.role}
                  </span>
                </span>
                
                <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <LogOut size={14} /> Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
                Sign In
              </Link>
              <Link href="/register" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '14px' }}>
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
