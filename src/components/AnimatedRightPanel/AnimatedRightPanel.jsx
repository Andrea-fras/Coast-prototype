import React from 'react';
import './AnimatedRightPanel.css';

// Import all assets
import panelBg from '../../assets/panel-bg.svg';
import panelWaves from '../../assets/panel-waves.svg';
import sun from '../../assets/sun.svg';
import cloud from '../../assets/anim-cloud.svg';
import bird from '../../assets/anim-bird.svg';
import boat from '../../assets/anim-boat.svg';
import fishCommon from '../../assets/fish-common.svg';
import fishRare from '../../assets/fish-rare.svg';

const AnimatedRightPanel = () => {
  return (
    <div className="animated-panel">
      {/* Stretchable gradient background */}
      <img src={panelBg} className="panel-background" alt="" />
      
      {/* Sun */}
      <img src={sun} className="panel-sun" alt="" />
      
      {/* Clouds - varying sizes and positions */}
      <img src={cloud} className="panel-cloud cloud-1" alt="" />
      <img src={cloud} className="panel-cloud cloud-2" alt="" />
      <img src={cloud} className="panel-cloud cloud-3" alt="" />
      
      {/* Birds flying across */}
      <img src={bird} className="panel-bird bird-1" alt="" />
      <img src={bird} className="panel-bird bird-2" alt="" />
      <img src={bird} className="panel-bird bird-3" alt="" />
      
      {/* Waves at bottom */}
      <img src={panelWaves} className="panel-waves" alt="" />
      
      {/* Underwater fish */}
      <div className="underwater">
        <img src={fishCommon} className="swimming-fish fish-1" alt="" />
        <img src={fishRare} className="swimming-fish fish-2" alt="" />
        <img src={fishCommon} className="swimming-fish fish-3" alt="" />
      </div>
      
      {/* Boat with mascot on water */}
      <img src={boat} className="panel-boat" alt="" />
    </div>
  );
};

export default AnimatedRightPanel;
