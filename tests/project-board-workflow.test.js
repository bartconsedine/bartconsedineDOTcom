import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { task } from '../src/private-apps/project-board/model.js';
import { starterTasks } from '../src/private-apps/project-board/starter.js';
import { workflowDefaults,workflowRecord,TASK_WORKFLOW_DEFAULTS,utc } from '../src/private-apps/project-board/workflow-model.js';

test('workflow validation preserves legacy tasks, rejects ownership and separates dates from scheduling',()=>{
 assert.equal(task(starterTasks[0]),starterTasks[0]);
 const value={...starterTasks[0],...TASK_WORKFLOW_DEFAULTS,status:'waiting',kind:'waiting',next_action:'Await owner decision'};
 assert.equal(task(value),value);
 for(const change of [{blocker_task_id:value.id},{kind:'job'},{evidence:[{label:'Raw conversation',url:'javascript:bad',observed_at:null}]},{owner_id:randomUUID()}])assert.throws(()=>task({...value,...change}));
 for(const bad of ['2026-11-15','2026-02-30T12:00:00Z','2026-11-15T12:00:00-05:00','2026-11-15T25:00:00Z'])assert.throws(()=>utc(bad));
 utc('2026-11-15T12:00:00.123456Z');utc(null);
 const run={...workflowDefaults('runs'),request_summary:'An explicit action'};
 assert.equal(workflowRecord('runs',run),run);
 for(const change of [{owner_id:randomUUID()},{provider:'custom-scheduler'},{timezone:'Wrong/Zone'},{status:'succeeded'},{started_at:'2026-11-15'},{job_id:randomUUID()}])assert.throws(()=>workflowRecord('runs',{...run,...change}));
 const schedule={...workflowDefaults('schedules'),job_id:randomUUID()};
 assert.throws(()=>workflowRecord('schedules',{...schedule,status:'active'}));
 assert.equal(workflowRecord('schedules',{...schedule,status:'active',provider_schedule_id:'existing-dot-automation',last_verified_at:'2026-11-15T12:00:00Z'}).provider,'dot');
 const evidence=[{label:'Observed result',url:'https://example.com/evidence',observed_at:'2026-11-15T12:00:00Z'}];
 assert.equal(workflowRecord('runs',{...run,status:'succeeded',completed_at:'2026-11-15T12:00:00Z',verified_at:'2026-11-15T12:01:00Z',outcome:'Confirmed',evidence}).status,'succeeded');
 assert.throws(()=>workflowRecord('runs',{...run,started_at:'2026-11-15T12:01:00Z',completed_at:'2026-11-15T12:00:00Z'}));
 assert.throws(()=>workflowRecord('runs',{...run,completed_at:'2026-11-15T12:01:00Z',verified_at:'2026-11-15T12:00:00Z'}));
 assert.throws(()=>workflowRecord('deliveries',{...workflowDefaults('deliveries'),run_id:run.id,delivered_at:'2026-11-15T12:01:00Z',verified_at:'2026-11-15T12:00:00Z'}));
 assert.throws(()=>workflowRecord('deliveries',{...workflowDefaults('deliveries'),run_id:run.id,status:'confirmed',delivered_at:'2026-11-15T12:00:00Z'}));
 assert.throws(()=>workflowRecord('approvals',{...workflowDefaults('approvals'),run_id:run.id,status:'approved'}));
});
