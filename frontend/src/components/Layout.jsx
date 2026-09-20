import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner">
          <NavLink to="/" className="logo">
            <span className="logo-icon">◧</span>
            INE Price Tracker
          </NavLink>
          <nav className="nav-links">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Dashboard
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        INE Price Tracker · Tracks products from the{' '}
        <a href="https://demo.inelabteamdev.com" target="_blank" rel="noopener noreferrer">
          INE Mock Store
        </a>{' '}
        · Built for INE Software Engineer Intern Assignment
      </footer>
    </div>
  );
}
