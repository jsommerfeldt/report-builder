import React, {useEffect, useState} from 'react';
import {Field, ReportClient} from './client';
import {Icon} from './Icon';

interface Props {field:Field; selected:string[]; change(values:string[]):void; lookup:ReportClient['values']}
export function ValuePicker({field,selected,change,lookup}:Props) {
  const [query,setQuery]=useState('');
  const [offset,setOffset]=useState(0);
  const [options,setOptions]=useState<string[]>([]);
  const [total,setTotal]=useState(0);
  const [progress,setProgress]=useState('Searching…');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let current=true;
    setProgress('Searching…');
    const timer=window.setTimeout(()=>{
      lookup(field.id,query,offset).then(page=>{
        if(!current)return;
        setOptions(prev=>offset===0?page.values:[...prev,...page.values]);
        setTotal(page.total);setProgress('');
      }).catch(()=>{if(current)setProgress('Could not load values.');});
    },100);
    return ()=>{current=false;window.clearTimeout(timer);};
  },[field.id,query,offset,lookup,retry]);
  const text=query.trim();
  const contains=(list:string[],v:string)=>list.some(x=>x.toLowerCase()===v.toLowerCase());
  const valid=field.measure ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) :
    field.kind==='date' ? /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0,10)===text : !!text;
  function toggle(v:string) {
    change(contains(selected,v)?selected.filter(x=>x.toLowerCase()!==v.toLowerCase()):[...selected,v]);
  }
  function search(value:string) {setQuery(value);setOffset(0);setOptions([]);setTotal(0);}
  const custom=valid && !contains(selected,text) && !contains(options,text) && selected.length<256;
  return <div className="value-picker">
    <label>Search or enter a value<input type="search" maxLength={160} value={query} placeholder={'Search '+field.label.toLowerCase()}
      onChange={e=>search(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(custom){toggle(text);search('');}}}}/></label>
    {custom && <button className="text-action custom-value" type="button" onClick={()=>{toggle(text);search('');}}>Use “{text}”</button>}
    <div className="value-options" aria-label="Available values">{options.map(v=><label key={v}>
      <input type="checkbox" checked={contains(selected,v)} disabled={!contains(selected,v)&&selected.length>=256} onChange={()=>toggle(v)}/>{v}</label>)}
      {progress && <span role="status">{progress}</span>}
      {progress==='Could not load values.' && <button type="button" className="text-action" onClick={()=>setRetry(retry+1)}>Retry</button>}
      {!progress && !options.length && <span>No matching values in this snapshot.</span>}
      {!progress && options.length<total && <button type="button" className="text-action" onClick={()=>setOffset(options.length)}>Show more values</button>}
    </div>
    {selected.length>0 && <div className="picked-values" aria-label="Chosen values">{selected.map(v=><button type="button" key={v} aria-label={'Remove value '+v}
      onClick={()=>toggle(v)}>{v}<Icon name="close" size={11}/></button>)}</div>}
  </div>;
}
