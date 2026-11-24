import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Aggregation, Catalog, Collision, ColumnNames, Definition, Field, Order, Preview, ReportClient, ReportFilter,
  RequestError, SavedInfo, SavedReport, sourceColumn} from './client';
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
    d.fields.map(id=>{const o=d.order?.find(item=>item.field===id);return [id,o?.direction??'asc',!!o && o.enabled!==false,o?.priority??null,d.aggregations?.[id]??'sum'];}),
    Object.entries(d.columnNames??{}).sort()]);
}
const message = (e: unknown) => e instanceof Error ? e.message : 'The operation failed.';
// Display names and output column order do not change the calculated rows.
function previewKey(d:Definition,outputIds:string[]) {
  return definitionKey({...d,fields:[...outputIds].sort(),groupBy:undefined,columnNames:undefined,
    aggregations:d.mode==='summary'?d.aggregations:undefined});
}
function includesDimension(d:Definition,id:string) {
  return d.groupBy?.includes(id)??true;
}
function summaryFields(d:Definition,byId:Record<string,Field>) {
  return d.fields.filter(id=>byId[id].measure?d.aggregations?.[id]!=='none':!!d.aggregations?.[id] || includesDimension(d,id));
}
function withOutputMode(d:Definition,byId:Record<string,Field>):Definition {
  return d.mode==='summary' && d.fields.length>0 && !summaryFields(d,byId).length?{...d,mode:'detail'}:d;
}
function namesInUse(names:ColumnNames|undefined,fields:string[],filters:ReportFilter[]|undefined) {
  if(!names)return undefined;
  const used=new Set([...fields,...(filters??[]).map(rule=>rule.field)]);
  return Object.fromEntries(Object.entries(names).filter(([id])=>used.has(id)));
}
interface BuilderProps {catalog:Catalog; client:ReportClient; initialReport?:SavedReport; folderId?:string|null; onReports?():void}
export function ReportBuilder({catalog,client,initialReport,folderId,onReports}:BuilderProps) {
  const blank=useMemo<Definition>(()=>({version:catalog.starter.version,source:'sales',mode:'summary',fields:[]}),[catalog.starter.version]);
  const initial = initialReport?.definition ?? (onReports ? blank : catalog.starter);
  const newReport=Boolean(onReports && !initialReport);
  const [definition, setDefinition] = useState<Definition>(initial);
  const [columnRename,setColumnRename]=useState<{field:Field; value:string; trigger:HTMLButtonElement}|null>(null);
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
  const [objectPick,setObjectPick]=useState<{destination:Destination;trigger:HTMLButtonElement}|null>(null);
  const objectSearch=useRef<HTMLInputElement>(null);
  const [queryCollapsed,setQueryCollapsed]=useState(false);
  const [expandedCards,setExpandedCards]=useState<Partial<Record<Destination,boolean>>>(()=>newReport?{fields:true}:{});
  const [fieldInteraction,setFieldInteraction]=useState(false);
  const queryOpen=!queryCollapsed || fieldInteraction;
  const [notice,setNotice] = useState('');
  const generation = useRef(0);
  const byId = useMemo(() => Object.fromEntries(catalog.fields.map(f => [f.id, f])) as Record<string,Field>, [catalog]);
  const columns=definition.fields.map(id=>byId[id]);
  const groupBy=columns.filter(f=>!f.measure && !definition.aggregations?.[f.id] && includesDimension(definition,f.id)).map(f=>f.id);
  const grouped=definition.mode==='summary';
  const summaryIds=useMemo(()=>summaryFields(definition,byId),[definition,byId]);
  const outputIds=grouped?summaryIds:definition.fields;
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
      const groupBy=prev.groupBy && fields.filter(id=>
        includesDimension(prev,id) || (!prev.fields.includes(id) && !byId[id].measure));
      return withOutputMode({...prev,fields,groupBy,
        columnNames:namesInUse(prev.columnNames,fields,prev.filters),
        aggregations:prev.aggregations && Object.fromEntries(Object.entries(prev.aggregations).filter(([id])=>fields.includes(id))),
        order:prev.order && numberSorts(prev.order.filter(o=>fields.includes(o.field)))},byId);
    });
    setNotice('');setError('');
  }
  function changeFilters(filters:ReportFilter[]) {
    setDefinition(prev=>({...prev,filters,columnNames:namesInUse(prev.columnNames,prev.fields,filters)}));
    setNotice('');setError('');
  }
  function renameColumn(field:Field,trigger:HTMLButtonElement) {
    setColumnRename({field,trigger,value:definition.columnNames?.[field.id]??field.label});
  }
  function closeColumnRename() {
    const trigger=columnRename?.trigger;
    setColumnRename(null);
    requestAnimationFrame(()=>trigger?.focus({preventScroll:true}));
  }
  function applyColumnName(nextName:string) {
    if(!columnRename)return;
    const {field}=columnRename;
    const value=nextName.trim();
    setDefinition(prev=>{
      const columnNames={...prev.columnNames};
      if(value===field.label)delete columnNames[field.id];
      else columnNames[field.id]=value;
      return {...prev,columnNames};
    });
    closeColumnRename();
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
  function setSummary(summary:boolean) {
    setDefinition(prev=>({...prev,mode:summary?'summary':'detail'}));
    setNotice('');setError('');
  }
  function changeAggregation(id:string,method:Aggregation|'none'|'') {
    setDefinition(prev=>{
      const aggregations={...prev.aggregations};
      if(method==='' || method==='sum')delete aggregations[id];
      else aggregations[id]=method;
      const groupBy=method==='' && prev.groupBy && !includesDimension(prev,id)?[...prev.groupBy,id]:prev.groupBy;
      return withOutputMode({...prev,aggregations,groupBy},byId);
    });
    setNotice('');setError('');
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
  function cancelObjectPick(returnFocus:boolean) {
    if(!objectPick)return false;
    setObjectPick(null);
    if(returnFocus)objectPick.trigger.focus();
    return true;
  }
  function startFilter(id:string) {
    const count=definition.filters?.length??0;
    const field=byId[id];
    if(!filterEditor && count<32 && field) {
      setObjectPick(null);
      revealDestination('filters');
      setFilterEditor({index:count,rule:newFilterRule(field)});
    }
  }
  const dropField:DropField=(id,zone,anchor,after)=>{
    if(zone==='filters'){startFilter(id);return;}
    if (!byId[id] || id===anchor) return;
    setObjectPick(null);
    changeFields(placeField(definition.fields,id,anchor,after));
    revealDestination('fields');
  };
  function selectObjectField(id:string) {
    if(objectPick)dropField(id,objectPick.destination);
    else toggle(id);
  }
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
      setEditorSession(n=>n+1);setFilterEditor(null);setObjectPick(null);setFieldInteraction(false);setExpandedCards({});
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
      <LibraryLayout newReport={newReport} searchRef={objectSearch} focusRequest={objectPick}
        library={<FieldLibrary key={editorSession} catalog={catalog} fields={definition.fields} selectField={selectObjectField}
          searchRef={objectSearch} pickingFilter={objectPick?.destination==='filters'} cancelPick={cancelObjectPick}
          drop={dropField} onInteraction={setFieldInteraction}/>}>
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
                entities={catalog.entities} columnNames={definition.columnNames} rename={renameColumn}
                onAdd={e=>setObjectPick({destination:'fields',trigger:e.currentTarget})}
                order={definition.order??[]} drop={dropField} remove={toggle} sort={changeSort} showDropTarget={fieldInteraction}
                groupBy={groupBy} summary={grouped} canSummarize={summaryIds.length>0} onSummaryChange={setSummary}
                aggregations={definition.aggregations} onAggregationChange={changeAggregation}/>
              <FiltersPanel key={editorSession} fields={catalog.fields} entities={catalog.entities} lookup={lookup} rules={definition.filters??[]}
                columnNames={definition.columnNames} rename={renameColumn}
                disclosure={cardDisclosure('filters')}
                editor={filterEditor} setEditor={setFilterEditor} showDropTarget={fieldInteraction}
                onAdd={e=>setObjectPick({destination:'filters',trigger:e.currentTarget})}
                onChange={changeFilters}/>
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
        entities={catalog.entities} columnNames={definition.columnNames} run={()=>void run(definition)} canMove={sameColumns} move={moveOutputColumn}
        busy={busy} hasFields={Boolean(definition.fields.length)} hasOutput={hasOutput}/>
      <p className="sr-only" role="status">{notice}</p>
    </main>
    {columnRename && <Modal title="Rename column" close={closeColumnRename}><form onSubmit={e=>{
      e.preventDefault();
      if(columnRename.value.trim())applyColumnName(columnRename.value);
    }}>
      <label className="input-label" htmlFor="column-name">Column name</label>
      <input className="name-input" id="column-name" required maxLength={80}
        ref={input=>{if(input)input.autofocus=true;}} onFocus={e=>e.target.select()}
        value={columnRename.value} onChange={e=>setColumnRename({...columnRename,value:e.target.value})}/>
      <p className="modal-note">{sourceColumn(columnRename.field,catalog.entities)}</p>
      <footer>
        {definition.columnNames?.[columnRename.field.id] && <button type="button" className="text-action"
          onClick={()=>applyColumnName(columnRename.field.label)}>Use original name</button>}
        <button type="button" className="secondary-btn" onClick={closeColumnRename}>Cancel</button>
        <button type="submit" className="primary-btn" disabled={!columnRename.value.trim()}>Apply name</button>
      </footer>
    </form></Modal>}
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
