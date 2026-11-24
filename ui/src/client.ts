export type Entity = 'sales' | 'customer' | 'product' | 'trip' | 'warehouse';
export type Mode = 'summary' | 'detail';
export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last' | 'unique';
export type Aggregations = Partial<Record<string, Aggregation>>;
export type ColumnNames = Partial<Record<string,string>>;
export const aggregationLabels:Record<Aggregation,string>={
  sum:'Sum',avg:'Average',min:'Minimum',max:'Maximum',count:'Count',first:'First',last:'Last',unique:'Unique',
};
export type FilterOp = 'eq' | 'contains' | 'gte' | 'lte' | 'blank' | 'in' | 'relative';
export interface RelativePeriod {amount:number; unit:'hours'|'days'|'weeks'; direction:'last'|'next'}
export interface ReportFilter {
  field:string; op:FilterOp; value:string|string[]|RelativePeriod; enabled:boolean; caseSensitive?:boolean;
}
export interface Order {field:string; direction:'asc'|'desc'; enabled?:boolean; priority?:number}
export interface Definition {
  version:1|2; source:'sales'; mode:Mode; fields:string[]; filters?:ReportFilter[]; order?:Order[];
  groupBy?:string[];
  aggregations?:Partial<Record<string,Aggregation|'none'>>;
  columnNames?:ColumnNames;
}
export interface Field { id: string; entity: Entity; label: string; kind: 'currency' | 'quantity' | 'date' | 'datetime' | 'text'; measure: boolean }
export interface Catalog {
  entities: Record<Entity, string>; fields: Field[]; counts: Record<Entity, number>;
  scope: {company?: string; companies?: string[]; from: string; through: string}; starter: Definition;
}
export function sourceColumn(field:Field,entities:Catalog['entities']) {
  return entities[field.entity]+'.'+field.label;
}
export interface Preview { fields: string[]; rows: (string | null)[][]; total: number; limit: number; sourceRows: number; aggregations?:Aggregations; columnNames?:ColumnNames }
export interface SavedInfo { id: string; name: string; updated: string; revision: number; folderId?:string|null; deletedAt?:string }
export interface SavedReport extends SavedInfo { definition: Definition }
export type Overwrite = Pick<SavedInfo,'id'|'revision'>;
export type Collision = Overwrite & {name:string};
export interface Choices {values:string[]; total:number}
export interface ReportClient {
  values(field:string, query:string, offset:number, version?:Definition['version']):Promise<Choices>;
  preview(d: Definition): Promise<Preview>;
  list(): Promise<SavedInfo[]>;
  open(id: string): Promise<SavedReport>;
  save(name: string, d: Definition, existing: SavedInfo | null, overwrite?:Overwrite, folderId?:string|null): Promise<SavedReport>;
}
export class RequestError extends Error {
  constructor(public status: number, message: string, public overwriteTarget?:Collision) { super(message); }
}
export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api/' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new RequestError(res.status, payload.error || 'The request could not be completed.',payload.overwriteTarget);
  }
  return res.json();
}
export const pilotClient: ReportClient = {
  values: (field,query,offset,version) => request('values','POST',{field,query,offset,version}),
  preview: d => request('preview', 'POST', d),
  list: async () => (await request<{reports: SavedInfo[]}>('reports')).reports,
  open: id => request('reports/' + id),
  save: (name, definition, existing, overwrite, folderId) => existing
    ? request('reports/' + existing.id, 'PUT', {name, definition, revision: existing.revision,overwrite})
    : request('reports', 'POST', {name, definition,overwrite,folderId}),
};

export interface Folder {id:string; name:string; parentId:string|null; revision:number}
export interface Library {reports:SavedInfo[]; folders:Folder[]}
export interface LibraryClient {
  load():Promise<Library>;
  createFolder(name:string, parentId:string|null):Promise<Folder>;
  updateFolder(folder:Folder, name:string, parentId:string|null):Promise<Folder>;
  deleteFolder(folder:Folder):Promise<unknown>;
  move(report:SavedInfo, folderId:string|null):Promise<SavedInfo>;
  trash(report:SavedInfo):Promise<SavedInfo>;
  restore(report:SavedInfo):Promise<SavedInfo>;
  deleteTrashedReport(report:SavedInfo):Promise<{ok:boolean}>;
  results(report:SavedInfo, offset:number):Promise<Preview>;
}
export const pilotLibrary:LibraryClient = {
  load:()=>request('library'),
  createFolder:(name,parentId)=>request('folders','POST',{name,parentId}),
  updateFolder:(f,name,parentId)=>request('folders/'+f.id,'PATCH',{revision:f.revision,name,parentId}),
  deleteFolder:f=>request('folders/'+f.id,'DELETE',{revision:f.revision}),
  move:(r,folderId)=>request('reports/'+r.id,'PATCH',{revision:r.revision,folderId}),
  trash:r=>request('reports/'+r.id,'DELETE',{revision:r.revision}),
  restore:r=>request('reports/'+r.id+'/restore','POST',{revision:r.revision}),
  deleteTrashedReport:r=>request('trash/'+r.id,'DELETE',{revision:r.revision}),
  results:(r,offset)=>request('reports/'+r.id+'/results?revision='+r.revision+'&offset='+offset),
};
