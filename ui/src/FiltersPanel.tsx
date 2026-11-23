import React from 'react';
import {Catalog,Field,FilterOp,RelativePeriod,ReportClient,ReportFilter} from './client';
import {FieldOptions} from './FieldOptions';
import {Icon} from './Icon';
import {ValuePicker} from './ValuePicker';
import {QueryCard} from './QueryCard';

const labels:Record<FilterOp,string> = {in:'is any of',eq:'equals',contains:'contains',gte:'at least',lte:'at most',blank:'is blank',relative:'relative to now'};
const defaultPeriod:RelativePeriod={direction:'last',amount:7,unit:'days'};
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
  editor:FilterEditor;setEditor(value:FilterEditor):void;start(field:string):void }
export function FiltersPanel({fields,entities,rules,onChange,lookup,editor,setEditor,start}:Props) {
  const enabled = rules.filter(r => r.enabled).length;
  const all = rules.length>0 && enabled === rules.length;
  const editing = editor && fields.find(f=>f.id===editor.rule.field);
  const value=editor?.rule.value;
  const relative=value!==undefined && isPeriod(value)?value:null;
  const valid=relative?Number.isInteger(relative.amount) && relative.amount>=1 && relative.amount<=365:
    (Array.isArray(value)?value.length:typeof value==='string' && Boolean(value.trim()));
  function updateRule(rule:ReportFilter) {if(editor)setEditor({...editor,rule});}
  function commit(e:React.FormEvent) {
    e.preventDefault();
    if (!editor || (editor.rule.op!=='blank' && !valid)) return;
    const next = rules.slice();
    const value=editor.rule.value;
    next[editor.index] = {...editor.rule,value:editor.rule.op==='blank'?'':typeof value==='string'?value.trim():value};
    onChange(next); setEditor(null);
  }
  return <QueryCard title="Filters" icon="filter" className="filters" dropZone={!editor && rules.length<32?'filters':undefined}
    actions={rules.length>0 && <div className="filter-status">
        <span className="count">{enabled} of {rules.length} active</span>
        <button type="button" className="text-action" disabled={!!editor}
          onClick={()=>onChange(rules.map(r=>({...r,enabled:!all})))}>{all?'Disable all':'Enable all'}</button>
      </div>}>
    <div className="configuration-scroll" tabIndex={0} role="group" aria-label="Filter rules">
    <ul className="filter-list">{rules.map((r,i)=>{
      const f=fields.find(field=>field.id===r.field)!;
      return <li key={i} className={!r.enabled?'rule-off':''}>
        <button type="button" role="switch" className="switch" aria-checked={r.enabled}
          aria-label={'Enable filter '+(i+1)+' on '+f.label} disabled={!!editor}
          onClick={()=>onChange(rules.map((x,j)=>j===i?{...x,enabled:!x.enabled}:x))}><span/></button>
        <button className="filter-content" disabled={!!editor} aria-label={'Edit filter '+(i+1)}
          onClick={()=>setEditor({index:i,rule:{...r}})}><strong>{f.label}</strong><span>{describe(r,f)}</span></button>
        <button className="remove-rule" aria-label={'Remove filter '+(i+1)} disabled={!!editor} onClick={()=>onChange(rules.filter((_,j)=>j!==i))}><Icon name="close" size={14}/></button>
      </li>;
    })}</ul>
    {editor && editing && <form id="filter-editor" className="filter-editor" onSubmit={commit}>
      <div><label htmlFor="filter-field">Field</label>
        <select id="filter-field" autoFocus value={editing.id}
          onChange={e=>updateRule({field:e.target.value,op:'in',value:[],enabled:editor.rule.enabled})}>
          <FieldOptions fields={fields} entities={entities}/>
        </select>
      </div>
      <div><label htmlFor="filter-condition">Condition</label>
        <select id="filter-condition" value={editor.rule.op} onChange={e=>updateRule(changeCondition(editor.rule,e.target.value as FilterOp))}>
          {conditions(editing).map(op=><option key={op} value={op}>{label(op,editing)}</option>)}
        </select>
      </div>
      {editing.kind==='text' && editor.rule.op!=='blank' && <label className="filter-case">
        <input type="checkbox" checked={editor.rule.caseSensitive??false}
          onChange={e=>updateRule({...editor.rule,caseSensitive:e.target.checked || undefined})}/>Match case
      </label>}
      {editor.rule.op==='in' && Array.isArray(value) && <ValuePicker key={editing.id} field={editing} lookup={lookup} selected={value}
        caseSensitive={editor.rule.caseSensitive} change={value=>updateRule({...editor.rule,value})}/>}
      {editor.rule.op!=='blank' && editor.rule.op!=='in' && typeof value==='string' && <label className="filter-value">
        {editing.kind==='datetime'?'Date and time':editing.kind==='date'?'Date':'Value'}
        <input required maxLength={160} type={editing.kind==='datetime'?'datetime-local':editing.kind==='date'?'date':'text'}
          step={editing.kind==='datetime'?'any':undefined}
          pattern={editing.measure?'[+\\-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)':undefined} inputMode={editing.measure?'decimal':undefined}
          value={editing.kind==='datetime'?value.replace(' ','T'):value} onChange={e=>updateRule({...editor.rule,value:e.target.value})}/>
      </label>}
      {editor.rule.op==='relative' && relative && <div className="relative-period">
        <div><label htmlFor="relative-direction">Direction</label>
          <select id="relative-direction" value={relative.direction}
            onChange={e=>updateRule({...editor.rule,value:{...relative,direction:e.target.value as RelativePeriod['direction']}})}>
            <option value="last">Last</option><option value="next">Next</option>
          </select>
        </div>
        <label>Amount<input type="number" min={1} max={365} required value={relative.amount || ''}
          onChange={e=>updateRule({...editor.rule,value:{...relative,amount:Number(e.target.value)}})}/></label>
        <div><label htmlFor="relative-unit">Unit</label>
          <select id="relative-unit" value={relative.unit}
            onChange={e=>updateRule({...editor.rule,value:{...relative,unit:e.target.value as RelativePeriod['unit']}})}>
            {editing.kind==='datetime' && <option value="hours">Hours</option>}
            <option value="days">Days</option><option value="weeks">Weeks</option>
          </select>
        </div>
        <p className="hint">{relative.unit==='hours'?'Counts from the current local time.':'Includes today. Weeks count as seven days.'}</p>
      </div>}
    </form>}
    </div>
    {editor ? <div className="filter-bottom filter-buttons"><button type="button" className="quiet-btn" onClick={()=>setEditor(null)}>Cancel</button>
      <button type="submit" form="filter-editor" className="run-button" disabled={editor.rule.op!=='blank' && !valid}>Apply filter</button></div>
    : <div className="filter-bottom"><button className="add-filter" aria-label="Add filter" disabled={rules.length>=32} onClick={()=>start('customer.shippingstate')}>
      <Icon name="plus" size={14}/>Add filter<span className="hint" aria-hidden="true">Drop a field here</span></button>
      {rules.length>1 && <span className="hint">Match all enabled filters</span>}</div>}
  </QueryCard>;
}
