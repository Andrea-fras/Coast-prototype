import React from 'react';
import trophyIcon from '../../assets/lesson-icons/trophy.svg';

export default function CupBadge({ count = 0, className = '' }) {
  return (
    <div className={`nb-cup-badge ${className}`.trim()} title="Cups earned from mastered courses">
      <img src={trophyIcon} alt="" className="nb-cup-badge-icon" />
      <span className="nb-cup-badge-count">{count}</span>
    </div>
  );
}
