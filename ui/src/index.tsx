import React from 'react';
import ReactDOM from 'react-dom';
import {Catalog, pilotClient, pilotLibrary, request, RequestError} from './client';
import {ReportWorkspace} from './ReportWorkspace';
import {browserScheduleDrafts} from './scheduleDrafts';
import './theme.css';
import './workspace.css';

const root=document.getElementById('root');
async function start() {
  const token = new URLSearchParams(location.hash.slice(1)).get('unlock');
  if (location.hash) history.replaceState(null,'',location.pathname);
  try {
    if (token) await request('session','POST',{token});
    const catalog=await request<Catalog>('catalog');
    ReactDOM.render(<ReportWorkspace catalog={catalog} client={pilotClient} library={pilotLibrary} schedules={browserScheduleDrafts}/>,root);
  } catch(e) {
    const locked=e instanceof RequestError && (e.status===401 || e.status===403);
    ReactDOM.render(<main className="gate"><img src="/assets/mark.svg" alt="" width="48" height="48"/>
      <h1>{locked ? 'Open your private workspace' : 'Workspace unavailable'}</h1>
      <p>{locked ? 'Use the Windows pilot launcher to open an authorized browser tab.' : 'Check that the local pilot is running, then reload this page.'}</p></main>,root);
  }
}
void start();
