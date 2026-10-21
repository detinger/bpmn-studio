import { useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  Home,
  Info,
  Moon,
  PenTool,
  Scale,
  Sun,
  Trophy
} from 'lucide-react';
import { useTheme } from './theme';
import { BrandMark } from '../components/BrandMark';

const NAV = [
  { section: 'Start', items: [{ to: '/', label: 'Home', icon: Home, end: true }] },
  {
    section: 'Learn',
    items: [
      { to: '/learn', label: 'Learning path', icon: GraduationCap },
      { to: '/encyclopedia', label: 'BPMN encyclopedia', icon: BookOpen },
      { to: '/challenges', label: 'Challenges', icon: Trophy }
    ]
  },
  {
    section: 'Model',
    items: [
      { to: '/modeler', label: 'Modeler', icon: PenTool },
      { to: '/library', label: 'Library', icon: FolderOpen }
    ]
  },
  {
    section: 'Analyze',
    items: [
      { to: '/simulate', label: 'Performance lab', icon: FlaskConical },
      { to: '/compare', label: 'AS-IS vs TO-BE', icon: Scale }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const { resolved, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('bpmn-studio-nav') === 'collapsed';
    } catch {
      return false;
    }
  });
  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem('bpmn-studio-nav', v ? 'collapsed' : 'open');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="nav" aria-label="Main navigation">
        <Link to="/" className="nav-brand" aria-label="BPMN Studio home">
          <span className="nav-brand-mark">
            <BrandMark size={20} />
          </span>
          <span className="nav-brand-text">
            <strong>BPMN Studio</strong>
            <span>Model · Simulate · Optimize</span>
          </span>
        </Link>
        <div className="nav-section">
          {NAV.map((group) => (
            <div key={group.section} style={{ display: 'contents' }}>
              <div className="nav-section-title">{group.section}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  title={item.label}
                >
                  <item.icon size={18} aria-hidden />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>
        <div className="nav-footer">
          <button className="nav-link btn-ghost" style={{ border: 'none', background: 'none', font: 'inherit', cursor: 'pointer' }} onClick={toggle} title="Toggle light/dark mode">
            {resolved === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            <span>{resolved === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <NavLink to="/about" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} title="About & licenses">
            <Info size={18} aria-hidden />
            <span>About</span>
          </NavLink>
          <button
            className="nav-link"
            style={{ border: 'none', background: 'none', font: 'inherit', cursor: 'pointer' }}
            onClick={() => setCollapsedPersist(!collapsed)}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <ChevronsRight size={18} aria-hidden /> : <ChevronsLeft size={18} aria-hidden />}
            <span>Collapse</span>
          </button>
        </div>
      </nav>
      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
