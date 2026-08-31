export type Algorithm = 'GREEDY' | 'PRIORITY_FIT';
export type Case = { id:number; case_ref:string; procedure_name:string; speciality:string; priority:'ROUTINE'|'URGENT'|'EMERGENCY'; duration_minutes:number; recovery_minutes:number; required_bed_type:string };
export type Resource = { id:number; name:string; role?:string; speciality:string; available_from?:string; available_to?:string; shift_start?:string; shift_end?:string };
export type Bed = { id:number; bed_code:string; bed_type:string };
export type Allocation = { caseId:number; theatreId:number; surgeonId:number; anaesthetistId:number; nurseId:number; bedId:number; start:string; end:string };

const minutes = (value:string) => { const [h,m] = value.split(':').map(Number); return h*60+m; };
const clock = (date:string, total:number) => `${date} ${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}:00`;
const priorityScore = { EMERGENCY:3, URGENT:2, ROUTINE:1 } as const;

export function buildSchedule(cases:Case[], staff:Resource[], theatres:Resource[], beds:Bed[], date:string, algorithm:Algorithm) {
  const ordered = [...cases].sort((a,b) => algorithm === 'PRIORITY_FIT'
    ? priorityScore[b.priority]-priorityScore[a.priority] || b.duration_minutes-a.duration_minutes
    : a.id-b.id);
  const free = new Map<string,number>();
  const allocations:Allocation[]=[]; const rejected:{caseId:number;reason:string}[]=[];
  for (const c of ordered) {
    const theatre = theatres.find(t => t.speciality===c.speciality);
    const surgeon = staff.find(s => s.role==='SURGEON' && s.speciality===c.speciality);
    const anaesthetist = staff.find(s => s.role==='ANAESTHETIST' && (s.speciality==='General' || s.speciality===c.speciality || (c.speciality==='Cardiology' && s.speciality==='Cardiac')));
    const nurse = staff.find(s => s.role==='NURSE' && s.speciality===c.speciality);
    const bed = beds.find(b => b.bed_type===c.required_bed_type);
    if (!theatre || !surgeon || !anaesthetist || !nurse || !bed) { rejected.push({caseId:c.id,reason:'No resource matching the required skill or bed type'}); continue; }
    const keys=[`t${theatre.id}`,`s${surgeon.id}`,`a${anaesthetist.id}`,`n${nurse.id}`,`b${bed.id}`];
    const start=Math.max(minutes(theatre.available_from ?? '08:00'), minutes(surgeon.shift_start ?? '08:00'), ...keys.map(k=>free.get(k)??0));
    const end=start+c.duration_minutes;
    const limit=Math.min(minutes(theatre.available_to ?? '17:00'), minutes(surgeon.shift_end ?? '17:00'), minutes(anaesthetist.shift_end ?? '17:00'), minutes(nurse.shift_end ?? '17:00'));
    if(end>limit){ rejected.push({caseId:c.id,reason:'Not enough time remaining in the day'}); continue; }
    allocations.push({caseId:c.id,theatreId:theatre.id,surgeonId:surgeon.id,anaesthetistId:anaesthetist.id,nurseId:nurse.id,bedId:bed.id,start:clock(date,start),end:clock(date,end)});
    keys.slice(0,4).forEach(k=>free.set(k,end+15)); free.set(keys[4],end+c.recovery_minutes);
  }
  const used=allocations.reduce((sum,a)=>sum+(minutes(a.end.slice(11,16))-minutes(a.start.slice(11,16))),0);
  const capacity=theatres.reduce((sum,t)=>sum+minutes(t.available_to??'17:00')-minutes(t.available_from??'08:00'),0);
  return { allocations, rejected, utilisation: capacity ? Number((used/capacity*100).toFixed(1)) : 0 };
}
