import React from 'react';
import { Instagram, Facebook, Music } from 'lucide-react'; // Music as placeholder for TikTok if unavailable, or we'll see
import './Footer.css';
import coastLogo from '../assets/Coastlogo.svg';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-left">
        <img src={coastLogo} alt="Coast Logo" className="footer-logo" />
      </div>
      
      <div className="footer-center">
        <a href="#" className="footer-link">Our Story</a>
        <a href="#" className="footer-link">FAQ</a>
        <a href="#" className="footer-link">Privacy Policy</a>
        <a href="#" className="footer-link">Terms of service</a>
      </div>
      
      <div className="footer-right">
        <a href="#" className="social-icon"><Instagram size={24} /></a>
        <a href="#" className="social-icon"><Facebook size={24} /></a>
        <a href="#" className="social-icon"><Music size={24} /></a> {/* Placeholder for TikTok */}
      </div>
    </footer>
  );
};

export default Footer;
