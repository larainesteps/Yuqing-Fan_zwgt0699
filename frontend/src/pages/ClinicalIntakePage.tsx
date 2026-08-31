// The reviewed intake workflow: submit a note, inspect the structured extraction beside its
// source, correct it, and approve, reject, schedule or insert it as an emergency. This page
// owns its own data because no other view shares the review queue.
import { useEffect, useState } from 'react';
import {
  Check, CircleAlert, Clipboard, Download, FileJson2, LoaderCircle, Play, Plus, Save,
  ShieldCheck, Siren, XCircle
} from 'lucide-react';
import type {
  ExtractionResult, IntakeReview, PriorityAssessment, RescheduleResult, ScheduleChange
} from '../types';
import { API } from '../api/client';
import { dateTimeInput, time } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import '../intake.css';
export default function ClinicalIntakePage(){
 const actor='Scheduler admin';
 const [caseId,setCaseId]=useState(()=>`CASE-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}`);
 const [noteText,setNoteText]=useState('');
 const [result,setResult]=useState<ExtractionResult|null>(null);
 const [priority,setPriority]=useState<PriorityAssessment|null>(null);
 const [reviewId,setReviewId]=useState<number|null>(null);
 const [reviewStatus,setReviewStatus]=useState<IntakeReview['status']|null>(null);
 const [queue,setQueue]=useState<IntakeReview[]>([]);
 const [processing,setProcessing]=useState(false);
 const [actionBusy,setActionBusy]=useState(false);
 const [error,setError]=useState('');
 const [actionMessage,setActionMessage]=useState('');
 const [rejectReason,setRejectReason]=useState('Clinical review did not approve this case.');
 const [copied,setCopied]=useState(false);
 const [freezeMinutes,setFreezeMinutes]=useState(60);
 const [rescheduleResult,setRescheduleResult]=useState<RescheduleResult|null>(null);

 const loadLatestImpact=async(caseReference:string)=>{try{const response=await fetch(`${API}/reschedules/latest`);if(!response.ok)return;const latest=await response.json();if(latest?.emergencyCaseId!==caseReference)return;setRescheduleResult({baselineRunKey:latest.baselineRunKey,freezeBefore:latest.freezeBefore,impact:{...latest.impact,lockedCases:latest.changes.filter((change:ScheduleChange)=>change.locked).length},changes:latest.changes,workflow:{runKey:latest.runKey,result:{algorithm:latest.algorithm,solver_status:latest.optimizerStatus}}})}catch{/* Impact history is supplementary to the clinical review. */}};
 const applyReview=(review:IntakeReview)=>{setReviewId(review.id);setReviewStatus(review.status);setCaseId(review.caseId);setNoteText(review.noteText);setResult(review.case);setPriority(review.priority);setError('');setActionMessage('');setRescheduleResult(null);if(review.status==='SCHEDULED')void loadLatestImpact(review.caseId)};
 const refreshQueue=async()=>{try{const response=await fetch(`${API}/intake/cases?limit=30`);if(response.ok)setQueue(await response.json())}catch{/* The editor remains usable when the queue is temporarily unavailable. */}};
 useEffect(()=>{void refreshQueue()},[]);

 const processCase=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(!noteText.trim()||processing) return;
  setProcessing(true);setError('');setActionMessage('');setPriority(null);setCopied(false);
  try{
   const response=await fetch(`${API}/intake/process`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contract_version:'v1',case_id:caseId.trim(),note_text:noteText.trim(),language:'en',source:'frontend',deidentified:true,submitted_at:new Date().toISOString(),actor})});
   const payload=await response.json().catch(()=>({message:'The server returned an invalid response'}));
   if(!response.ok) throw new Error(payload.message||`Request failed with status ${response.status}`);
   applyReview(payload as IntakeReview);setActionMessage('Case saved to the review queue.');await refreshQueue();
  }catch(err){setResult(null);setPriority(null);setError(err instanceof Error?err.message:'Unable to process this case')}
  finally{setProcessing(false)}
 };
 const updateField=(field:keyof ExtractionResult,value:unknown)=>setResult(current=>current?{...current,[field]:value}:current);
 const saveReview=async()=>{if(!reviewId||!result)return;setActionBusy(true);setError('');try{const response=await fetch(`${API}/intake/cases/${reviewId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:result,actor})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Unable to save review');applyReview(payload);setActionMessage('Review changes saved and priority recalculated.');await refreshQueue()}catch(err){setError(err instanceof Error?err.message:'Unable to save review')}finally{setActionBusy(false)}};
 const approveCase=async()=>{if(!reviewId)return;setActionBusy(true);setError('');try{const response=await fetch(`${API}/intake/cases/${reviewId}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Unable to approve case');applyReview(payload);setActionMessage('Case approved and inserted into the formal patient database.');await refreshQueue()}catch(err){setError(err instanceof Error?err.message:'Unable to approve case')}finally{setActionBusy(false)}};
 const rejectCase=async()=>{if(!reviewId)return;setActionBusy(true);setError('');try{const response=await fetch(`${API}/intake/cases/${reviewId}/reject`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor,reason:rejectReason})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Unable to reject case');applyReview(payload);setActionMessage('Case rejected with an audit record.');await refreshQueue()}catch(err){setError(err instanceof Error?err.message:'Unable to reject case')}finally{setActionBusy(false)}};
 const scheduleCase=async()=>{if(!reviewId)return;setActionBusy(true);setError('');try{const response=await fetch(`${API}/intake/cases/${reviewId}/schedule`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor,date:new Date().toISOString().slice(0,10),slotMinutes:30,maxSolveSeconds:30})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Unable to schedule case');applyReview(payload.review);setActionMessage(payload.allocation.status==='SCHEDULED'?`Scheduled by ${payload.workflow.result.algorithm} in run ${payload.workflow.runKey}.`:`Not scheduled: ${payload.allocation.rejection_code} — ${payload.allocation.rejection_reason}`);await refreshQueue()}catch(err){setError(err instanceof Error?err.message:'Unable to schedule case')}finally{setActionBusy(false)}};
 const insertEmergency=async()=>{if(!reviewId)return;setActionBusy(true);setError('');setRescheduleResult(null);try{const response=await fetch(`${API}/intake/cases/${reviewId}/emergency-insert`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor,date:new Date().toISOString().slice(0,10),slotMinutes:30,maxSolveSeconds:30,freezeMinutes})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||'Unable to insert emergency case');applyReview(payload.review);setRescheduleResult(payload);setActionMessage(payload.impact.insertedCases?`Emergency inserted with ${payload.impact.movedCases} moved and ${payload.impact.droppedCases} dropped cases.`:'Emergency case could not be inserted; review the structured rejection reason.');await refreshQueue()}catch(err){setError(err instanceof Error?err.message:'Unable to insert emergency case')}finally{setActionBusy(false)}};
 const json=result?JSON.stringify(priority?{case:result,priority}:result,null,2):'';
 const copyJson=async()=>{if(!json)return;await navigator.clipboard.writeText(json);setCopied(true);window.setTimeout(()=>setCopied(false),1800)};
 const downloadJson=()=>{if(!json)return;const blob=new Blob([json],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${result?.case_id||'case-extraction'}.json`;link.click();URL.revokeObjectURL(url)};

 return <><PageHeader title="Clinical Intake" searchable={false}/><section className="intake-layout">
  <form className="panel intake-form" onSubmit={processCase}>
   <div className="panel-head"><div><h2>Clinical note</h2><p>Enter a de-identified English case note for structured extraction.</p></div><span className="safe"><FileJson2 size={15}/> Persisted intake</span></div>
   <div className="intake-fields">
    <label><span>Case reference</span><input value={caseId} maxLength={100} onChange={e=>setCaseId(e.target.value)} disabled={Boolean(reviewId)} required/></label>
    <label className="note-field"><span>Case narrative</span><textarea value={noteText} maxLength={20000} onChange={e=>setNoteText(e.target.value)} disabled={Boolean(reviewId)} placeholder="Example: A 67-year-old patient presented with acute abdominal pain..." required/><small>{noteText.length.toLocaleString()} / 20,000 characters</small></label>
    <div className="privacy-note"><CircleAlert size={16}/><span>Remove names, NHS numbers, addresses and other direct identifiers before processing.</span></div>
    {error&&<div className="intake-error">{error}</div>}
    {actionMessage&&<div className="intake-success"><Check size={16}/>{actionMessage}</div>}
    {!reviewId?<button className="primary process-button" type="submit" disabled={processing||!noteText.trim()||!caseId.trim()}>{processing?<><LoaderCircle className="spin" size={17}/>Processing and saving...</>:<><FileJson2 size={17}/>Process and save for review</>}</button>:<button className="secondary process-button" type="button" onClick={()=>{setReviewId(null);setReviewStatus(null);setResult(null);setPriority(null);setRescheduleResult(null);setNoteText('');setCaseId(`CASE-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}`)}}><Plus size={17}/>Start another case</button>}
   </div>
  </form>
  <section className="panel result-panel">
   <div className="panel-head"><div><h2>Clinical review</h2><p>{reviewStatus?`Status: ${reviewStatus.replaceAll('_',' ')}`:'The validated result will appear here.'}</p></div>{result&&<div className="result-actions"><button type="button" onClick={copyJson}>{copied?<Check size={16}/>:<Clipboard size={16}/>} {copied?'Copied':'Copy'}</button><button type="button" onClick={downloadJson}><Download size={16}/> Download</button></div>}</div>
   {result?<><div className="extraction-summary"><div><span>Procedure</span><b>{result.procedure}</b></div><div><span>Speciality</span><b>{result.speciality}</b></div><div><span>Urgency</span><b className={`urgency-text ${result.urgency.toLowerCase()}`}>{result.urgency}</b></div><div><span>Confidence</span><b>{Math.round(result.confidence*100)}%</b></div></div>
    <div className="review-editor">
     <label><span>Procedure</span><input value={result.procedure} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('procedure',e.target.value)}/></label>
     <label><span>Speciality</span><input value={result.speciality} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('speciality',e.target.value)}/></label>
     <label><span>Urgency</span><select value={result.urgency} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('urgency',e.target.value)}>{['UNKNOWN','ROUTINE','EXPEDITED','URGENT','EMERGENCY'].map(value=><option key={value}>{value}</option>)}</select></label>
     <label><span>Requested time</span><input type="datetime-local" value={dateTimeInput(result.requested_datetime)} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('requested_datetime',new Date(e.target.value).toISOString())}/></label>
     <label><span>Duration (minutes)</span><input type="number" min="15" max="1440" value={result.estimated_duration_minutes} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('estimated_duration_minutes',Number(e.target.value))}/></label>
     <label><span>Maximum wait (hours)</span><input type="number" min="0" max="8760" value={result.maximum_delay_hours} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('maximum_delay_hours',Number(e.target.value))}/></label>
     <label><span>Doctor roles</span><input value={result.required_doctors.join(', ')} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('required_doctors',e.target.value.split(',').map(value=>value.trim()).filter(Boolean))}/></label>
     <label><span>Nurses required</span><input type="number" min="0" max="20" value={result.required_nurses} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('required_nurses',Number(e.target.value))}/></label>
     <label><span>Theatre type</span><input value={result.required_theatre_type??''} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('required_theatre_type',e.target.value||null)}/></label>
     <label><span>Recovery bed type</span><input value={result.required_bed_type??''} disabled={reviewStatus!=='REVIEW_REQUIRED'} onChange={e=>updateField('required_bed_type',e.target.value||null)}/></label>
    </div>
    {priority&&<div className="priority-card"><div className="priority-score"><span>Scheduling priority</span><strong>{priority.priority_score.toFixed(1)}</strong><small>/ 100</small><em className={priority.priority_level.toLowerCase()}>{priority.priority_level}</em></div><div className="priority-detail"><div className="priority-components">{Object.entries(priority.components).map(([name,value])=><div key={name}><span>{name.replaceAll('_',' ')}</span><b className={value<0?'negative':''}>{value>0?'+':''}{value.toFixed(1)}</b></div>)}</div><div className="priority-explanation"><b>Why this score</b><ul>{priority.explanation.map(item=><li key={item}>{item}</li>)}</ul></div></div></div>}
    {reviewStatus==='REVIEW_REQUIRED'&&<><div className="review-banner"><CircleAlert size={16}/>Review and save any corrections before approving this case.</div><div className="review-actions"><button type="button" className="secondary" disabled={actionBusy} onClick={saveReview}><Save size={16}/>Save review</button><button type="button" className="primary" disabled={actionBusy} onClick={approveCase}><ShieldCheck size={16}/>Approve and add to database</button></div><div className="reject-row"><input value={rejectReason} onChange={e=>setRejectReason(e.target.value)}/><button type="button" disabled={actionBusy||!rejectReason.trim()} onClick={rejectCase}><XCircle size={16}/>Reject</button></div></>}
    {reviewStatus==='APPROVED'&&<><div className="review-actions schedule-action"><span>Approved cases can now enter the CP-SAT workflow.</span><button type="button" className="primary" disabled={actionBusy} onClick={scheduleCase}>{actionBusy?<LoaderCircle className="spin" size={16}/>:<Play size={16}/>}Schedule as a new plan</button></div>{result&&['URGENT','EMERGENCY'].includes(result.urgency)&&<div className="emergency-insert"><div><Siren size={20}/><span><b>Dynamic emergency insertion</b><small>Freeze near-term cases and minimise changes to the current schedule.</small></span></div><label><span>Freeze window</span><select value={freezeMinutes} onChange={e=>setFreezeMinutes(Number(e.target.value))}><option value="0">No automatic freeze</option><option value="30">First 30 minutes</option><option value="60">First 60 minutes</option><option value="120">First 2 hours</option></select></label><button type="button" disabled={actionBusy} onClick={insertEmergency}>{actionBusy?<LoaderCircle className="spin" size={16}/>:<Siren size={16}/>}Insert into current schedule</button></div>}</>}
    {reviewStatus==='SCHEDULED'&&<div className="intake-success scheduled-success"><Check size={16}/>Case scheduled successfully. The run is available in Schedule and Evaluation.</div>}
    {reviewStatus==='REJECTED'&&<div className="intake-error priority-service-error"><XCircle size={16}/>This case was rejected and cannot enter scheduling.</div>}
    {rescheduleResult&&<div className="reschedule-impact"><div className="impact-head"><div><span>Emergency reschedule impact</span><b>{rescheduleResult.workflow.result.algorithm}</b></div><small>{rescheduleResult.baselineRunKey} → {rescheduleResult.workflow.runKey}</small></div><div className="impact-metrics"><div><strong>{rescheduleResult.impact.unchangedCases}</strong><span>Unchanged</span></div><div><strong>{rescheduleResult.impact.movedCases}</strong><span>Moved</span></div><div><strong>{rescheduleResult.impact.droppedCases}</strong><span>Dropped</span></div><div><strong>{rescheduleResult.impact.totalShiftMinutes}</strong><span>Shift minutes</span></div></div><div className="table-wrap"><table><thead><tr><th>Case</th><th>Change</th><th>Previous</th><th>New</th><th>Shift</th></tr></thead><tbody>{rescheduleResult.changes.map(change=><tr key={change.caseId}><td><b>{change.caseId}</b>{change.locked&&<small className="lock-note">Locked</small>}</td><td><span className={`change-type ${change.changeType.toLowerCase()}`}>{change.changeType.replaceAll('_',' ')}</span></td><td>{change.previousStart?time(change.previousStart):'—'}</td><td>{change.nextStart?time(change.nextStart):'—'}</td><td>{change.shiftMinutes===null?'—':`${change.shiftMinutes} min`}</td></tr>)}</tbody></table></div></div>}
    <details className="json-details"><summary>Validated JSON and priority data</summary><pre className="json-output"><code>{json}</code></pre></details>
   </>:<div className="result-empty"><span><FileJson2 size={27}/></span><h3>No case selected</h3><p>Process a note or open a case from the review queue.</p></div>}
  </section>
  <section className="panel review-queue"><div className="panel-head"><div><h2>Review queue</h2><p>Persisted cases and their current workflow status</p></div><button className="secondary" type="button" onClick={refreshQueue}>Refresh</button></div><div className="table-wrap"><table><thead><tr><th>Case</th><th>Procedure</th><th>Urgency</th><th>Status</th><th>Last result</th><th></th></tr></thead><tbody>{queue.map(item=><tr key={item.id}><td><b>{item.caseId}</b></td><td>{item.case.procedure}</td><td>{item.case.urgency}</td><td><span className={`workflow-state ${item.status.toLowerCase()}`}>{item.status.replaceAll('_',' ')}</span></td><td>{item.lastScheduleStatus??item.lastRejectionCode??'—'}</td><td><button className="queue-open" type="button" onClick={()=>applyReview(item)}>Open</button></td></tr>)}</tbody></table></div></section>
 </section></>
}
