import React, {useLayoutEffect,useRef} from 'react';
import {Catalog,ColumnNames,Field,FilterOp,RelativePeriod,ReportClient,ReportFilter,sourceColumn} from './client';
import {FieldOptions} from './FieldOptions';
import {Icon} from './Icon';
import {EditableColumnName} from './EditableColumnName';
import {ValuePicker} from './ValuePicker';
import {CardDisclosure,QueryCard} from './QueryCard';
import {filtersHelp} from './QueryHelp';
import {DropField,useFieldDrag} from './useFieldDrag';

const labels:Record<FilterOp,string> = {
  in:'is any of',eq:'equals',neq:'is not',contains:'contains',not_contains:'does not contain',
  gte:'at least',lte:'at most',blank:'is blank',relative:'relative to now',
};
const defaultPeriod:RelativePeriod={direction:'last',amount:7,unit:'days'};
export function newFilterRule(field?:Field,enabled=true):ReportFilter {
  const useList=!field || field.kind==='text';
  return {field:field?.id??'',enabled,op:useList?'in':'eq',value:useList?[]:''};
}
function temporal(field:Field) {return field.kind==='date' || field.kind==='datetime';}
function label(op:FilterOp, field:Field) {
  if (temporal(field) && op === 'gte') return 'on or after';
  if (temporal(field) && op === 'lte') return 'on or before';
  return labels[op];
}
function conditions(field:Field):FilterOp[] {
  if(field.kind==='text')return ['in','eq','neq','contains','not_contains','blank'];
  if(temporal(field))return ['in','eq','neq','gte','lte','relative','blank'];
  return ['in','eq','neq','gte','lte','blank'];
}
function isPeriod(value:ReportFilter['value']):value is RelativePeriod {
  return typeof value==='object' && !Array.isArray(value);
}
function allowsMultiple(op:FilterOp) {return op==='in' || op==='neq';}
function selectedValues(value:ReportFilter['value']|undefined) {
  return Array.isArray(value)?value:typeof value==='string' && value?[value]:[];
}
function describe(rule:ReportFilter,field:Field) {
  const value=rule.value;
  if(isPeriod(value))return (value.direction==='last'?'Last':'Next')+' '+value.amount+' '+(value.amount===1?value.unit.slice(0,-1):value.unit);
  return [label(rule.op,field),Array.isArray(value)?value.join(', '):value,rule.caseSensitive?'· Match case':''].filter(Boolean).join(' ');
}
function changeCondition(rule:ReportFilter,op:FilterOp):ReportFilter {
  const selected=selectedValues(rule.value);
  const next=op==='relative'?defaultPeriod:op==='blank'?'':allowsMultiple(op)?selected:selected[0]??'';
  return {field:rule.field,enabled:rule.enabled,op,value:next,...(rule.caseSensitive && op!=='blank'?{caseSensitive:true}:{})};
}
export type FilterEditor = {index:number;rule:ReportFilter;moveField?:string;overlapField?:string}|null;
interface Props { fields:Field[]; entities:Catalog['entities']; rules:ReportFilter[]; lookup:ReportClient['values']; onChange(rules:ReportFilter[]):void;
  columnNames?:ColumnNames; rename(field:Field,name:string):void;
  drop:DropField; onInteraction(field:string|null):void; onPreviewHover(active:boolean):void; outputFields:string[]; incomingColumn?:string;
  editor:FilterEditor;setEditor(value:FilterEditor):void;onAdd:React.MouseEventHandler<HTMLButtonElement>;showDropTarget:boolean;disclosure:CardDisclosure }
