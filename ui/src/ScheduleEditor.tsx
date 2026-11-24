import React,{useEffect,useState} from 'react';
import {Modal} from './Modal';
import {Cadence,parseRecipients,ScheduleDraft,ScheduleDraftStore,weekdays} from './scheduleDrafts';

interface Props {report:{id:string;name:string}; store:ScheduleDraftStore; close():void; onChange(message:string):void}
const zoneHere=()=>Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
const zones=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','UTC'];
export function ScheduleEditor(props:Props) {
  const [draft,setDraft]=useState<ScheduleDraft|null|undefined>(undefined);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    props.store.load(props.report.id).then(value=>{if(active)setDraft(value);},
      ()=>{if(active)setError('The schedule draft could not be opened. Check that browser storage is available.');});
    return ()=>{active=false;};
  },[props.report.id,props.store]);
  if(draft===undefined)return <Modal title="Schedule dataset" close={props.close}>
    <p className="modal-note" role={error?'alert':'status'}>{error || 'Opening schedule…'}</p></Modal>;
  return <ScheduleForm {...props} initial={draft}/>;
}

function ScheduleForm({report,store,initial,close,onChange}:Props & {initial:ScheduleDraft|null}) {
  const timing=initial?.timing;
  const [cadence,setCadence]=useState<Cadence>(timing?.cadence??'weekly');
  const [time,setTime]=useState(initial?.time??'08:00');
  const [zone,setZone]=useState(initial?.timeZone??zoneHere());
  const [days,setDays]=useState<string[]>(timing?.cadence==='weekly'?timing.days:['Mon']);
  const [date,setDate]=useState(timing?.cadence==='once'?timing.date:'');
  const [monthDay,setMonthDay]=useState(timing?.cadence==='monthly'?timing.day:1);
  const [addresses,setAddresses]=useState({to:initial?.recipients.to.join(', ')??'',cc:initial?.recipients.cc.join(', ')??'',bcc:initial?.recipients.bcc.join(', ')??''});
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [removing,setRemoving]=useState(false);
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError('');
    try {
      const recipients=parseRecipients(addresses.to,addresses.cc,addresses.bcc);
      let timeZone:string;
      try{timeZone=new Intl.DateTimeFormat('en',{timeZone:zone.trim()}).resolvedOptions().timeZone;}
      catch{throw new Error('Choose a time zone from the list or enter an IANA time zone.');}
      if(cadence==='weekly' && !days.length)throw new Error('Choose at least one weekday.');
      const timing:ScheduleDraft['timing']=cadence==='weekly'?{cadence,days:weekdays.filter(day=>days.includes(day))}:
        cadence==='monthly'?{cadence,day:monthDay}:cadence==='once'?{cadence,date}:{cadence};
      await store.save(report.id,{version:1,timing,time,timeZone,recipients});
      onChange('Schedule draft saved for '+report.name+'.');
    } catch(e){setError(e instanceof Error?e.message:'The schedule draft could not be saved.');setBusy(false);}
  }
  async function remove(){
    setBusy(true);setError('');
    try{await store.remove(report.id);onChange('Schedule draft removed.');}
    catch{setError('The schedule draft could not be removed.');setRemoving(false);setBusy(false);}
  }
  return <Modal title={removing?'Remove schedule draft?':'Schedule dataset'} className="schedule-dialog" close={()=>{if(!busy)close();}}>
    <p className="dialog-subject">{report.name}</p>
    {removing?<><p className="modal-note">Remove the saved timing and recipients for this dataset?</p><footer>
      <button className="secondary-btn" onClick={()=>setRemoving(false)} disabled={busy}>Cancel</button>
      <button className="danger-btn" onClick={remove} disabled={busy}>Remove draft</button></footer></>:
    <form onSubmit={save}>
      <fieldset className="schedule-block"><legend>Timing</legend>
        <div className="schedule-grid"><label>Repeat<select value={cadence} onChange={e=>setCadence(e.target.value as Cadence)}>
          <option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select></label><label>Time<input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div>
        {cadence==='weekly' && <div className="weekday-picker" role="group" aria-label="Weekdays">{weekdays.map(day=>
          <button key={day} type="button" aria-pressed={days.includes(day)} onClick={()=>setDays(current=>current.includes(day)?current.filter(d=>d!==day):[...current,day])}>{day}</button>)}</div>}
        {cadence==='once' && <label>Date<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>}
        {cadence==='monthly' && <><label>Day of month<select value={monthDay} aria-describedby={monthDay>28?'short-months':undefined} onChange={e=>setMonthDay(Number(e.target.value))}>
          {Array.from({length:31},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label>
          {monthDay>28 && <small id="short-months">Months without day {monthDay} are skipped.</small>}</>}
        <label>Time zone<input required list="schedule-zones" value={zone} onChange={e=>setZone(e.target.value)}/></label>
        <datalist id="schedule-zones">{[...new Set([zoneHere(),...zones])].map(z=><option key={z} value={z}/>)}</datalist>
      </fieldset>
      <fieldset className="schedule-block recipients"><legend>Recipients</legend>
        <p id="address-hint">Separate email addresses with commas or line breaks.</p>
        {(['to','cc','bcc'] as const).map((key,i)=><div key={key} className="recipient-line"><label htmlFor={'recipient-'+key}>{['To','Cc','Bcc'][i]}</label>
          <textarea id={'recipient-'+key} rows={1} autoComplete="off" spellCheck={false} aria-describedby="address-hint"
            required={key==='to'} placeholder={key==='to'?'name@example.com':'Optional'}
            value={addresses[key]} onChange={e=>setAddresses({...addresses,[key]:e.target.value})}/></div>)}
      </fieldset>
      {error && <p className="alert" role="alert">{error}</p>}
      <p className="draft-note">Drafts are saved in this browser. Email delivery is inactive.</p>
      <footer>{initial && <button className="text-danger" type="button" disabled={busy} onClick={()=>setRemoving(true)}>Remove draft</button>}
        <button className="secondary-btn" type="button" onClick={close} disabled={busy}>Cancel</button>
        <button className="primary-btn" type="submit" disabled={busy}>{busy?'Saving…':'Save draft'}</button></footer>
    </form>}
  </Modal>;
}
