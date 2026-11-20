import React from 'react';
import {Catalog,Field, FilterOp, ReportClient, ReportFilter} from './client';
import {FieldOptions} from './FieldOptions';
import {Icon} from './Icon';
import {ValuePicker} from './ValuePicker';

const labels: Record<FilterOp,string> = {in:'is any of',eq:'equals', contains:'contains', gte:'at least', lte:'at most', blank:'is blank'};
function label(op:FilterOp, field:Field) {
  if (field.kind === 'date' && op === 'gte') return 'on or after';
  if (field.kind === 'date' && op === 'lte') return 'on or before';
  return labels[op];
}
export type FilterEditor = {index:number;rule:ReportFilter}|null;
interface Props { fields:Field[]; entities:Catalog['entities']; rules:ReportFilter[]; lookup:ReportClient['values']; onChange(rules:ReportFilter[]):void;
  editor:FilterEditor;setEditor(value:FilterEditor):void;start(field:string):void }
export function FiltersPanel({fields,entities,rules,onChange,lookup,editor,setEditor,start}:Props) {
  const enabled = rules.filter(r => r.enabled).length;
  const all = rules.length>0 && enabled === rules.length;
  const editing = editor && fields.find(f=>f.id===editor.rule.field)!;
  function commit(e:React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const next = rules.slice();
    const value=editor.rule.value;
    next[editor.index] = {...editor.rule, value:editor.rule.op==='blank' ? '' : Array.isArray(value)?value:value.trim()};
    onChange(next); setEditor(null);
  }
  return <section className="panel filters" aria-label="Filters" data-library-zone={!editor && rules.length<32?'filters':undefined}>
    <div className="selection-head"><div className="panel-heading"><Icon name="fields"/><h2>Filters</h2><span className="count">{enabled}/{rules.length}</span></div>
      <button type="button" className="text-action" disabled={!rules.length || !!editor}
        onClick={()=>onChange(rules.map(r=>({...r,enabled:!all})))}>{all?'Deselect all':'Select all'}</button></div>
    <div className="configuration-scroll" tabIndex={0} role="group" aria-label="Filter rules">
    <ul className="filter-list">{rules.map((r,i)=>{
      const f=fields.find(field=>field.id===r.field)!;
      return <li key={i} className={!r.enabled?'rule-off':''}>
        <button type="button" role="switch" className="switch" aria-checked={r.enabled}
          aria-label={'Enable filter '+(i+1)+' on '+f.label} disabled={!!editor}
          onClick={()=>onChange(rules.map((x,j)=>j===i?{...x,enabled:!x.enabled}:x))}><span/></button>
        <button className="filter-content" disabled={!!editor} aria-label={'Edit filter '+(i+1)}
          onClick={()=>setEditor({index:i,rule:{...r}})}><strong>{f.label}</strong><span>{label(r.op,f)} {Array.isArray(r.value)?r.value.join(', '):r.value}</span></button>
        <button className="remove-rule" aria-label={'Remove filter '+(i+1)} disabled={!!editor} onClick={()=>onChange(rules.filter((_,j)=>j!==i))}><Icon name="close" size={14}/></button>
      </li>;
    })}</ul>
    {editor && editing && <form id="filter-editor" className="filter-editor" onSubmit={commit}>
      <label>Field<select autoFocus value={editing.id} onChange={e=>setEditor({...editor,rule:{...editor.rule,field:e.target.value,op:'in',value:[]}})}>
        <FieldOptions fields={fields} entities={entities}/></select></label>
      <label>Condition<select value={editor.rule.op} onChange={e=>{const op=e.target.value as FilterOp;const old=editor.rule.value;
        setEditor({...editor,rule:{...editor.rule,op,value:op==='in'?(Array.isArray(old)?old:old?[old]:[]):(Array.isArray(old)?old[0]??'':old)}});}}>
        {(editing.kind==='text' ? ['in','eq','contains','blank'] as const : ['in','eq','gte','lte','blank'] as const).map(op=><option key={op} value={op}>{label(op,editing)}</option>)}</select></label>
      {editor.rule.op==='in' && Array.isArray(editor.rule.value) && <ValuePicker key={editing.id} field={editing} lookup={lookup} selected={editor.rule.value}
        change={value=>setEditor({...editor,rule:{...editor.rule,value}})}/>}
      {editor.rule.op!=='blank' && editor.rule.op!=='in' && <label className="filter-value">Value<input required maxLength={160} type={editing.kind==='date'?'date':'text'}
        pattern={editing.measure?'[+\\-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)':undefined} inputMode={editing.measure?'decimal':undefined}
        value={editor.rule.value} onChange={e=>setEditor({...editor,rule:{...editor.rule,value:e.target.value}})}/></label>}
    </form>}
    </div>
    {editor ? <div className="filter-bottom filter-buttons"><button type="button" className="quiet-btn" onClick={()=>setEditor(null)}>Cancel</button>
      <button type="submit" form="filter-editor" className="run-button" disabled={editor.rule.op!=='blank' && !(Array.isArray(editor.rule.value)?editor.rule.value.length:editor.rule.value.trim())}>Apply filter</button></div>
    : <div className="filter-bottom"><button className="add-filter" disabled={rules.length>=32} onClick={()=>start('customer.shippingstate')}>
      <Icon name="plus" size={14}/>Add filter</button><span className="hint">{rules.length>1?'Match all enabled filters':'Drop a field here'}</span></div>}
  </section>;
}
