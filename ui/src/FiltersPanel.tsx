import React, {useRef} from 'react';
import {Catalog,Field,FilterOp,RelativePeriod,ReportClient,ReportFilter} from './client';
import {FieldOptions} from './FieldOptions';
import {Icon} from './Icon';
import {ValuePicker} from './ValuePicker';
import {CardDisclosure,QueryCard} from './QueryCard';
import {filtersHelp} from './QueryHelp';

const labels:Record<FilterOp,string> = {in:'is any of',eq:'equals',contains:'contains',gte:'at least',lte:'at most',blank:'is blank',relative:'relative to now'};
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
  if(field.kind==='text')return ['in','eq','contains','blank'];
  if(temporal(field))return ['in','eq','gte','lte','relative','blank'];
  return ['in','eq','gte','lte','blank'];
}
function isPeriod(value:ReportFilter['value']):value is RelativePeriod {
  return typeof value==='object' && !Array.isArray(value);
}
function describe(rule:ReportFilter,field:Field) {
  const value=rule.value;
  if(isPeriod(value))return (value.direction==='last'?'Last':'Next')+' '+value.amount+' '+(value.amount===1?value.unit.slice(0,-1):value.unit);
  return [label(rule.op,field),Array.isArray(value)?value.join(', '):value,rule.caseSensitive?'· Match case':''].filter(Boolean).join(' ');
}
function changeCondition(rule:ReportFilter,op:FilterOp):ReportFilter {
  const old=rule.value;
  const value=isPeriod(old)?'':old;
  const next=op==='relative'?defaultPeriod:op==='blank'?'':op==='in'?(Array.isArray(value)?value:value?[value]:[]):
    (Array.isArray(value)?value[0]??'':value);
  return {field:rule.field,enabled:rule.enabled,op,value:next,...(rule.caseSensitive && op!=='blank'?{caseSensitive:true}:{})};
}
export type FilterEditor = {index:number;rule:ReportFilter}|null;
interface Props { fields:Field[]; entities:Catalog['entities']; rules:ReportFilter[]; lookup:ReportClient['values']; onChange(rules:ReportFilter[]):void;
  editor:FilterEditor;setEditor(value:FilterEditor):void;start():void;showDropTarget:boolean;disclosure:CardDisclosure }
