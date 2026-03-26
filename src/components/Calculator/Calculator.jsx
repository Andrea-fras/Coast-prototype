import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, GripHorizontal } from 'lucide-react';
import './Calculator.css';

const STORAGE_KEY = 'coast_calc_pos';
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 520;

function getInitialPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.x != null && saved?.y != null) return saved;
  } catch {}
  return {
    x: window.innerWidth - DEFAULT_WIDTH - 24,
    y: window.innerHeight - DEFAULT_HEIGHT - 24,
  };
}

const Calculator = ({ onClose }) => {
  const [pos, setPos] = useState(getInitialPos);
  const dragRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch {}
  }, [pos]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...pos };

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const newX = Math.max(0, Math.min(window.innerWidth - 120, startPos.x + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 40, startPos.y + dy));
      setPos({ x: newX, y: newY });
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos]);

  return createPortal(
    <div
      ref={containerRef}
      className="calc-floating"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="calc-titlebar"
        onPointerDown={handlePointerDown}
      >
        <GripHorizontal size={14} className="calc-grip" />
        <span className="calc-title">Scientific Calculator</span>
        <button className="calc-close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <iframe
        className="calc-iframe"
        src="https://www.desmos.com/scientific"
        title="Desmos Scientific Calculator"
        allow="clipboard-write"
      />
    </div>,
    document.body
  );
};

export default Calculator;
