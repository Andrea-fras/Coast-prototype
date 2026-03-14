import React, { useState } from 'react';
import { Home, Anchor, Fish, User, FileText, LogOut, MessageCircle, Timer } from 'lucide-react';
import './Navbar.css';
import coastLogo from '../assets/Coastlogo.svg';

const Navbar = ({ onNotebookClick, onPedroClick, onPomodoroClick, onLogoClick, userName, onLogout }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="logo" onClick={onLogoClick} style={{ cursor: 'pointer' }}>
          <img src={coastLogo} alt="Coast Logo" className="logo-img" />
        </div>
      </div>

      <div className="navbar-center">
        <a href="#" className="nav-link active">
          <Home size={31} />
          <span>Home</span>
        </a>
        <a href="#" className="nav-link" data-tour="notebook-nav" onClick={(e) => { e.preventDefault(); onNotebookClick?.(); }}>
          <FileText size={31} />
          <span>Notebook</span>
        </a>
        <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); onPomodoroClick?.(); }}>
          <Timer size={31} />
          <span>Timer</span>
        </a>
        <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); onPedroClick?.(); }}>
          <MessageCircle size={31} />
          <span>Pedro</span>
        </a>
      </div>

      <div className="navbar-right">
        <div className="stat-pill">
          <Anchor size={28} />
          <span>500</span>
        </div>
        <div className="stat-pill">
          <Fish size={28} />
          <span>29</span>
        </div>
        <div className="profile-area" onClick={() => setShowUserMenu(!showUserMenu)}>
          <div className="profile-icon">
            <User size={40} />
          </div>
          {showUserMenu && (
            <div className="user-menu">
              <div className="user-menu-name">{userName || 'Student'}</div>
              <button className="user-menu-logout" onClick={(e) => { e.stopPropagation(); onLogout?.(); }}>
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
