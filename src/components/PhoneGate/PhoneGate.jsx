import React, { useState } from 'react';
import coastLogo from '../../assets/Coastlogo-white-full.svg';
import mapPicture from '../../assets/phone-map.webp';
import './PhoneGate.css';

const OVERRIDE_KEY = 'coast_phone_ok';

/** A phone: a touch screen whose short side is under 600px (iPads and tablets pass). */
function isPhone() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const w = window.screen?.width || window.innerWidth;
  const h = window.screen?.height || window.innerHeight;
  return Boolean(coarse) && Math.min(w, h) < 600;
}

function readOverride() {
  try { return sessionStorage.getItem(OVERRIDE_KEY) === '1'; } catch { return false; }
}

/**
 * Coast works best with room to think: on a phone the app shows this page
 * instead (the landing page stays fully usable there). A quiet link lets
 * someone continue anyway for this visit.
 */
export default function PhoneGate({ children }) {
  const [gated, setGated] = useState(() => isPhone() && !readOverride());
  if (!gated) return children;

  const continueAnyway = () => {
    try { sessionStorage.setItem(OVERRIDE_KEY, '1'); } catch { /* storage may be blocked */ }
    setGated(false);
  };

  return (
    <main className="phone-gate">
      <img className="phone-gate__logo" src={coastLogo} alt="Coast" />
      <figure className="phone-gate__map" aria-hidden="true">
        <img src={mapPicture} alt="" width="288" height="192" />
      </figure>
      <p className="phone-gate__kicker">Coast works best with room to think</p>
      <h1>Your next study session deserves a bigger screen.</h1>
      <p className="phone-gate__lead">Open Coast on your laptop or iPad to learn with Pedro and explore your world.</p>
      <p className="phone-gate__address">app.coast.academy</p>
      <button type="button" className="phone-gate__anyway" onClick={continueAnyway}>
        Continue on this phone anyway
      </button>
    </main>
  );
}
