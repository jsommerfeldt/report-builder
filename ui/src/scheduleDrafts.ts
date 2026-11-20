export type Cadence = 'once'|'daily'|'weekly'|'monthly';
export const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
export interface ScheduleDraft {
  version:1;
  timing: {cadence:'once';date:string}|{cadence:'daily'}|
          {cadence:'weekly';days:string[]}|{cadence:'monthly';day:number};
  time:string; timeZone:string;
  recipients:{to:string[];cc:string[];bcc:string[]};
}

// A delivery service can implement this interface without changing the schedule editor.
export interface ScheduleDraftStore {
  load(reportId:string):Promise<ScheduleDraft|null>;
  save(reportId:string,draft:ScheduleDraft):Promise<void>;
  remove(reportId:string):Promise<void>;
}
const storageKey=(id:string)=>'rdw.report-builder.schedule.v1.'+id;
export const browserScheduleDrafts:ScheduleDraftStore={
  async load(id) {
    const raw=localStorage.getItem(storageKey(id));
    if(raw===null)return null;
    const draft=JSON.parse(raw);
    if(draft?.version!==1 || !draft.timing || !['once','daily','weekly','monthly'].includes(draft.timing.cadence) ||
       typeof draft.time!=='string' || typeof draft.timeZone!=='string' ||
       !['to','cc','bcc'].every(k=>Array.isArray(draft.recipients?.[k]) && draft.recipients[k].every((x:unknown)=>typeof x==='string')) ||
       (draft.timing.cadence==='weekly' && !Array.isArray(draft.timing.days)))throw new Error('This schedule draft could not be read.');
    return draft;
  },
  async save(id,draft){localStorage.setItem(storageKey(id),JSON.stringify(draft));},
  async remove(id){localStorage.removeItem(storageKey(id));},
};

export function parseRecipients(to:string,cc:string,bcc:string):ScheduleDraft['recipients'] {
  const used=new Set<string>();
  function addresses(raw:string,label:string) {
    const result:string[]=[];
    const here=new Set<string>();
    for(const value of raw.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean)) {
      const key=value.toLowerCase();
      if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u.test(value) || value.length>254)
        throw new Error('Check the email address “'+value+'” in '+label+'.');
      if(here.has(key))continue;
      if(used.has(key))throw new Error('Put “'+value+'” in only one recipient list.');
      result.push(value);here.add(key);used.add(key);
    }
    return result;
  }
  const recipients={to:addresses(to,'To'),cc:addresses(cc,'Cc'),bcc:addresses(bcc,'Bcc')};
  if(!recipients.to.length)throw new Error('Add at least one address in To.');
  return recipients;
}
