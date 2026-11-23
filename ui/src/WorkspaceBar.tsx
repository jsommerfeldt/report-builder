import React from 'react';
import {Icon} from './Icon';

interface Props {
  active?:'home'|'reports';
  onHome?():void;
  onReports?():void;
}

export function WorkspaceBar({active,onHome,onReports}:Props) {
  const brand=<><img src="/assets/mark.svg" width="29" height="29" alt=""/><strong>Report Builder</strong></>;
  return <header className="appbar workspace-bar">
    {onHome?<button className="brand" onClick={onHome}>{brand}</button>:<div className="brand">{brand}</div>}
    {onHome && <nav aria-label="Workspace">
      <button aria-current={active==='home'?'page':undefined} onClick={onHome}>Home</button>
      {onReports && <button aria-current={active==='reports'?'page':undefined} onClick={onReports}>Reports</button>}
    </nav>}
    <span className="local-mark"><Icon name="lock" size={14}/><span>On this device</span></span>
  </header>;
}
