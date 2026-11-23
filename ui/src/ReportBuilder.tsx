import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Catalog, Collision, Definition, Field, Order, Preview, ReportClient, RequestError, SavedInfo, SavedReport} from './client';
import {Modal} from './Modal';
import {FieldLibrary} from './FieldLibrary';
import {Icon} from './Icon';
import {PreviewPane} from './PreviewPane';
import {FilterEditor,FiltersPanel} from './FiltersPanel';
import {LibraryLayout} from './LibraryLayout';
import {FieldsPanel} from './FieldsPanel';
import {DropField} from './useFieldDrag';
import {WorkspaceBar} from './WorkspaceBar';

function numberSorts(order:Order[]):Order[] {
  let rank=0;
  return order.map(item=>item.enabled===false?item:{...item,priority:++rank});
}

function definitionKey(d:Definition) {
  return JSON.stringify([d.version,d.source,d.mode,d.fields,(d.filters ?? []).map(r=>[r.field,r.op,r.value,r.enabled]),
    d.fields.map(id=>{const o=d.order?.find(item=>item.field===id);return [id,o?.direction??'asc',!!o && o.enabled!==false,o?.priority??null];})]);
}
const message = (e: unknown) => e instanceof Error ? e.message : 'The operation failed.';
// Moving output columns only rearranges the cells in an already computed result.
function previewKey(d:Definition) {
  return definitionKey({...d,fields:[...d.fields].sort()});
}
const blank:Definition={version:1,source:'sales',mode:'summary',fields:[]};
interface BuilderProps {catalog:Catalog; client:ReportClient; initialReport?:SavedReport; folderId?:string|null; onHome?():void; onReports?():void}
export function ReportBuilder({catalog,client,initialReport,folderId,onHome,onReports}:BuilderProps) {
  const initial = initialReport?.definition ?? (onHome ? blank : catalog.starter);
  const [definition, setDefinition] = useState<Definition>(initial);
  const [title, setTitle] = useState(initialReport?.name ?? (onHome ? 'Untitled report' : 'Sales by state and product'));
  const [baseTitle,setBaseTitle]=useState(title);
  const [renaming,setRenaming]=useState(false);
  const [collision,setCollision]=useState<Collision|null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(initialReport??null);
  const [baseline, setBaseline] = useState(definitionKey(initial));
  const [result, setResult] = useState<{data:Preview; key:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'save' | 'open' | 'query-mode' | null>(null);
  const [name, setName] = useState('');
  const [listing,setListing] = useState<SavedInfo[]>([]);
  const [working,setWorking] = useState(false);
  const [modalError,setModalError] = useState('');
  const [editorSession,setEditorSession] = useState(0);
  const [filterEditor,setFilterEditor]=useState<FilterEditor>(null);
  const [notice,setNotice] = useState('');
  const generation = useRef(0);
  const modeHelp = useRef<HTMLButtonElement>(null);
  const byId = useMemo(() => Object.fromEntries(catalog.fields.map(f => [f.id, f])) as Record<string,Field>, [catalog]);
  const key = definitionKey(definition);
  const dirty = key !== baseline || title!==baseTitle;
  const shown = definition.fields.length ? result : null;
  const sameColumns=!!shown && shown.data.fields.length===definition.fields.length &&
    definition.fields.every(id=>shown.data.fields.includes(id));
  const displayData=useMemo(()=>{
    if(!shown || !sameColumns)return shown?.data??null;
    const original=shown.data;
    const indexes=definition.fields.map(id=>original.fields.indexOf(id));
    return {...original,fields:definition.fields,rows:original.rows.map(row=>indexes.map(i=>row[i]))};
  },[shown,sameColumns,definition.fields]);

  async function run(d:Definition) {
    const ticket = ++generation.current;
    setBusy(true); setError('');
    try { const data = await client.preview(d);
      if (ticket === generation.current) setResult({data, key:previewKey(d)});
    } catch (e) { if (ticket === generation.current) setError(message(e)); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  useEffect(() => { if(initial.fields.length)void run(initial); return () => { generation.current++; }; }, [initial,client]);
  useEffect(() => {
    if (!dirty) return;
    const warn=(e:BeforeUnloadEvent) => { e.preventDefault(); e.returnValue=''; };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  }, [dirty]);
  function changeFields(fields:string[]) {
    setDefinition(prev => ({...prev,fields,order:prev.order && numberSorts(prev.order.filter(o=>fields.includes(o.field)))})); setNotice(''); setError('');
  }
  function toggle(id:string) {
    changeFields(definition.fields.includes(id) ? definition.fields.filter(f => f !== id) : [...definition.fields,id]);
  }
  function changeSort(setting:Order) {
    setDefinition(prev=>{
      const current=prev.order??[];
      const old=current.find(item=>item.field===setting.field);
      const rest=current.filter(item=>item.field!==setting.field);
      const active=rest.filter(item=>item.enabled!==false);
      const inactive=rest.filter(item=>item.enabled===false);
      if(setting.enabled===false) inactive.push(setting);
      else {
        const priority=setting.priority??old?.priority??(active.length+1);
        active.splice(priority-1,0,setting);
      }
      return {...prev,order:numberSorts([...active,...inactive])};
    });
    setError('');setNotice('');
  }
  function startFilter(id:string) {
    const count=definition.filters?.length??0;
    if(!filterEditor && count<32 && byId[id])setFilterEditor({index:count,rule:{field:id,op:'in',value:[],enabled:true}});
  }
  const dropField:DropField=(id,zone,anchor,after)=>{
    if(zone==='filters'){startFilter(id);return;}
    if (!byId[id] || id===anchor) return;
    const fields=definition.fields.filter(field=>field!==id);
    const at=anchor?fields.indexOf(anchor):-1;
    fields.splice(at<0?fields.length:at+(after?1:0),0,id);
    changeFields(fields);
  };
  function discardOK() { return !dirty || window.confirm('Discard unsaved report changes?'); }
  async function openList() {
    setModalError(''); setListing([]); setDialog('open'); setWorking(true);
    try { setListing(await client.list()); } catch(e) { setModalError(message(e)); } finally {setWorking(false);}
  }
  async function openReport(id:string) {
    if (!discardOK()) return;
    setWorking(true); setModalError('');
    try { const r=await client.open(id);
      setEditorSession(n=>n+1);setFilterEditor(null);
      setSaved(r); setTitle(r.name); setBaseTitle(r.name); setRenaming(false); setDefinition(r.definition); setBaseline(definitionKey(r.definition));
      setResult(null); setDialog(null); setNotice('Report opened'); void run(r.definition);
    } catch(e) {setModalError(message(e));} finally {setWorking(false);}
  }
  async function save(e:React.FormEvent) {
    e.preventDefault(); if (working || !name.trim()) return;
    setWorking(true); setModalError('');
    try { const overwrite=collision?{id:collision.id,revision:collision.revision}:undefined;
      const r=await client.save(name.trim(),definition,saved,overwrite,folderId);
      setSaved(r); setTitle(r.name); setBaseTitle(r.name); setBaseline(definitionKey(r.definition)); setDialog(null); setCollision(null); setNotice('Report saved');
    } catch(e) {
      setCollision(e instanceof RequestError && e.overwriteTarget ? e.overwriteTarget : null);
      if (!(e instanceof RequestError && e.overwriteTarget)) setModalError(message(e));
    } finally {setWorking(false);}
  }
  const close=() => {if (!working) setDialog(null);};
  function closeModeExamples() {
    setDialog(null);
    requestAnimationFrame(()=>modeHelp.current?.focus());
  }
  return <div className="shell">
    <div className="editor-header">
    <WorkspaceBar active={onReports?'reports':undefined} onHome={onHome && (()=>{if(discardOK())onHome();})}
      onReports={onReports && (()=>{if(discardOK())onReports();})}/>
    <header className="editor-bar">
      <div className="bar-title">
        {renaming ? <form className="title-edit" onSubmit={e=>{e.preventDefault();if(name.trim()){setTitle(name.trim());setRenaming(false);}}}>
          <input autoFocus aria-label="Report title" maxLength={80} required value={name} onFocus={e=>e.target.select()}
            onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setRenaming(false);}}}/>
          <button className="text-action" disabled={!name.trim()}>Apply title</button><button type="button" className="quiet-btn" onClick={()=>setRenaming(false)}>Cancel</button>
        </form> : <h1><button className="rename-title" title="Rename report" aria-label={'Rename report: '+title} onClick={()=>{setName(title);setRenaming(true);}}>
          <span>{title}</span><Icon name="edit" size={15}/></button></h1>}
        <p role="status" className={'doc-status'+(dirty?' unsaved':'')}>{dirty?'Unsaved changes':saved?'Saved':'Draft'}</p>
      </div>
      <div className="editor-actions">
        {!onHome && <button type="button" className="secondary-btn" onClick={openList}>
          <Icon name="folder" size={16}/>Saved reports</button>}
        <button type="button" className="primary-btn" disabled={!definition.fields.length || renaming}
          onClick={()=>{setCollision(null);setModalError('');setName(title);setDialog('save');}}>
          <Icon name="save" size={16}/>Save report</button>
      </div>
    </header>
    </div>
    <main className="editor-content">
      <LibraryLayout library={<FieldLibrary key={editorSession} catalog={catalog} fields={definition.fields} toggle={toggle} drop={dropField}/>}>
        <section className="query-controls" aria-labelledby="query-heading">
          <div className="query-header">
            <h3 id="query-heading">Query</h3>
            <div className="query-mode">
              <div className="segments" role="group" aria-label="Query mode">{(['summary','detail'] as const).map(mode=>
                <button key={mode} type="button" aria-pressed={definition.mode===mode}
                  onClick={()=>{setDefinition(prev=>({...prev,mode}));setNotice('');}}>{mode==='summary'?'Summary':'Detail'}</button>)}</div>
              <button ref={modeHelp} type="button" className="icon-button query-help" aria-label="Query mode examples" aria-haspopup="dialog"
                title="Query mode examples" onClick={()=>setDialog('query-mode')}><Icon name="help"/></button>
            </div>
          </div>
          <div className="query-scroll">
            <FieldsPanel key={'fields-'+editorSession} fields={definition.fields.map(id=>byId[id])}
              order={definition.order??[]} drop={dropField} remove={toggle} sort={changeSort}/>
            <FiltersPanel key={editorSession} fields={catalog.fields} entities={catalog.entities} lookup={client.values} rules={definition.filters??[]}
              editor={filterEditor} setEditor={setFilterEditor} start={startFilter}
              onChange={filters=>{setDefinition(prev=>({...prev,filters}));setNotice('');setError('');}}/>
          </div>
          <div className="query-footer">
            <button className="primary-btn" disabled={busy || !definition.fields.length} onClick={()=>void run(definition)}>
              <Icon name="play" size={15}/>{busy?'Running…':'Run preview'}</button>
          </div>
        </section>
      </LibraryLayout>
      <PreviewPane data={displayData} byId={byId} stale={Boolean(shown && shown.key!==previewKey(definition))} error={error}
        canMove={sameColumns} move={(id,anchor,after)=>dropField(id,'fields',anchor,after)}
        busy={busy} hasFields={Boolean(definition.fields.length)}/>
      <p className="sr-only" role="status">{notice}</p>
    </main>
    {dialog==='query-mode' && <Modal title="Query mode examples" close={closeModeExamples}>
      <p className="modal-note">Suppose you select Shipping state and Sales for two Minnesota sales of $40 and $60.</p>
      <dl className="mode-examples">
        <dt>Summary</dt><dd>One row for Minnesota with $100 in total sales.</dd>
        <dt>Detail</dt><dd>Two rows for Minnesota, one with $40 and one with $60.</dd>
      </dl>
    </Modal>}
    {dialog==='save' && <Modal title={collision?'Replace saved report?':'Save report'} close={close}><form onSubmit={save}>
      {collision ? <p className="modal-note">Replace the saved definition of <strong>{collision.name}</strong> with this report?
        {saved && <> Your previously saved report, <strong>{saved.name}</strong>, will keep its own definition.</>}</p> : <>
      <label className="input-label" htmlFor="report-name">Report name</label><input className="name-input" id="report-name" maxLength={80} required autoFocus
        value={name} onFocus={e => e.target.select()} onChange={e => setName(e.target.value)}/>
      <p className="modal-note">Saves the fields, filters, output order, and report mode on this device.</p></>}
      {modalError && <p role="alert" className="alert">{modalError}</p>}
      <footer><button type="button" className="secondary-btn" onClick={collision?()=>setCollision(null):close} disabled={working}>{collision?'Go back':'Cancel'}</button>
        <button className="primary-btn" type="submit" disabled={working || !name.trim()}>{working?'Saving…':collision?'Replace report':'Save'}</button></footer>
    </form></Modal>}
    {dialog==='open' && <Modal title="Saved reports" close={close}>
      {working && <p role="status" className="modal-note">Loading…</p>}
      {!!modalError && <p role="alert" className="alert">{modalError}</p>}
      {!working && !modalError && !listing.length && <p className="modal-note">Your saved reports will appear here.</p>}
      <div className="saved-list">{listing.map(r => <button key={r.id} disabled={working} onClick={() => void openReport(r.id)}>
        <span className="saved-icon"><Icon name="document"/></span><span><strong>{r.name}</strong>
        <small>{new Date(r.updated).toLocaleString()}</small></span><Icon name="arrow" size={15}/></button>)}</div>
    </Modal>}
  </div>;
}
