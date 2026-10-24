import { createHash } from 'node:crypto';

export const TEST_DOCUMENT = '1ebAeu4DrkSur7MLC_xZUtOWvboHk3bqT_hYuarUHSAs';
const ascii = value => JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const hash = value => createHash('sha256').update(ascii(value), 'utf8').digest('hex');
const fail = message => { throw new Error(message); };
const nonempty = x => typeof x === 'string' && x.length > 0;
export function target({documentId, logId}) {
  if (!nonempty(documentId) || !nonempty(logId) || documentId === TEST_DOCUMENT) fail('INVALID_TARGET');
  return Object.freeze({documentId, logId});
}
export function eventId({logId, source, namespace, sourceRecordId}) {
  if (![logId, source, namespace, sourceRecordId].every(nonempty)) fail('IDENTITY_REQUIRED');
  return 'event-' + hash([logId, source, namespace, sourceRecordId]);
}
// No L/M format, cadence, branch adoption, or character knowledge is inferred.
export function makeEvent(input) {
  const e = {schemaVersion:1, logId:input.logId, source:input.source,
    namespace:input.namespace, sourceRecordId:input.sourceRecordId,
    speaker:input.speaker, channel:input.channel, scope:input.scope,
    kind:input.kind, occurredAt:input.occurredAt, body:input.body};
  if (!['vector','chatgpt'].includes(e.source) || !nonempty(e.speaker) ||
      !['here','comms','backstage','project'].includes(e.channel) ||
      !['inner','outer','backstage'].includes(e.scope) ||
      !['original','memo'].includes(e.kind) || typeof e.body !== 'string' ||
      !nonempty(e.occurredAt) || !Number.isFinite(Date.parse(e.occurredAt))) fail('INVALID_EVENT');
  if ((e.channel === 'backstage') !== (e.scope === 'backstage')) fail('SCOPE_MISMATCH');
  e.eventId = eventId(e);
  e.bodyHash = hash(e.body);
  e.recordHash = hash(e);
  return Object.freeze(e);
}
export function validateEvent(e, logId) {
  if (!e || e.logId !== logId) fail('WRONG_LOG');
  const expected = makeEvent(e);
  if (ascii(e) !== ascii(expected)) fail('INVALID_RECORD');
  return expected;
}
export const header = t => 'VECTOR_SHARED_LOG_CORE_V1 ' + ascii({logId:t.logId}) + '\n';
export const encode = e => 'EVENT ' + ascii(e) + '\n';
export function parse(text, t) {
  if (typeof text !== 'string' || !text.startsWith(header(t)) || !text.endsWith('\n')) fail('MALFORMED_DOCUMENT');
  const events = new Map(); let physicalCount = 0;
  for (const line of text.slice(header(t).length).split('\n').slice(0,-1)) {
    if (!line.startsWith('EVENT ')) fail('MALFORMED_RECORD');
    let e; try { e = JSON.parse(line.slice(6)); } catch { fail('MALFORMED_RECORD'); }
    validateEvent(e,t.logId); physicalCount++;
    if (events.has(e.eventId) && events.get(e.eventId).recordHash !== e.recordHash) fail('ID_CONFLICT');
    events.set(e.eventId,e);
  }
  return {events:[...events.values()], physicalCount};
}
export function partition(events) {
  return Object.fromEntries(['inner','outer','backstage'].map(scope=>[scope,events.filter(e=>e.scope===scope)]));
}
// Deliberately not a model-context builder: inner records are not automatically adopted/known.
export function initialState() { return {version:1, entries:[]}; }
export class Outbox {
  constructor({target: t, store, drive, maxConflicts=3}) {
    this.target=target(t); this.store=store; this.drive=drive;
    if(!Number.isInteger(maxConflicts) || maxConflicts<1 || maxConflicts>10) fail('INVALID_RETRY_BOUND');
    this.maxConflicts=maxConflicts; this.tail=Promise.resolve();
  }
  serial(fn) { const task=this.tail.then(fn); this.tail=task.catch(()=>{}); return task; }
  async load() {
    const s=await this.store.load();
    if(s.version!==1 || !Array.isArray(s.entries)) fail('INVALID_STORE');
    if(s.target && ascii(s.target)!==ascii(this.target)) fail('STORE_TARGET_MISMATCH');
    if(!s.target && s.entries.length) fail('UNBOUND_STORE');
    s.target={...this.target};
    const identities=new Map();
    for(const entry of s.entries) {
      validateEvent(entry.event,this.target.logId);
      if(!['pending','unknown','confirmed'].includes(entry.status)) fail('INVALID_STATUS');
      const previous=identities.get(entry.event.eventId);
      if(previous && previous!==entry.event.recordHash) fail('ID_CONFLICT');
      identities.set(entry.event.eventId,entry.event.recordHash);
    }
    return s;
  }
  enqueue(input) { return this.serial(async()=>{
    const event=makeEvent(input); validateEvent(event,this.target.logId);
    const s=await this.load();
    const found=s.entries.find(x=>x.event.eventId===event.eventId);
    if(found) { if(found.event.recordHash!==event.recordHash) fail('ID_CONFLICT'); return event.eventId; }
    s.entries.push({event,status:'pending'}); await this.store.save(s); return event.eventId;
  }); }
  flush() { return this.serial(async()=>{
    const s=await this.load();
    for (const entry of s.entries) {
      validateEvent(entry.event,this.target.logId);
      if(entry.status==='confirmed') continue;
      let confirmed=false;
      for(let conflicts=0; conflicts<=this.maxConflicts; conflicts++) {
        // Always reconcile before dispatch, including unknown outcome after restart.
        const doc=await this.drive.read(this.target.documentId);
        if(!nonempty(doc.revision)) fail('REVISION_REQUIRED');
        const records=parse(doc.text,this.target).events;
        const existing=records.find(e=>e.eventId===entry.event.eventId);
        if(existing) {
          if(existing.recordHash!==entry.event.recordHash) fail('ID_CONFLICT');
          entry.status='confirmed'; await this.store.save(s); confirmed=true; break;
        }
        entry.status='unknown'; await this.store.save(s); // durable before external attempt
        try {
          await this.drive.append(this.target.documentId,{requiredRevisionId:doc.revision,text:encode(entry.event)});
        } catch(err) {
          if(err.code==='REVISION_CONFLICT') continue;
          // Readback is safe; never blindly repeat an uncertain write in this attempt.
          try {
            const after=await this.drive.read(this.target.documentId);
            const found=parse(after.text,this.target).events.find(e=>e.eventId===entry.event.eventId);
            if(found && found.recordHash!==entry.event.recordHash) fail('ID_CONFLICT');
            if(found) { entry.status='confirmed'; await this.store.save(s); confirmed=true; break; }
          } catch(readError) { if(readError.message==='ID_CONFLICT') throw readError; }
          throw new Error('WRITE_UNKNOWN', {cause:err});
        }
        // A successful append must be reconciled even on the last allowed attempt.
        // Do not consume a conflict retry or append again if readback is unavailable.
        const after=await this.drive.read(this.target.documentId);
        const found=parse(after.text,this.target).events.find(e=>e.eventId===entry.event.eventId);
        if(found && found.recordHash!==entry.event.recordHash) fail('ID_CONFLICT');
        if(!found) fail('RECONCILE_REQUIRED');
        entry.status='confirmed'; await this.store.save(s); confirmed=true; break;
      }
      if(!confirmed) fail('RECONCILE_REQUIRED');
    }
    return s.entries.map(x=>({eventId:x.event.eventId,status:x.status}));
  }); }
}
