import {target} from './core.mjs';
// Pure request/response shape adapter. Caller provides a MOCK request function.
// No fetch, OAuth, tokens or default host. No transport is supplied by this candidate.
export function createMockDocsAdapter({documentId,logId,request}){
 const t=target({documentId,logId});
 if(typeof request!=='function')throw Error('MOCK_REQUEST_REQUIRED');
 function check(id){if(id!==t.documentId)throw Error('WRONG_DOCUMENT');}
 return {
 async read(id){
  check(id);const d=await request({method:'documents.get',documentId:id,includeTabsContent:true});
  if(d.documentId!==id || typeof d.revisionId!=='string'||!d.revisionId)throw Error('INVALID_DOC');
  // Minimal dedicated single-tab plain-text document only; reject unsupported shapes.
  if(!Array.isArray(d.tabs)||d.tabs.length!==1||d.tabs[0].childTabs?.length)throw Error('UNSUPPORTED_TABS');
  const tab=d.tabs[0];if(!tab.documentTab?.body?.content||!tab.tabProperties?.tabId)throw Error('INVALID_TAB');
  let text='';
  for(const item of tab.documentTab.body.content){
   if(item.sectionBreak && !item.paragraph)continue;
   if(!item.paragraph?.elements)throw Error('UNSUPPORTED_CONTENT');
   for(const e of item.paragraph.elements){if(typeof e.textRun?.content!=='string')throw Error('UNSUPPORTED_CONTENT');text+=e.textRun.content;}
  }
  // Google Docs' non-removable final paragraph newline is not a protocol event.
  if(!text.endsWith('\n'))throw Error('INVALID_TERMINATOR');
  this.tabId=tab.tabProperties.tabId;
  return {revision:d.revisionId,text:text.slice(0,-1)};
 },
 async append(id,{requiredRevisionId,text}){
  check(id);if(!this.tabId || !requiredRevisionId)throw Error('READ_REQUIRED');
  return request({method:'documents.batchUpdate',documentId:id,body:{writeControl:{requiredRevisionId},requests:[{insertText:{endOfSegmentLocation:{tabId:this.tabId},text}}]}});
 }
 };
}
