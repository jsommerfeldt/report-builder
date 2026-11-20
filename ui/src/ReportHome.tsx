import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Folder,Library,LibraryClient,ReportClient,SavedInfo,SavedReport} from './client';
import {folderPaths,LibraryDialog,ManagedItem} from './LibraryDialog';
import {ScheduleDraftStore} from './scheduleDrafts';
import {ScheduleEditor} from './ScheduleEditor';
import {Icon} from './Icon';
import {WorkspaceBar} from './WorkspaceBar';
import {Modal} from './Modal';

interface Props {
  library:LibraryClient;client:ReportClient;schedules:ScheduleDraftStore;location:string;navigate(id:string):void;
  onNew():void;onEdit(report:SavedReport):void;onRun(report:SavedInfo):void;
}
const updated=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'});
const reason=(e:unknown)=>e instanceof Error?e.message:'The library could not be opened.';
export function ReportHome({library,client,schedules,location,navigate,onNew,onEdit,onRun}:Props) {
  const [data,setData]=useState<Library|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [manage,setManage]=useState<ManagedItem|null>(null);
  const [schedule,setSchedule]=useState<SavedInfo|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<SavedInfo|null>(null);
  const [deleteError,setDeleteError]=useState('');
  const [working,setWorking]=useState(false);
  const requestId=useRef(0);
  const refresh=useCallback(async()=>{
    const id=++requestId.current;
    try {const result=await library.load();if(id===requestId.current){setData(result);setError('');}}
    catch(e){if(id===requestId.current)setError(reason(e));}
  },[library]);
  useEffect(()=>{
    void refresh();window.addEventListener('focus',refresh);
    return ()=>{requestId.current++;window.removeEventListener('focus',refresh);};
  },[refresh]);
  const paths=useMemo(()=>folderPaths(data?.folders??[]),[data]);
  const current=paths.find(p=>p.folder.id===location);
  const directory=location==='folders';
  type Moving={kind:'folder';item:Folder}|{kind:'report';item:SavedInfo};
  const dragging=useRef<Moving|null>(null);
  const [over,setOver]=useState<string|null>(null);
  function endDrag(){dragging.current=null;setOver(null);}
  function source(moving:Moving){
    return {draggable:!working,onDragStart:(event:React.DragEvent)=>{
      dragging.current=moving;
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('application/x-report-library',moving.item.id);
    },onDragEnd:endDrag};
  }
  function allowed(m:Moving,id:string|null){
    if(working)return false;
    if(m.kind==='report')return (m.item.folderId??null)!==id;
    return m.item.parentId!==id && m.item.id!==id &&
      !paths.find(p=>p.folder.id===id)?.parents.some(p=>p.id===m.item.id);
  }
  function target(id:string|null){
    const key=id??'root';
    return {'data-drop-active':over===key || undefined,onDragOver:(e:React.DragEvent)=>{
      const m=dragging.current;
      if(!m || !allowed(m,id))return;
      e.preventDefault();e.dataTransfer.dropEffect='move';setOver(key);
    },onDragLeave:(e:React.DragEvent)=>{
      if(!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget))setOver(v=>v===key?null:v);
    },onDrop:async(e:React.DragEvent)=>{
      const m=dragging.current;endDrag();
      if(!m || !allowed(m,id))return;
      e.preventDefault();setWorking(true);setError('');
      try{
        if(m.kind==='folder')await library.updateFolder(m.item,m.item.name,id);
        else await library.move(m.item,id);
        await refresh();
        setNotice(m.item.name+' moved to '+(paths.find(p=>p.folder.id===id)?.label??'the library root')+'.');
      }catch(err){await refresh();setError(reason(err));}
      finally{setWorking(false);}
    }};
  }
  const trash=location==='trash';
  useEffect(()=>{
    if(data && location!=='all' && !directory && !trash && !current)navigate('all');
  },[data,location,trash,directory,current,navigate]);
  const choose=(id:string)=>{navigate(id);setSearch('');setNotice('');};
  const reports=data?.reports??[];
  const scoped=reports.filter(r=>trash?!!r.deletedAt:!r.deletedAt && (!current || r.folderId===current.folder.id));
  const shown=scoped.filter(r=>r.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const newFolder=()=>setManage({kind:'new',parentId:current?.folder.id??null});
  function changed(message:string){
    setNotice(message);setManage(null);setSchedule(null);void refresh();
  }
  async function edit(report:SavedInfo){
    setWorking(true);setError('');
    try {const record=await client.open(report.id);setWorking(false);onEdit(record);}
    catch(e){setWorking(false);setError(reason(e));}
  }
  async function restore(report:SavedInfo){
    setWorking(true);
    try{const restored=await library.restore(report);changed('Restored '+restored.name+'.');}
    catch(e){setError(reason(e));}
    finally{setWorking(false);}
  }
  async function deletePermanently(){
    if(!deleteTarget || working)return;
    const report=deleteTarget;
    setWorking(true);
    setDeleteError('');
    try{
      await library.deleteTrashedReport(report);
      let message=report.name+' was permanently deleted.';
      try{await schedules.remove(report.id);}
      catch{message+=' This browser could not remove its schedule draft.';}
      setData(current=>current && {...current,reports:current.reports.filter(r=>r.id!==report.id)});
      setDeleteTarget(null);
      changed(message);
    }catch(e){
      setDeleteError(reason(e));
      void refresh();
    }finally{setWorking(false);}
  }
  return <div className="home-shell"><WorkspaceBar/><div className="home-layout">
    <aside className="home-sidebar"><nav aria-label="Report library">
      <h2>Library</h2>
      <button {...target(null)} title="Drop here to move to the library root" className="location-link" aria-current={location==='all'?'page':undefined} onClick={()=>choose('all')}><Icon name="layers"/>All reports</button>
      <button className="location-link" aria-current={trash?'page':undefined} onClick={()=>choose('trash')}><Icon name="trash"/>Trash</button>
      <div className="folder-nav-head"><h2><button className="folders-index-link" aria-current={directory?'page':undefined} onClick={()=>choose('folders')}>Folders</button></h2><button className="icon-button" title="New folder" aria-label="New folder" onClick={newFolder} disabled={!data}><Icon name="plus" size={16}/></button></div>
      {paths.map(p=><div className="folder-nav-row" key={p.folder.id}><button {...source({kind:'folder',item:p.folder})} {...target(p.folder.id)} className="location-link folder-link" title={p.label} aria-current={p.folder.id===location?'page':undefined}
        style={{paddingLeft:12+Math.min(p.parents.length,5)*14}} onClick={()=>choose(p.folder.id)}><Icon name="folder" size={17}/><span>{p.folder.name}</span></button>
        <button className="icon-button folder-delete" title={'Delete '+p.label} aria-label={'Delete folder '+p.label}
          onClick={()=>setManage({kind:'folder',folder:p.folder,deleteNow:true})}><Icon name="trash" size={15}/></button></div>)}
      {data && !paths.length && <button className="add-first-folder" onClick={newFolder}>Create a folder</button>}
    </nav></aside>
    <main className="home-main">
      <div className="mobile-location"><label>Browse library<select value={location} onChange={e=>choose(e.target.value)}>
        <option value="all">All reports</option><option value="folders">Folders</option><option value="trash">Trash</option>{paths.map(p=><option key={p.folder.id} value={p.folder.id}>{p.label}</option>)}</select></label>
        <button className="secondary-btn" onClick={newFolder} disabled={!data}><Icon name="folder" size={15}/>New folder</button></div>
      {current && <nav className="crumbs" aria-label="Folder path"><button onClick={()=>choose('all')}>My reports</button>
        {current.parents.map(f=><React.Fragment key={f.id}><Icon name="arrow" size={12}/><button onClick={()=>choose(f.id)}>{f.name}</button></React.Fragment>)}
        <Icon name="arrow" size={12}/><span>{current.folder.name}</span></nav>}
      <div className="home-heading"><div><h1>{directory?'Folders':trash?'Trash':current?.folder.name??'My reports'}</h1>
        {directory && data && <p>{paths.length} {paths.length===1?'folder':'folders'} in your library</p>}{data && !directory && <p>{scoped.length.toLocaleString()} {scoped.length===1?'report':'reports'}{trash?' in Trash':current?' in this folder':' in your library'}</p>}</div>
        <div className="home-tools">{current && <button className="secondary-btn" onClick={()=>setManage({kind:'folder',folder:current.folder})}>Manage folder</button>}
          {current && <button className="secondary-btn" onClick={()=>setManage({kind:'folder',folder:current.folder,deleteNow:true})}><Icon name="trash" size={15}/>Delete folder</button>}
          {directory && <button className="secondary-btn" onClick={newFolder} disabled={!data}>New folder</button>}
          {!trash && <button className="primary-btn" disabled={!data} onClick={onNew}><Icon name="plus" size={16}/>New report</button>}</div></div>
      {error && <div className="alert" role="alert">{error} <button className="text-action" onClick={refresh}>Refresh library</button></div>}
      <p role="status" className={'library-notice'+(notice?' visible':'')}>{notice}</p>
      {!data && !error && <p className="muted" role="status">Loading reports…</p>}
      {data && directory && <section className="report-list-panel" aria-label="Folder directory">
        <div className="list-tools"><h2>All folders</h2><span className="folder-count-label">Direct contents</span></div>
        {paths.length===0?<div className="home-empty"><Icon name="folder"/><h3>No folders yet</h3><button className="text-action" onClick={newFolder}>Create a folder</button></div>:
          <ul className="folder-directory">{paths.map(p=>{
            const count=reports.filter(r=>!r.deletedAt && r.folderId===p.folder.id).length;
            const children=paths.filter(other=>other.folder.parentId===p.folder.id).length;
            return <li key={p.folder.id}><button {...source({kind:'folder',item:p.folder})} {...target(p.folder.id)}
              onClick={()=>choose(p.folder.id)}><Icon name="folder"/><span><strong>{p.folder.name}</strong>
              <small>{p.parents.map(f=>f.name).join(' / ')||'Library root'}</small></span>
              <small>{count} {count===1?'report':'reports'} · {children} {children===1?'subfolder':'subfolders'}</small></button></li>;
          })}</ul>}</section>}
      {data && !directory && <section className="report-list-panel" aria-label={trash?'Deleted reports':'Saved reports'}>
        <div className="list-tools"><h2>{trash?'Deleted reports':'Saved reports'}</h2>
          <label className="search home-search"><Icon name="search" size={16}/><input type="search" aria-label="Search reports" placeholder="Search reports" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
        {shown.length>0?<ul className="report-list">{shown.map(report=>{
          const path=paths.find(f=>f.folder.id===report.folderId)?.label;
          return <li key={report.id} aria-label={report.name} {...(trash?{}:source({kind:'report',item:report}))}><div className="report-file"><Icon name="document" size={22}/></div>
            <div className="report-description"><h3>{report.name}</h3><div className="report-details"><span>{path??'Library root'}</span><i aria-hidden="true"/>
              <time dateTime={report.deletedAt??report.updated}>{trash?'Deleted':'Updated'} {updated.format(new Date(report.deletedAt??report.updated))}</time></div></div>
            <div className="report-actions">{trash?<>
              <button className="secondary-btn" disabled={working} onClick={()=>void restore(report)}>Restore</button>
              <button className="trash-delete" disabled={working} onClick={()=>{setDeleteError('');setDeleteTarget(report);}}>Delete permanently</button>
            </>:<>
              <button className="row-run" disabled={working} onClick={()=>onRun(report)}><Icon name="play" size={13}/>Run</button>
              <button disabled={working} onClick={()=>void edit(report)}><Icon name="edit" size={14}/>Edit</button>
              <button disabled={working} onClick={()=>setSchedule(report)}><Icon name="clock" size={15}/>Schedule</button>
              <button className="more-btn" title="Manage report" aria-label={'Manage '+report.name} disabled={working} onClick={()=>setManage({kind:'report',report})}><Icon name="more"/></button></>}</div>
          </li>;
        })}</ul>:<div className="home-empty"><span className="empty-icon"><Icon name={search?'search':trash?'trash':'document'} size={26}/></span>
          <h3>{search?'No matching reports':trash?'Trash is empty':current?'This folder is empty':'No saved reports yet'}</h3>
          <p>{search?'Try another report name.':trash?'Reports you delete appear here.':current?'Create a report here or move one into this folder.':'Create a report and save it to your library.'}</p>
          {search && <button className="text-action" onClick={()=>setSearch('')}>Clear search</button>}</div>}
      </section>}
    </main>
  </div>{manage && <LibraryDialog item={manage} paths={paths} library={library} close={()=>setManage(null)} done={changed}/>}
    {schedule && <ScheduleEditor report={schedule} store={schedules} close={()=>setSchedule(null)} onChange={changed}/>}
    {deleteTarget && <Modal title="Permanently delete report?" close={()=>{if(!working)setDeleteTarget(null);}} className="library-dialog">
      <p className="modal-note"><strong>{deleteTarget.name}</strong> will be removed from Trash. This cannot be undone.</p>
      {deleteError && <p className="alert" role="alert">{deleteError}</p>}
      <footer>
        <button type="button" className="secondary-btn" disabled={working} onClick={()=>setDeleteTarget(null)}>Cancel</button>
        <button type="button" className="danger-btn" disabled={working} onClick={()=>void deletePermanently()}>{working?'Deleting…':'Delete permanently'}</button>
      </footer>
    </Modal>}</div>;
}