export function FiltersPanel({fields,entities,rules,onChange,lookup,editor,setEditor,start,showDropTarget,disclosure}:Props) {
  const enabled = rules.filter(r => r.enabled).length;
  const all = rules.length>0 && enabled === rules.length;
  const editing = editor && fields.find(f=>f.id===editor.rule.field);
  const addButton=useRef<HTMLButtonElement>(null);
  const value=editor?.rule.value;
  const relative=value!==undefined && isPeriod(value)?value:null;
  const valid=relative?Number.isInteger(relative.amount) && relative.amount>=1 && relative.amount<=365:
    (Array.isArray(value)?value.length:typeof value==='string' && Boolean(value.trim()));
  function updateRule(rule:ReportFilter) {if(editor)setEditor({...editor,rule});}
  function closeEditor() {
    setEditor(null);
    requestAnimationFrame(()=>addButton.current?.focus({preventScroll:true}));
  }
  function commit(e:React.FormEvent) {
    e.preventDefault();
    if (!editor || !editing || (editor.rule.op!=='blank' && !valid)) return;
    const next = rules.slice();
    const value=editor.rule.value;
    next[editor.index] = {...editor.rule,value:editor.rule.op==='blank'?'':typeof value==='string'?value.trim():value};
    onChange(next);closeEditor();
  }
  return <QueryCard title="Filters" icon="filter" className="filters" dropZone={!editor && rules.length<32?'filters':undefined}
    showDropTarget={showDropTarget} disclosure={disclosure} help={filtersHelp}
    actions={editor?(!disclosure.expanded && !showDropTarget && <span className="count">Filter draft</span>):
      <span className="count" aria-label={!rules.length?'No active filters':undefined}>
        {rules.length?enabled+' of '+rules.length+' active':0}
      </span>}>
    {editor ? <form id="filter-editor" className="filter-editor" onSubmit={commit}>
      <h5>{editor.index<rules.length?'Edit Filter':'New Filter'}</h5>
      <div className="filter-control"><label htmlFor="filter-field">Field</label>
        <select id="filter-field" autoFocus required value={editor.rule.field}
          onChange={e=>updateRule(newFilterRule(fields.find(field=>field.id===e.target.value),editor.rule.enabled))}>
          <option value="" disabled>Choose a field</option>
          <FieldOptions fields={fields} entities={entities}/>
        </select>
      </div>
      {editing && <>
        <div className="filter-control"><label htmlFor="filter-condition">Condition</label>
          <select id="filter-condition" value={editor.rule.op} onChange={e=>updateRule(changeCondition(editor.rule,e.target.value as FilterOp))}>
            {conditions(editing).map(op=><option key={op} value={op}>{label(op,editing)}</option>)}
          </select>
        </div>
        {editor.rule.op==='in' && Array.isArray(value) && <ValuePicker key={editing.id} field={editing} lookup={lookup} selected={value}
          caseSensitive={editor.rule.caseSensitive} change={value=>updateRule({...editor.rule,value})}/>}
        {editor.rule.op!=='blank' && editor.rule.op!=='in' && typeof value==='string' && <label className="filter-control">
          {editing.kind==='datetime'?'Date and time':editing.kind==='date'?'Date':'Value'}
          <input required maxLength={160} type={editing.kind==='datetime'?'datetime-local':editing.kind==='date'?'date':'text'}
            step={editing.kind==='datetime'?'any':undefined}
            pattern={editing.measure?'[+\\-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)':undefined} inputMode={editing.measure?'decimal':undefined}
            value={editing.kind==='datetime'?value.replace(' ','T'):value} onChange={e=>updateRule({...editor.rule,value:e.target.value})}/>
        </label>}
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
        <button type="submit" className="primary-btn" disabled={!editing || (editor.rule.op!=='blank' && !valid)}>Apply filter</button>
      </div>
    </form> : <div className="filter-overview">
      {rules.length>1 && <button type="button" className="text-action filter-bulk"
        onClick={()=>onChange(rules.map(r=>({...r,enabled:!all})))}>{all?'Disable all':'Enable all'}</button>}
      {rules.length>0 && <ul className="filter-list" aria-label="Filter rules">{rules.map((r,i)=>{
        const f=fields.find(field=>field.id===r.field)!;
        return <li key={i} className={'filter-rule-grid'+(!r.enabled?' rule-off':'')}>
          <button type="button" className="filter-content" aria-label={'Edit filter '+(i+1)} title={'Edit '+f.label+' filter'}
            onClick={()=>setEditor({index:i,rule:{...r}})}><strong className="filter-name">{f.label}<Icon name="edit" size={12}/></strong>
            <span>{describe(r,f)}</span></button>
          <button type="button" role="switch" className="switch" aria-checked={r.enabled}
            aria-label={'Enable filter '+(i+1)+' on '+f.label}
            onClick={()=>onChange(rules.map((x,j)=>j===i?{...x,enabled:!x.enabled}:x))}><span/></button>
          <button type="button" className="remove-rule" aria-label={'Remove filter '+(i+1)} onClick={()=>onChange(rules.filter((_,j)=>j!==i))}><Icon name="close" size={14}/></button>
        </li>;
      })}</ul>}
      <button ref={addButton} type="button" className="add-filter" disabled={rules.length>=32} onClick={()=>start()}>
        <Icon name="plus" size={14}/>Add filter{showDropTarget && <span className="hint" aria-hidden="true">Drop a field here</span>}
      </button>
    </div>}
  </QueryCard>;
}
