import React from 'react';
import {Icon} from './Icon';

export function WorkspaceBar({onReports}:{onReports?():void}) {
  const logo=<img src="/assets/superset-logo-horiz.png" width="300" height="52" alt="Apache Superset"/>;
  return <header className="appbar workspace-bar">
    {onReports?<button type="button" className="brand" aria-label="Apache Superset logo, go to Datasets" onClick={onReports}>{logo}</button>:
      <div className="brand">{logo}</div>}
    {onReports && <nav aria-label="Workspace">
      <button type="button" aria-current="page" onClick={onReports}>Datasets</button>
    </nav>}
    <span className="local-mark"><Icon name="lock" size={14}/><span>On this device</span></span>
  </header>;
}
