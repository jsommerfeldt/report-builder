import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Aggregation, Catalog, Collision, Definition, Field, Order, Preview, ReportClient, RequestError, SavedInfo, SavedReport} from './client';
import {Modal} from './Modal';
import {FieldLibrary} from './FieldLibrary';
import {Icon} from './Icon';
import {PreviewPane} from './PreviewPane';
import {FilterEditor,FiltersPanel,newFilterRule} from './FiltersPanel';
import {LibraryLayout} from './LibraryLayout';
import {FieldsPanel} from './FieldsPanel';
import {Destination,DropField} from './useFieldDrag';
import {WorkspaceBar} from './WorkspaceBar';

function numberSorts(order:Order[]):Order[] {
  let rank=0;
  return order.map(item=>item.enabled===false?item:{...item,priority:++rank});
}

function placeField(fields:string[],id:string,anchor?:string,after?:boolean) {
  const reordered=fields.filter(field=>field!==id);
  const at=anchor?reordered.indexOf(anchor):-1;
  reordered.splice(at<0?reordered.length:at+(after?1:0),0,id);
  return reordered;
}

function definitionKey(d:Definition) {
  return JSON.stringify([d.version,d.source,d.mode,d.fields,d.groupBy?[...d.groupBy].sort():null,(d.filters ?? []).map(r=>{
    const value=r.value;
    const operand=typeof value==='object' && !Array.isArray(value)?[value.direction,value.amount,value.unit]:value;
    return [r.field,r.op,operand,r.enabled,r.caseSensitive??false];
  }),
    d.fields.map(id=>{const o=d.order?.find(item=>item.field===id);return [id,o?.direction??'asc',!!o && o.enabled!==false,o?.priority??null,d.aggregations?.[id]??'sum'];})]);
}
const message = (e: unknown) => e instanceof Error ? e.message : 'The operation failed.';
// Moving output columns only rearranges the cells in an already computed result.
function previewKey(d:Definition,outputIds:string[]) {
  return definitionKey({...d,fields:[...outputIds].sort(),groupBy:undefined,
    aggregations:d.mode==='summary'?d.aggregations:undefined});
}
interface BuilderProps {catalog:Catalog; client:ReportClient; initialReport?:SavedReport; folderId?:string|null; onReports?():void}
export function ReportBuilder({catalog,client,initialReport,folderId,onReports}:BuilderProps) {
  const blank=useMemo<Definition>(()=>({version:catalog.starter.version,source:'sales',mode:'summary',fields:[]}),[catalog.starter.version]);
  const initial = initialReport?.definition ?? (onReports ? blank : catalog.starter);
  const newReport=Boolean(onReports && !initialReport);
  const [definition, setDefinition] = useState<Definition>(initial);
  const [title, setTitle] = useState(initialReport?.name ?? (onReports ? 'Untitled report' : 'Sales by state and product'));
  const [baseTitle,setBaseTitle]=useState(title);
  const [renaming,setRenaming]=useState(false);
  const [collision,setCollision]=useState<Collision|null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(initialReport??null);
  const [baseline, setBaseline] = useState(definitionKey(initial));
  const [result, setResult] = useState<{data:Preview; key:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'save' | 'open' | null>(null);
  const [name, setName] = useState('');
  const [listing,setListing] = useState<SavedInfo[]>([]);
  const [working,setWorking] = useState(false);
  const [modalError,setModalError] = useState('');
  const [editorSession,setEditorSession] = useState(0);
  const [filterEditor,setFilterEditor]=useState<FilterEditor>(null);
  const [queryCollapsed,setQueryCollapsed]=useState(false);
  const [expandedCards,setExpandedCards]=useState<Partial<Record<Destination,boolean>>>(()=>newReport?{fields:true}:{});
  const [fieldInteraction,setFieldInteraction]=useState(false);
  const queryOpen=!queryCollapsed || fieldInteraction;
  const [notice,setNotice] = useState('');
  const generation = useRef(0);
  const byId = useMemo(() => Object.fromEntries(catalog.fields.map(f => [f.id, f])) as Record<string,Field>, [catalog]);
  const columns=definition.fields.map(id=>byId[id]);
  const dimensions=columns.filter(field=>!field.measure);
  const groupBy=definition.groupBy??dimensions.map(field=>field.id);
  const grouped=definition.mode==='summary';
  const outputIds=useMemo(()=>{
    if(!grouped || !definition.groupBy)return definition.fields;
    const groupKeys=new Set(definition.groupBy);
    return definition.fields.filter(id=>byId[id].measure || groupKeys.has(id));
  },[byId,definition.fields,definition.groupBy,grouped]);
  const hasOutput=outputIds.length>0;
  const lookup = useCallback((field:string, query:string, offset:number)=>client.values(field,query,offset,definition.version),
    [client,definition.version]);
  const key = definitionKey(definition);
  const dirty = key !== baseline || title!==baseTitle;
  const shown = hasOutput ? result : null;
  const sameColumns=!!shown && shown.data.fields.length===outputIds.length &&
    outputIds.every(id=>shown.data.fields.includes(id));
  const displayData=useMemo(()=>{
    if(!shown || !sameColumns)return shown?.data??null;
    const original=shown.data;
    const indexes=outputIds.map(id=>original.fields.indexOf(id));
    return {...original,fields:outputIds,rows:original.rows.map(row=>indexes.map(i=>row[i]))};
  },[shown,sameColumns,outputIds]);

  async function run(d:Definition) {
    const ticket = ++generation.current;
    setBusy(true); setError('');
    try { const data = await client.preview(d);
      if (ticket === generation.current) setResult({data, key:previewKey(d,data.fields)});
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
    setDefinition(prev=>{
      const groupBy=prev.groupBy?.filter(id=>fields.includes(id));
      const mode=groupBy?.length===0 && !fields.some(id=>byId[id].measure)?'detail':prev.mode;
      return {...prev,fields,groupBy,mode,
        aggregations:prev.aggregations && Object.fromEntries(Object.entries(prev.aggregations).filter(([id])=>fields.includes(id))),
        order:prev.order && numberSorts(prev.order.filter(o=>fields.includes(o.field)))};
    });
    setNotice('');setError('');
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
  function setGrouping(mode:Definition['mode'],groupBy:string[]) {
    setDefinition(prev=>({...prev,mode,groupBy}));
    setNotice('');setError('');
  }
  function changeAggregation(id:string,method:Aggregation) {
    setDefinition(prev=>{
      const aggregations={...prev.aggregations};
      if(method==='sum')delete aggregations[id];
      else aggregations[id]=method;
      return {...prev,aggregations};
    });
    setNotice('');setError('');
  }
  function toggleGroup(id:string,active:boolean) {
    const current=grouped?groupBy:[];
    const next=active?[...current,id]:current.filter(key=>key!==id);
    setGrouping(next.length?'summary':'detail',next);
  }
  function cardDisclosure(card:Destination) {
    return {
      expanded:expandedCards[card]??false,
      setExpanded:(value:boolean)=>setExpandedCards(prev=>({...prev,[card]:value})),
    };
  }
  function revealDestination(card:Destination) {
    setQueryCollapsed(false);
    cardDisclosure(card).setExpanded(true);
  }
  function startFilter(id?:string) {
    const count=definition.filters?.length??0;
    const field=id?byId[id]:undefined;
    if(!filterEditor && count<32 && (!id || field)) {
      revealDestination('filters');
      setFilterEditor({index:count,rule:newFilterRule(field)});
    }
  }
  const dropField:DropField=(id,zone,anchor,after)=>{
    if(zone==='filters'){startFilter(id);return;}
    if (!byId[id] || id===anchor) return;
    changeFields(placeField(definition.fields,id,anchor,after));
    revealDestination('fields');
  };
  function moveOutputColumn(id:string,anchor:string,after:boolean) {
    if(id===anchor)return;
    const reordered=placeField(outputIds,id,anchor,after);
    // Leave the positions of columns hidden by grouping alone.
    let next=0;
    changeFields(definition.fields.map(field=>outputIds.includes(field)?reordered[next++]:field));
  }
  function discardOK() { return !dirty || window.confirm('Discard unsaved report changes?'); }
  async function openList() {
    setModalError(''); setListing([]); setDialog('open'); setWorking(true);
    try { setListing(await client.list()); } catch(e) { setModalError(message(e)); } finally {setWorking(false);}
  }
  async function openReport(id:string) {
    if (!discardOK()) return;
    setWorking(true); setModalError('');
    try { const r=await client.open(id);
      setEditorSession(n=>n+1);setFilterEditor(null);setFieldInteraction(false);setExpandedCards({});
      setSaved(r); setTitle(r.name); setBaseTitle(r.name); setRenaming(false); setDefinition(r.definition); setBaseline(definitionKey(r.definition));
      setResult(null); setDialog(null); setNotice('Report opened'); void run(r.definition);
    } catch(e) {setModalError(message(e));} finally {setWorking(false);}
  }
  async function save(e:React.FormEvent) {
    e.preventDefault(); if (working || !name.trim() || !hasOutput) return;
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
  return <div className="shell">
    <div className="editor-header">
    <WorkspaceBar onReports={onReports && (()=>{if(discardOK())onReports();})}/>
    <header className="editor-bar">
      <div className="bar-title">
        {renaming ? <form className="title-edit" onSubmit={e=>{e.preventDefault();if(name.trim()){setTitle(name.trim());setRenaming(false);}}}>
          <input autoFocus aria-label="Report title" maxLength={80} required value={name} onFocus={e=>e.target.select()}
            onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setRenaming(false);}}}/>
          <div className="title-edit-actions">
            <button type="submit" className="primary-btn" disabled={!name.trim()}>Apply title</button>
            <button type="button" className="secondary-btn" onClick={()=>setRenaming(false)}>Cancel</button>
          </div>
        </form> : <h1><button className="rename-title" title="Rename report" aria-label={'Rename report: '+title} onClick={()=>{setName(title);setRenaming(true);}}>
          <span>{title}</span><Icon name="edit" size={15}/></button></h1>}
      </div>
      <div className="editor-actions">
        {!onReports && <button type="button" className="secondary-btn" onClick={openList}>
          <Icon name="folder" size={16}/>Saved reports</button>}
        <div className="save-actions">
          <p role="status" className={'doc-status'+(dirty?' unsaved':'')}>{dirty?'Unsaved changes':saved?'Saved':'Draft'}</p>
          <button type="button" className="primary-btn" disabled={!hasOutput || renaming}
            onClick={()=>{setCollision(null);setModalError('');setName(title);setDialog('save');}}>
            <Icon name="save" size={16}/>Save report</button>
        </div>
      </div>
    </header>
    </div>
    <main className="editor-content">
      <LibraryLayout newReport={newReport} library={<FieldLibrary key={editorSession} catalog={catalog} fields={definition.fields} toggle={toggle}
        drop={dropField} onInteraction={setFieldInteraction}/>}
        headerAction={<button type="button" className="primary-btn" disabled={busy || !hasOutput} onClick={()=>void run(definition)}>
          <Icon name="play" size={15}/>{busy?'Running…':'Run preview'}
        </button>}>
        <section className={'query-controls'+(queryOpen?'':' query-collapsed')} aria-labelledby="query-heading">
          <div className="query-header">
            <h3 id="query-heading"><button type="button" className="pane-disclosure" aria-expanded={queryOpen}
              aria-controls="query-contents" onClick={()=>setQueryCollapsed(collapsed=>!collapsed)}>
              <Icon name="chevron" size={16}/>Query
            </button></h3>
          </div>
          <div className="query-body" id="query-contents" hidden={!queryOpen}>
            <div className="query-scroll">
              <FieldsPanel key={'fields-'+editorSession} fields={columns} outputIds={outputIds} disclosure={cardDisclosure('fields')}
                order={definition.order??[]} drop={dropField} remove={toggle} sort={changeSort} showDropTarget={fieldInteraction}
                groupBy={grouped?groupBy:[]} totalsOnly={grouped && !groupBy.length}
                aggregations={definition.aggregations} onAggregationChange={changeAggregation}
                onGroupChange={toggleGroup} onTotalsChange={active=>setGrouping(active?'summary':'detail',[])}/>
              <FiltersPanel key={editorSession} fields={catalog.fields} entities={catalog.entities} lookup={lookup} rules={definition.filters??[]}
                disclosure={cardDisclosure('filters')}
                editor={filterEditor} setEditor={setFilterEditor} start={startFilter} showDropTarget={fieldInteraction}
                onChange={filters=>{setDefinition(prev=>({...prev,filters}));setNotice('');setError('');}}/>
            </div>
            <div className="query-footer">
              {catalog.scope.companies && <div className="query-scope">
                <span>{definition.version===1?'Sales scope · 0030':'Sales scope · '+catalog.scope.companies.join(', ')}</span>
                {definition.version===1 && <button type="button" className="text-action"
                  onClick={()=>{setDefinition(prev=>({...prev,version:2}));setNotice('');}}>Include both companies</button>}
              </div>}
            </div>
          </div>
        </section>
      </LibraryLayout>
      <PreviewPane data={displayData} byId={byId} stale={Boolean(shown && shown.key!==previewKey(definition,outputIds))} error={error}
        canMove={sameColumns} move={moveOutputColumn}
        busy={busy} hasFields={Boolean(definition.fields.length)} hasOutput={hasOutput}/>
      <p className="sr-only" role="status">{notice}</p>
    </main>
    {dialog==='save' && <Modal title={collision?'Replace saved report?':'Save report'} close={close}><form onSubmit={save}>
      {collision ? <p className="modal-note">Replace the saved definition of <strong>{collision.name}</strong> with this report?
        {saved && <> Your previously saved report, <strong>{saved.name}</strong>, will keep its own definition.</>}</p> : <>
      <label className="input-label" htmlFor="report-name">Report name</label><input className="name-input" id="report-name" maxLength={80} required autoFocus
        value={name} onFocus={e => e.target.select()} onChange={e => setName(e.target.value)}/>
      <p className="modal-note">Saves the columns, filters, grouping, and output order on this device.</p></>}
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
