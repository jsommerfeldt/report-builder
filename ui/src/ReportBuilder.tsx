import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Aggregation, Catalog, Collision, ColumnNames, Definition, Field, Order, Preview, ReportClient, ReportFilter,
  RequestError, SavedInfo, SavedReport} from './client';
import {Modal} from './Modal';
import {FieldLibrary} from './FieldLibrary';
import {Icon} from './Icon';
import {PreviewPane} from './PreviewPane';
import {FilterEditor,FiltersPanel,newFilterRule} from './FiltersPanel';
import {LibraryLayout} from './LibraryLayout';
import {FieldsPanel} from './FieldsPanel';
import {Destination,DragSource,DropField} from './useFieldDrag';
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
function updateFieldSelection(d:Definition,fields:string[],filters:ReportFilter[]|undefined,byId:Record<string,Field>) {
  const groupBy=d.groupBy && fields.filter(id=>includesDimension(d,id) || (!d.fields.includes(id) && !byId[id].measure));
  return withOutputMode({...d,fields,filters,groupBy,
    columnNames:namesInUse(d.columnNames,fields,filters),
    aggregations:d.aggregations && Object.fromEntries(Object.entries(d.aggregations).filter(([id])=>fields.includes(id))),
    order:d.order && numberSorts(d.order.filter(o=>fields.includes(o.field)))},byId);
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
  const pendingMove=filterEditor?.moveField;
  const [objectPick,setObjectPick]=useState<{destination:Destination;trigger:HTMLButtonElement}|null>(null);
  const objectSearch=useRef<HTMLInputElement>(null);
  const [objectsCollapsed,setObjectsCollapsed]=useState(false);
  const [queryOpen,setQueryOpen]=useState(false);
  const queryToggle=useRef<HTMLButtonElement>(null);
  const queryClose=useRef<HTMLButtonElement>(null);
  const [expandedCards,setExpandedCards]=useState<Partial<Record<Destination,boolean>>>(()=>newReport?{fields:true}:{});
  const [pickedField,setPickedField]=useState<{source:DragSource;id:string}|null>(null);
  const [queryHint,setQueryHint]=useState('');
  const [previewDropActive,setPreviewDropActive]=useState(false);
  const queryVisible=queryOpen && !previewDropActive;
  const [notice,setNotice] = useState('');
  const generation = useRef(0);
  const byId = useMemo(() => Object.fromEntries(catalog.fields.map(f => [f.id, f])) as Record<string,Field>, [catalog]);
  const selectedFields=definition.fields.filter(id=>id!==pendingMove);
  const columns=selectedFields.map(id=>byId[id]);
  const groupBy=definition.fields.filter(id=>!byId[id].measure && !definition.aggregations?.[id] && includesDimension(definition,id));
  const grouped=definition.mode==='summary';
  const summaryIds=useMemo(()=>summaryFields(definition,byId),[definition,byId]);
  const outputIds=grouped?summaryIds:definition.fields;
  const hasOutput=outputIds.length>0;
  const lookup = useCallback((field:string, query:string, offset:number)=>client.values(field,query,offset,definition.version),
    [client,definition.version]);
  const key = definitionKey(definition);
  const dirty = key !== baseline || title!==baseTitle;
  const shown = hasOutput ? result : null;
  const previewCurrent=Boolean(shown && !busy && !error && shown.key===previewKey(definition,outputIds));
  const displayData=useMemo(()=>{
    if(!shown)return null;
    const original=shown.data;
    const indexes=outputIds.map(id=>original.fields.indexOf(id));
    return {...original,fields:outputIds,rows:original.rows.map(row=>indexes.map(i=>i<0?null:row[i]))};
  },[shown,outputIds]);

  async function run(d:Definition) {
    const ticket = ++generation.current;
    setBusy(true); setError('');
    try { const data = await client.preview(d);
      if (ticket === generation.current) setResult({data, key:previewKey(d,data.fields)});
    } catch (e) { if (ticket === generation.current) setError(message(e)); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  useEffect(() => { if(initial.fields.length)void run(initial); return () => { generation.current++; }; }, [initial,client]);
  useLayoutEffect(()=>{
    if(!objectPick)return;
    objectSearch.current?.focus();
    objectSearch.current?.select();
  },[objectPick]);
  useEffect(() => {
    if (!dirty) return;
    const warn=(e:BeforeUnloadEvent) => { e.preventDefault(); e.returnValue=''; };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  }, [dirty]);
  function changeFields(fields:string[]) {
    setDefinition(prev=>updateFieldSelection(prev,fields,prev.filters,byId));
    setNotice('');setError('');
  }
  function changeFilters(filters:ReportFilter[]) {
    setDefinition(prev=>pendingMove
      ? updateFieldSelection(prev,prev.fields.filter(id=>id!==pendingMove),filters,byId)
      : {...prev,filters,columnNames:namesInUse(prev.columnNames,prev.fields,filters)});
    setNotice('');setError('');
  }
  function renameColumn(field:Field,value:string) {
    setDefinition(prev=>{
      const columnNames={...prev.columnNames};
      if(value===field.label)delete columnNames[field.id];
      else columnNames[field.id]=value;
      return {...prev,columnNames};
    });
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
  function changeAggregation(id:string,method:Aggregation|'none') {
    setDefinition(prev=>{
      const aggregations={...prev.aggregations};
      if(method==='sum')delete aggregations[id];
      else aggregations[id]=method;
      return withOutputMode({...prev,aggregations},byId);
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
    setQueryOpen(true);
    setQueryHint('');
    cardDisclosure(card).setExpanded(true);
  }
  function toggleQuery() {
    if(queryOpen){closeQuery();return;}
    setQueryOpen(true);
    requestAnimationFrame(()=>queryClose.current?.focus({preventScroll:true}));
  }
  function closeQuery() {
    setObjectPick(null);
    if(pendingMove)setFilterEditor(null);
    setQueryHint('');
    setQueryOpen(false);
    requestAnimationFrame(()=>queryToggle.current?.focus({preventScroll:true}));
  }
  function pickObject(destination:Destination,trigger:HTMLButtonElement) {
    setObjectsCollapsed(false);
    setQueryHint('');
    setObjectPick({destination,trigger});
  }
  function cancelObjectPick(returnFocus:boolean) {
    if(!objectPick)return false;
    setObjectPick(null);
    if(returnFocus)objectPick.trigger.focus({preventScroll:true});
    return true;
  }
  function explainQueryAction(hint:string) {
    setQueryHint(hint);
    setQueryOpen(true);
  }
  function startFilter(id:string,source:DragSource,copy:boolean) {
    const count=definition.filters?.length??0;
    const field=byId[id];
    if(!field || filterEditor)return;
    const moving=source==='fields' && !copy;
    if(source==='fields' && definition.filters?.some(rule=>rule.field===id)){
      if(moving)changeFields(definition.fields.filter(key=>key!==id));
    }else{
      if(count>=32){
        explainQueryAction('Remove a filter before adding another.');
        return;
      }
      setFilterEditor({index:count,rule:newFilterRule(field),moveField:moving?id:undefined,
        overlapField:source==='objects' || copy?id:undefined});
    }
    setObjectPick(null);
    revealDestination('filters');
  }
  const dropField:DropField=(id,zone,source,anchor,after,copy=false)=>{
    if(!byId[id] || id===anchor || id===pendingMove)return;
    if(zone==='filters'){startFilter(id,source,copy);return;}
    setObjectPick(null);
    if(source==='filters'){
      setDefinition(prev=>{
        const fields=prev.fields.includes(id) && (copy || !anchor)?prev.fields:placeField(prev.fields,id,anchor,after);
        const filters=copy?prev.filters:(prev.filters??[]).filter(rule=>rule.field!==id);
        return updateFieldSelection(prev,fields,filters,byId);
      });
      setNotice('');setError('');
      requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-column="'+id+'"] .move-field')?.focus());
    }else if(zone!=='preview' || anchor || !definition.fields.includes(id)){
      changeFields(placeField(definition.fields,id,anchor,after));
    }
    revealDestination('fields');
  };
  function selectObjectField(id:string) {
    if(id===pendingMove)return;
    const inColumns=definition.fields.includes(id);
    const inFilters=definition.filters?.some(rule=>rule.field===id);
    if((objectPick?.destination==='filters' && inColumns && !inFilters) ||
      (objectPick?.destination!=='filters' && !inColumns && inFilters)){
      explainQueryAction('Drag this field from Objects, or hold Ctrl while dragging it between Columns and Filters, to use it in both sections.');
      return;
    }
    setQueryHint('');
    if(objectPick)dropField(id,objectPick.destination,'objects');
    else toggle(id);
  }
  function trackField(source:DragSource,id:string|null) {
    setPickedField(id===null?null:{source,id});
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
      setEditorSession(n=>n+1);setFilterEditor(null);setObjectPick(null);setPickedField(null);setPreviewDropActive(false);setQueryHint('');
      setQueryOpen(false);setExpandedCards({});
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
          <button type="button" className="primary-btn" disabled={!hasOutput || renaming || !!pendingMove}
            onClick={()=>{setCollision(null);setModalError('');setName(title);setDialog('save');}}>
            <Icon name="save" size={16}/>Save report</button>
        </div>
      </div>
    </header>
    </div>
    <main className="editor-content" onKeyDown={e=>{
      if(queryOpen && !pickedField && e.key==='Escape' && !e.defaultPrevented && !(e.target as HTMLElement).closest('dialog[open]')){
        e.preventDefault();
        closeQuery();
      }
    }}>
      <LibraryLayout newReport={newReport} queryVisible={queryVisible} toggleQuery={toggleQuery} closeQuery={closeQuery}
        previewRun={{run:()=>void run(definition),disabled:busy || !hasOutput || !!pendingMove,busy,current:previewCurrent}}
        objectsCollapsed={objectsCollapsed} toggleObjects={()=>{
          if(!objectsCollapsed)setObjectPick(null);
          setObjectsCollapsed(!objectsCollapsed);
        }}
        queryToggle={queryToggle} queryClose={queryClose}
        library={<FieldLibrary key={editorSession} catalog={catalog} fields={selectedFields} selectField={selectObjectField}
          searchRef={objectSearch} pickingFilter={objectPick?.destination==='filters'} cancelPick={cancelObjectPick}
          drop={dropField} onInteraction={id=>trackField('objects',id)} onPreviewHover={setPreviewDropActive}/>}>
        <div className="query-body" id="query-contents">
          <div className="query-scroll">
            {queryHint && <p className="query-drag-hint" role="status">{queryHint}</p>}
            <FieldsPanel key={'fields-'+editorSession} fields={columns} outputIds={outputIds} disclosure={cardDisclosure('fields')}
              entities={catalog.entities} columnNames={definition.columnNames} rename={renameColumn}
              onAdd={e=>pickObject('fields',e.currentTarget)}
              order={definition.order??[]} drop={dropField} onInteraction={id=>trackField('fields',id)} onPreviewHover={setPreviewDropActive}
              remove={toggle} sort={changeSort} showDropTarget={pickedField?.source==='objects' || pickedField?.source==='filters'}
              groupBy={groupBy} summary={grouped} canSummarize={summaryIds.length>0} onSummaryChange={setSummary}
              aggregations={definition.aggregations} onAggregationChange={changeAggregation}/>
            <FiltersPanel key={editorSession} fields={catalog.fields} entities={catalog.entities} lookup={lookup} rules={definition.filters??[]}
              columnNames={definition.columnNames} rename={renameColumn} disclosure={cardDisclosure('filters')}
              editor={filterEditor} setEditor={setFilterEditor} drop={dropField} onInteraction={id=>trackField('filters',id)} onPreviewHover={setPreviewDropActive}
              outputFields={definition.fields} incomingColumn={pickedField?.source==='fields'?pickedField.id:undefined}
              showDropTarget={pickedField?.source==='objects' || pickedField?.source==='fields'}
              onAdd={e=>pickObject('filters',e.currentTarget)} onChange={changeFilters}/>
          </div>
          <div className="query-footer">
            {catalog.scope.companies && <div className="query-scope">
              <span>{definition.version===1?'Sales scope · 0030':'Sales scope · '+catalog.scope.companies.join(', ')}</span>
              {definition.version===1 && <button type="button" className="text-action"
                onClick={()=>{setDefinition(prev=>({...prev,version:2}));setNotice('');}}>Include both companies</button>}
            </div>}
          </div>
        </div>
      </LibraryLayout>
      <PreviewPane data={displayData} outputIds={outputIds} byId={byId} error={error}
        entities={catalog.entities} columnNames={definition.columnNames} move={moveOutputColumn}
        rename={renameColumn} busy={busy} hasFields={Boolean(definition.fields.length)}/>
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
