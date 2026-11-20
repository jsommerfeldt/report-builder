import React from 'react';
import {Icon} from './Icon';

export function WorkspaceBar({onHome}:{onHome?:()=>void}) {
  return <header className="appbar workspace-bar"><div className="brand"><img src="/assets/mark.svg" width="31" height="31" alt=""/><strong>Report Builder</strong></div>
    {onHome?<nav><button className="quiet-btn" onClick={onHome}><Icon name="back" size={16}/>My reports</button></nav>:
      <span className="local-mark"><Icon name="lock" size={14}/>On this device</span>}</header>;
}
