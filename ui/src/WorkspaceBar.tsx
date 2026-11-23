import React from 'react';
import {Icon} from './Icon';

interface Props {
  active?:'home'|'reports';
  onHome?():void;
  onReports?():void;
}

export function WorkspaceBar({active,onHome,onReports}:Props) {
  const logo=<img src="/assets/superset-logo-horiz.png" width="300" height="52" alt="Apache Superset"/>;
  return <header className="appbar workspace-bar">
    {onHome?<button type="button" className="brand" aria-label="Apache Superset logo, go to Home" onClick={onHome}>{logo}</button>:
      <div className="brand">{logo}</div>}
    {onHome && <nav aria-label="Workspace">
      <button aria-current={active==='home'?'page':undefined} onClick={onHome}>Home</button>
      {onReports && <button aria-current={active==='reports'?'page':undefined} onClick={onReports}>Reports</button>}
    </nav>}
    <span className="local-mark"><Icon name="lock" size={14}/><span>On this device</span></span>
  </header>;
}
