import React,{useEffect,useRef,useState} from 'react';
import {Catalog,LibraryClient,Preview,ReportClient,SavedInfo,SavedReport} from './client';
import {ReportBuilder} from './ReportBuilder';
import {resultCell,resultLabel} from './PreviewPane';
import {Icon} from './Icon';
import {ReportLibrary} from './ReportLibrary';
import {WorkspaceBar} from './WorkspaceBar';
import {ScheduleDraftStore} from './scheduleDrafts';

type View={page:'reports'}|{page:'edit';report?:SavedReport}|{page:'run';report:SavedInfo};
interface Props {catalog:Catalog;client:ReportClient;library:LibraryClient;schedules:ScheduleDraftStore}
export function ReportWorkspace({catalog,client,library,schedules}:Props) {
  const [view,setView]=useState<View>({page:'reports'});
  const [location,setLocation]=useState('all');
  const onReports=()=>setView({page:'reports'});
  useEffect(()=>{window.scrollTo(0,0);},[view]);
  if(view.page==='edit')return <ReportBuilder catalog={catalog} client={client} initialReport={view.report}
    folderId={['all','trash','folders'].includes(location)?null:location} onReports={onReports}/>;
  if(view.page==='run')return <ReportResults report={view.report} catalog={catalog} library={library} onReports={onReports}/>;
  return <ReportLibrary location={location} navigate={setLocation} library={library} schedules={schedules} client={client}
    onNew={()=>setView({page:'edit'})} onEdit={report=>setView({page:'edit',report})} onRun={report=>setView({page:'run',report})}/>;
}

function ReportResults({report,catalog,library,onReports}:{report:SavedInfo;catalog:Catalog;library:LibraryClient;onReports():void}) {
  const [offset,setOffset]=useState(0);
  const [retry,setRetry]=useState(0);
  const [page,setPage]=useState<{offset:number;result:Preview}|null>(null);
  const data=page?.offset===offset?page.result:null;
  const [error,setError]=useState('');
  const title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{title.current?.focus();},[]);
  useEffect(()=>{
    let active=true;
    setPage(null);setError('');
    library.results(report,offset).then(result=>{if(active)setPage({offset,result});},
      e=>{if(active)setError(e instanceof Error?e.message:'The report could not be run.');});
    return ()=>{active=false;};
  },[report,library,offset,retry]);
  const fields=data?.fields.map(id=>catalog.fields.find(field=>field.id===id)!)??[];
  return <div><WorkspaceBar onReports={onReports}/><main className="run-main">
    <div className="doc-status"><Icon name="grid" size={15}/>Report results</div>
    <h1 ref={title} tabIndex={-1}>{report.name}</h1>
    {error?<div role="alert" className="alert">{error} <button className="text-action" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>:
      !data?<p role="status" className="muted">Running saved report…</p>:<section className="panel results-panel" aria-label="Report results">
        <div className="results-bar"><strong>{data.total.toLocaleString()} {data.total===1?'result':'results'}</strong>
          {data.total>0 && <div className="pages"><span role="status">{(offset+1).toLocaleString()}–{(offset+data.rows.length).toLocaleString()} of {data.total.toLocaleString()}</span>
            <button className="icon-button" aria-label="Previous page" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-data.limit))}><Icon name="back" size={16}/></button>
            <button className="icon-button" aria-label="Next page" disabled={offset+data.rows.length>=data.total} onClick={()=>setOffset(offset+data.limit)}><Icon name="arrow" size={16}/></button></div>}</div>
        <div className="table-scroll" tabIndex={0} aria-label="Results table"><table><thead><tr>{fields.map(f=><th scope="col" key={f.id} className={f.measure?'numeric':''}>{resultLabel(f,data.aggregations?.[f.id])}</th>)}</tr></thead>
          <tbody>{data.rows.map((values,i)=><tr key={offset+i}>{values.map((v,j)=><td key={fields[j].id} className={fields[j].measure?'numeric':''}>{resultCell(v,fields[j],data.aggregations?.[fields[j].id])}</td>)}</tr>)}
            {!data.rows.length && <tr><td colSpan={fields.length}>No rows match the saved filters.</td></tr>}</tbody></table></div>
      </section>}
  </main></div>;
}