export function FiltersPanel({fields,entities,rules,onChange,lookup,editor,setEditor,onAdd,showDropTarget,disclosure,columnNames,rename,
  drop,onInteraction,onPreviewHover,outputFields,incomingColumn}:Props) {
  const editing = editor && fields.find(f=>f.id===editor.rule.field);
  const {begin,moved}=useFieldDrag(drop,'filters',onInteraction,onPreviewHover);
  const blocked=(field:Field)=>outputFields.includes(field.id) && editor?.overlapField!==field.id &&
    !rules.some(rule=>rule.field===field.id);
  const canReceive=!editor && (rules.length<32 || rules.some(rule=>rule.field===incomingColumn));
  const addButton=useRef<HTMLButtonElement>(null);
  const formRef=useRef<HTMLFormElement>(null);
  const editorIndex=editor?.index;
  const editorField=editor?.rule.field;
  const editorCondition=editor?.rule.op;
  useLayoutEffect(()=>{
    if(disclosure.expanded && editorIndex!==undefined){
      formRef.current?.querySelector<HTMLSelectElement>('select:not(:disabled)')?.focus({preventScroll:true});
    }
  },[disclosure.expanded,editorIndex]);
  useLayoutEffect(()=>{
    if(!disclosure.expanded || editorIndex===undefined)return;
    const card=formRef.current?.closest<HTMLElement>('.query-card');
    const query=card?.closest<HTMLElement>('.query-scroll');
    if(!card || !query)return;
    if(getComputedStyle(query).overflowY==='visible'){
      card.scrollIntoView({block:'nearest'});
      return;
    }
    const viewport=query.getBoundingClientRect();
    const bounds=card.getBoundingClientRect();
    const padding=parseFloat(getComputedStyle(query).paddingTop);
    if(bounds.top<viewport.top || bounds.bottom>viewport.bottom){
      query.scrollTop+=bounds.top-viewport.top-padding;
    }
  },[disclosure.expanded,editorIndex,editorField,editorCondition]);
  const value=editor?.rule.value;
  const relative=value!==undefined && isPeriod(value)?value:null;
  const selected=selectedValues(value);
  const valid=relative?Number.isInteger(relative.amount) && relative.amount>=1 && relative.amount<=365:
    selected.length>0;
  const canApply=!!editor && !!editing && (!!editor.moveField || !blocked(editing)) && (editor.rule.op==='blank' || valid);
  function updateRule(rule:ReportFilter) {if(editor)setEditor({...editor,rule});}
  function closeEditor() {
    setEditor(null);
    requestAnimationFrame(()=>addButton.current?.focus({preventScroll:true}));
  }
  function commit(e:React.FormEvent) {
    e.preventDefault();
    if(!editor || !canApply)return;
    const next = rules.slice();
    const value=editor.rule.value;
    next[editor.index] = {...editor.rule,value:editor.rule.op==='blank'?'':typeof value==='string'?value.trim():value};
    onChange(next);closeEditor();
  }
  return <QueryCard title="Filters" icon="filter" className="filters" dropZone={canReceive?'filters':undefined}
    showDropTarget={showDropTarget} disclosure={disclosure} help={filtersHelp}
    status={editor && !disclosure.expanded && !showDropTarget?'Filter draft':undefined}>
    {editor ? <form id="filter-editor" ref={formRef} className="filter-editor" onSubmit={commit}>
      <h5>{editor.index<rules.length?'Edit Filter':'New Filter'}</h5>
      {editor.moveField && <p className="hint">Apply the filter to finish the move. Cancel to restore the column.</p>}
      <div className="filter-editor-selects">
        <div className="filter-control"><label htmlFor="filter-field">Field</label>
          <select id="filter-field" required disabled={Boolean(editor.moveField)} value={editor.rule.field} title={editing?sourceColumn(editing,entities):undefined}
            onChange={e=>updateRule(newFilterRule(fields.find(field=>field.id===e.target.value),editor.rule.enabled))}>
            <option value="" disabled>Choose a field</option>
            <FieldOptions fields={fields} entities={entities} columnNames={columnNames} disabled={blocked}/>
          </select>
        </div>
        <div className="filter-control"><label htmlFor="filter-condition">Condition</label>
          <select id="filter-condition" disabled={!editing} value={editing?editor.rule.op:''}
            onChange={e=>updateRule(changeCondition(editor.rule,e.target.value as FilterOp))}>
            {editing?conditions(editing).map(op=><option key={op} value={op}>{label(op,editing)}</option>):
              <option value="">Choose a condition</option>}
          </select>
        </div>
      </div>
      {editing && <>
        {editor.rule.op!=='blank' && editor.rule.op!=='relative' && <ValuePicker key={editing.id} field={editing} lookup={lookup}
          selected={selected} multiple={allowsMultiple(editor.rule.op)} caseSensitive={editor.rule.caseSensitive}
          change={values=>updateRule({...editor.rule,value:allowsMultiple(editor.rule.op)?values:values[0]??''})}/>}
        {editor.rule.op==='relative' && relative && <div className="relative-period">
          <div className="filter-control period-direction"><label htmlFor="relative-direction">Direction</label>
            <select id="relative-direction" value={relative.direction}
              onChange={e=>updateRule({...editor.rule,value:{...relative,direction:e.target.value as RelativePeriod['direction']}})}>
              <option value="last">Last</option><option value="next">Next</option>
            </select>
          </div>
          <label className="filter-control">Amount<input type="number" min={1} max={365} required value={relative.amount || ''}
            onChange={e=>updateRule({...editor.rule,value:{...relative,amount:Number(e.target.value)}})}/></label>
          <div className="filter-control"><label htmlFor="relative-unit">Unit</label>
            <select id="relative-unit" value={relative.unit}
              onChange={e=>updateRule({...editor.rule,value:{...relative,unit:e.target.value as RelativePeriod['unit']}})}>
              {editing.kind==='datetime' && <option value="hours">Hours</option>}
              <option value="days">Days</option><option value="weeks">Weeks</option>
            </select>
          </div>
          <p className="hint">{relative.unit==='hours'?'Counts from the current local time.':'Includes today. Weeks count as seven days.'}</p>
        </div>}
        {editing.kind==='text' && editor.rule.op!=='blank' && <label className="filter-case">
          <input type="checkbox" checked={editor.rule.caseSensitive??false}
            onChange={e=>updateRule({...editor.rule,caseSensitive:e.target.checked || undefined})}/>Match case
        </label>}
      </>}
      <div className="filter-buttons">
        <button type="button" className="secondary-btn" onClick={closeEditor}>Cancel</button>
        <button type="submit" className="primary-btn" disabled={!canApply}>Apply filter</button>
      </div>
    </form> : <div className="filter-overview">
      {rules.length>0 && <ul className="filter-list" aria-label="Filter rules">{rules.map((r,i)=>{
        const f=fields.find(field=>field.id===r.field)!;
        const name=columnNames?.[f.id]??f.label;
        return <li key={i} className={'filter-rule-grid'+(!r.enabled?' rule-off':'')}>
          <button type="button" className="filter-move" aria-label={'Move '+name+' to Columns'} aria-keyshortcuts="Shift+ArrowUp"
            title="Drag to Columns or press Shift+Up" onPointerDown={e=>begin(e,f.id)}
            onKeyDown={e=>{
              if(e.shiftKey && e.key==='ArrowUp'){e.preventDefault();drop(f.id,'fields','filters');}
            }}
            onClick={e=>{if(e.detail===0)drop(f.id,'fields','filters');}}><Icon name="grip" size={14}/></button>
          <div className="filter-content">
            <div className="filter-name" id={'filter-name-'+i}>
              <EditableColumnName name={name} source={sourceColumn(f,entities)} onRename={next=>rename(f,next)}
                dragged={moved} onPointerDown={e=>begin(e,f.id)}/>
            </div>
            <button type="button" className="filter-condition" aria-label={'Edit filter '+(i+1)} aria-describedby={'filter-name-'+i}
              title={sourceColumn(f,entities)} onPointerDown={e=>begin(e,f.id)} onClick={e=>{
                if(moved.current && e.detail>0){moved.current=false;return;}
                setEditor({index:i,rule:{...r}});
              }}>{describe(r,f)}</button>
          </div>
          <button type="button" role="switch" className="switch" aria-checked={r.enabled}
            aria-label={'Enable filter '+(i+1)+' on '+name}
            onClick={()=>onChange(rules.map((x,j)=>j===i?{...x,enabled:!x.enabled}:x))}><span/></button>
          <button type="button" className="remove-rule" aria-label={'Remove filter '+(i+1)} onClick={()=>onChange(rules.filter((_,j)=>j!==i))}><Icon name="close" size={14}/></button>
        </li>;
      })}</ul>}
      <button ref={addButton} type="button" className="query-add" aria-controls="library-contents" disabled={rules.length>=32} onClick={onAdd}>
        <Icon name="plus" size={14}/>Add filter{showDropTarget && <span className="hint" aria-hidden="true">Drop a field here</span>}
      </button>
    </div>}
  </QueryCard>;
}
