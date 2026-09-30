import React from 'react';
import { BookOpen, Map as MapIcon, MessageCircle } from 'lucide-react';
import coastLogo from '../../assets/Coastlogo-white-full.svg';
import './AppTopBar.css';

const ITEMS = [
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'lessons', label: 'Lessons', Icon: BookOpen },
  { id: 'chat', label: 'Chat', Icon: MessageCircle },
];

/** The same logo + Map / Lessons / Chat bar on every main screen. */
export default function AppTopBar({ current, onNavigate, right = null, hideNav = false }) {
  return (
    <header className="app-topbar">
      <button type="button" className="app-topbar__logo" onClick={() => onNavigate?.('map')} aria-label="Coast · back to your map">
        <img src={coastLogo} alt="Coast" />
      </button>
      {!hideNav && (
        <nav className="app-nav" aria-label="Main" data-tour="nav">
          {ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="app-nav__item"
              aria-current={current === id ? 'page' : undefined}
              onClick={() => { if (current !== id) onNavigate?.(id); }}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="app-topbar__right">{right}</div>
    </header>
  );
}
