import { BoardError, exact, safeUrl, uuid } from './model.js';

export const TASK_WORKFLOW_DEFAULTS = Object.freeze({kind:'task',next_action:'',blocked_reason:'',blocker_task_id:null,evidence:[]});
export const TASK_WORKFLOW_FIELDS = Object.keys(TASK_WORKFLOW_DEFAULTS);
export const WORKFLOW_STATUSES = Object.freeze({
 jobs:['draft','active','paused','waiting','completed','historical'],
 schedules:['unverified','active','paused','cancelled'],
 runs:['requested','accepted','scheduled','running','waiting','succeeded','failed','cancel_requested','cancelled','uncertain'],
 approvals:['pending','approved','rejected','revoked'],
 deliveries:['queued','received','confirmed','failed','uncertain','cancelled'],
});
export const WORKFLOW_KINDS = Object.keys(WORKFLOW_STATUSES);
export const WORKFLOW_FIELDS = Object.freeze({
 jobs:['id','project_id','title','description','status','provider','provider_job_id','provider_revision','timezone','next_action','evidence'],
 schedules:['id','job_id','provider','provider_schedule_id','status','expression','timezone','next_scheduled_at','last_verified_at','evidence'],
 runs:['id','job_id','job_revision','task_id','task_revision','provider','provider_run_id','status','mode','request_summary','requires_approval','timezone','scheduled_at','accepted_at','started_at','completed_at','verified_at','outcome','next_action','evidence'],
 approvals:['id','run_id','run_revision','status','summary','decided_at'],
 deliveries:['id','run_id','kind','provider','provider_delivery_id','status','message_id','scheduled_at','received_at','started_at','delivered_at','verified_at','next_action','evidence'],
});
const text = (value,max,required=false) => {if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new BoardError('Invalid workflow text.');};
export function utc(value){if(value===null)return;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19))throw new BoardError('Use a valid UTC timestamp, including Z.');}
export function evidence(value){if(!Array.isArray(value)||value.length>20)throw new BoardError('Use at most 20 evidence references.');for(const item of value){exact(item,['label','url','observed_at']);text(item.label,300,true);safeUrl(item.url);utc(item.observed_at);}return value;}
export function taskWorkflow(value){const merged={...TASK_WORKFLOW_DEFAULTS,...value};if(!['task','waiting','historical'].includes(merged.kind))throw new BoardError('Invalid task kind.');text(merged.next_action,2000);text(merged.blocked_reason,2000);if(merged.blocker_task_id!==null){uuid(merged.blocker_task_id);if(merged.blocker_task_id===merged.id)throw new BoardError('A task cannot block itself.');}evidence(merged.evidence);return value;}
export function workflowDefaults(kind){const shared={id:crypto.randomUUID(),status:WORKFLOW_STATUSES[kind]?.[0]};const provider={provider:'dot'},clock={timezone:'America/New_York'};const defaults={
 jobs:{project_id:null,title:'',description:'',...provider,provider_job_id:null,provider_revision:null,timezone:null,next_action:'',evidence:[]},
 schedules:{job_id:null,...provider,provider_schedule_id:null,expression:'',timezone:null,next_scheduled_at:null,last_verified_at:null,evidence:[]},
 runs:{job_id:null,job_revision:null,task_id:null,task_revision:null,...provider,provider_run_id:null,mode:'action',request_summary:'',requires_approval:true,...clock,scheduled_at:null,accepted_at:null,started_at:null,completed_at:null,verified_at:null,outcome:'',next_action:'',evidence:[]},
 approvals:{run_id:null,run_revision:1,summary:'',decided_at:null},
 deliveries:{run_id:null,kind:'result',...provider,provider_delivery_id:null,message_id:null,scheduled_at:null,received_at:null,started_at:null,delivered_at:null,verified_at:null,next_action:'',evidence:[]},
};if(!defaults[kind])throw new BoardError('Unknown workflow record.');return {...shared,...defaults[kind]};}
export function workflowRecord(kind,value){
 if(!WORKFLOW_FIELDS[kind])throw new BoardError('Unknown workflow record.');exact(value,WORKFLOW_FIELDS[kind]);uuid(value.id);
 if(!WORKFLOW_STATUSES[kind].includes(value.status))throw new BoardError('Invalid workflow status.');
 for(const key of ['project_id','task_id','job_id','run_id','message_id'])if(Object.hasOwn(value,key)&&value[key]!==null)uuid(value[key]);
 if(['schedules','approvals','deliveries'].includes(kind)&&value[kind==='schedules'?'job_id':'run_id']===null)throw new BoardError('Choose a parent record.');
 if(Object.hasOwn(value,'provider')&&value.provider!=='dot')throw new BoardError('Dot is the execution provider.');
 for(const key of ['provider_job_id','provider_revision','provider_schedule_id','provider_run_id','provider_delivery_id'])if(Object.hasOwn(value,key)&&value[key]!==null)text(value[key],500,true);
 if(Object.hasOwn(value,'timezone')&&!(value.timezone===null&&['jobs','schedules'].includes(kind))){text(value.timezone,100,true);try{new Intl.DateTimeFormat('en',{timeZone:value.timezone}).format();}catch{throw new BoardError('Use a recognized timezone.');}}
 for(const key of ['title','description','next_action','expression','request_summary','outcome','summary'])if(Object.hasOwn(value,key))text(value[key],key==='title'?160:key==='expression'?1000:4000,key==='title'||key==='request_summary');
 for(const key of ['next_scheduled_at','last_verified_at','scheduled_at','accepted_at','received_at','started_at','completed_at','verified_at','decided_at','delivered_at'])if(Object.hasOwn(value,key))utc(value[key]);
 if(Object.hasOwn(value,'evidence'))evidence(value.evidence);
 if(kind==='schedules'&&value.status==='active'&&(!value.provider_schedule_id||!value.last_verified_at))throw new BoardError('An active schedule needs a verified provider reference.');
 if(kind==='runs'){
  for(const parent of ['job','task']){const rev=value[`${parent}_revision`];if((value[`${parent}_id`]===null)!==(rev===null)||rev!==null&&(!Number.isSafeInteger(rev)||rev<1||rev>2147483646))throw new BoardError('Bind the exact parent revision.');}
  if(!['action','acknowledgment'].includes(value.mode)||typeof value.requires_approval!=='boolean')throw new BoardError('Invalid run approval mode.');
  if(value.status==='succeeded'&&(!value.verified_at||!value.completed_at||!value.evidence.length||value.evidence.some(item=>!item.observed_at)||!value.outcome.trim()))throw new BoardError('A successful outcome needs completion time and verified evidence.');
  if(value.status==='running'&&!value.started_at)throw new BoardError('A running action needs its observed start time.');
  if(value.completed_at&&value.started_at&&Date.parse(value.completed_at)<Date.parse(value.started_at))throw new BoardError('Completion cannot precede the observed start.');
  if(value.verified_at&&value.completed_at&&Date.parse(value.verified_at)<Date.parse(value.completed_at))throw new BoardError('Verification cannot precede completion.');
 }
 if(kind==='approvals'){
  if(!Number.isSafeInteger(value.run_revision)||value.run_revision<1||value.run_revision>2147483646)throw new BoardError('Choose the exact run revision.');
  if(value.status!=='pending'&&!value.decided_at)throw new BoardError('A decision needs its UTC decision time.');
 }
 if(kind==='deliveries'&&value.status==='confirmed'&&(!value.delivered_at||!value.verified_at||!value.evidence.length||value.evidence.some(item=>!item.observed_at)))throw new BoardError('Confirmed delivery needs verified evidence and delivery time.');
 if(kind==='deliveries'&&!['notification','result'].includes(value.kind))throw new BoardError('Choose a notification or result delivery.');
 if(kind==='deliveries'&&value.verified_at&&value.delivered_at&&Date.parse(value.verified_at)<Date.parse(value.delivered_at))throw new BoardError('Verification cannot precede delivery.');
 return value;
}
