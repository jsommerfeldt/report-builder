import React,{useState} from 'react';
import {Folder,LibraryClient,SavedInfo} from './client';
import {Modal} from './Modal';

export type FolderPath={folder:Folder;parents:Folder[];label:string};
export function folderPaths(folders:Folder[]):FolderPath[] {
  const byId=new Map(folders.map(f=>[f.id,f]));
  return folders.map(folder=>{
    const parents:Folder[]=[];
    let id=folder.parentId;
    while(id){const parent=byId.get(id);if(!parent)break;parents.unshift(parent);id=parent.parentId;}
    return {folder,parents,label:[...parents,folder].map(f=>f.name).join(' / ')};
  }).sort((a,b)=>a.label.localeCompare(b.label));
}

export type ManagedItem={kind:'new';parentId:string|null}|{kind:'folder';folder:Folder;deleteNow?:boolean}|{kind:'report';report:SavedInfo};
interface Props {item:ManagedItem;paths:FolderPath[];library:LibraryClient;close():void;done(message:string):void}
export function LibraryDialog({item,paths,library,close,done}:Props) {
  const folder=item.kind==='folder'?item.folder:null;
  const report=item.kind==='report'?item.report:null;
  const [name,setName]=useState(folder?.name??'');
  const [parent,setParent]=useState((item.kind==='new'?item.parentId:folder?.parentId??report?.folderId)??'');
  const [deleting,setDeleting]=useState(item.kind==='folder' && !!item.deleteNow);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const possible=paths.filter(p=>!folder || p.folder.id!==folder.id && !p.parents.some(f=>f.id===folder.id));
  const title=deleting?(report?'Delete report?':'Delete folder?'):report?'Manage report':folder?'Manage folder':'New folder';
  const cancel=()=>{if(!busy)close();};
  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(busy)return;
    setError('');setBusy(true);
    try {
      let notice:string;
      if(report){
        if(deleting){await library.trash(report);notice=report.name+' moved to Trash.';}
        else{await library.move(report,parent||null);notice='Report moved.';}
      }else if(folder){
        if(deleting){await library.deleteFolder(folder);notice='Folder deleted.';}
        else{await library.updateFolder(folder,name,parent||null);notice='Folder updated.';}
      }else{await library.createFolder(name,parent||null);notice='Folder created.';}
      done(notice);
    }catch(e){setError(e instanceof Error?e.message:'The library could not be updated.');setBusy(false);}
  }
  const unchanged=report?(report.folderId??'')===parent:folder?folder.name===name.trim() && (folder.parentId??'')===parent:false;
  return <Modal title={title} close={cancel} className="library-dialog"><form onSubmit={submit}>
    {deleting?<p className="modal-note">{report?<>Move <strong>{report.name}</strong> to Trash? You can restore it from the homepage.</>:
      <>Delete <strong>{folder?.name}</strong>? Its reports and subfolders will move up one level.</>}</p>:<>
      {report && <p className="dialog-subject">{report.name}</p>}
      {!report && <label>Folder name<input required autoFocus value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>}
      <label>{report?'Move to':'Parent folder'}<select value={parent} onChange={e=>setParent(e.target.value)}>
        <option value="">Library root</option>{possible.map(p=><option key={p.folder.id} value={p.folder.id}>{p.label}</option>)}</select></label>
    </>}
    {error && <p className="alert" role="alert">{error}</p>}
    <footer>{!deleting && item.kind!=='new' && <button type="button" className="text-danger" onClick={()=>{setError('');setDeleting(true);}} disabled={busy}>Delete {report?'report':'folder'}</button>}
      <button type="button" className="secondary-btn" onClick={deleting && !(item.kind==='folder' && item.deleteNow)?()=>{setError('');setDeleting(false);}:cancel} disabled={busy}>{deleting && !(item.kind==='folder' && item.deleteNow)?'Go back':'Cancel'}</button>
      <button type="submit" className={deleting?'danger-btn':'primary-btn'} disabled={busy || (!deleting && (unchanged || (!report&&!name.trim())))}>
        {deleting?(report?'Move to Trash':'Delete folder'):report?'Move report':folder?'Save changes':'Create folder'}</button>
    </footer>
  </form></Modal>;
}
