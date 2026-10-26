import {scenarios,advisors,clone} from './fixtures.js';
import {evaluate,makeDraft,editDraft,approveDraft,deliverDraft,isDraftCurrent} from './engine.js';
import {buildReport} from './demo.js';

export const STORAGE_KEY='kingstar-demo-workspace-v3';
const now=()=>new Date().toISOString();
export function newCase(id='missing'){
  const index=scenarios.findIndex(x=>x.id===id);if(index<0)throw new Error('未知演示场景');
  const c=scenarios[index].make();c.id='CASE-'+String(index+1).padStart(3,'0');
  return {scenario:id,case:c,draft:null,reviewStatus:'none',reviewNote:'',returnedVersion:null,returnedContent:null,reviewFormNote:'',reviewFormChecked:false,editorText:null,pendingProfile:null,followupText:'',followupKind:'same',replyText:'',delivery:null,receipt:null,deliveries:[],audit:[],versionCounter:0,fee:{principal:100000,months:12}};
}
export function newWorkspace(){return {schema:3,active:'missing',cases:{missing:newCase()}};}
export function audit(s,action,detail){s.audit.unshift({time:now(),action,detail,caseId:s.case.id});s.audit=s.audit.slice(0,100);}
export const hasUnsaved=s=>Boolean(s.pendingProfile)||(s.draft&&s.editorText!==null&&s.editorText!==s.draft.body);
export const needsReply=s=>Boolean(s.case.followup&&!s.case.followup.reply);
const draftContent=d=>d?JSON.stringify({body:d.body.trim(),input:d.inputSnapshot}):null;
export const unchangedReturn=s=>Boolean(s.returnedContent&&draftContent(s.draft)===s.returnedContent);
export function flow(s){
  const d=evaluate(s.case,advisors.author);
  const result=(id,label,description,route,action,button)=>({id,label,description,route,action,button,decision:d});
  if(d.states.includes('scope'))return result('blocked','请求已暂停',d.reasons[0].message,d.reasons[0].code==='CONSENT_REQUIRED'?'companion':'overview',null,d.reasons[0].code==='CONSENT_REQUIRED'?'确认演示授权':'选择其他场景');
  if(hasUnsaved(s))return result('unsaved','有修改待保存','保存当前修改后，系统会重新检查，并更新草稿或审批状态。',s.pendingProfile?'companion':'copilot',null,'返回保存修改');
  if(d.states.includes('context'))return result('context','待补客户信息','补齐标记字段或更新持仓，然后保存并重新检查。','companion',null,'补充客户信息');
  if(d.states.includes('evidence'))return result('evidence','待核对资料','资料存在冲突、失效或检索失败。处理后才能继续生成。','evidence',null,'核对资料');
  if(needsReply(s))return result('followup','待顾问答复追问',s.case.followup.question,'copilot',null,'填写补充答复');
  if(s.draft&&!isDraftCurrent(s.case,s.draft))return result('stale','草稿需要更新','客户资料或引用版本已经改变。旧草稿不能继续审批或交付。','copilot','generate','按新资料重建草稿');
  if(s.receipt&&s.delivery)return result('closed','本案例已完成','客户已确认阅读本次解释，报告与操作记录已保留。','delivery',null,'查看完成报告');
  if(s.delivery)return result('delivered','待客户确认','解释已交付，切换到客户助手确认阅读，完成本次服务。','companion','acknowledge','确认已阅读');
  if(!s.draft)return result('ready','可以生成解释',d.canExplain?'资料已通过检查，可生成并交付一般解释。':'必要信息与资料已就绪，下一步生成顾问草稿。',d.canExplain?'companion':'copilot','generate',d.canExplain?'生成一般解释':'生成顾问草稿');
  if(s.reviewStatus==='returned'||unchangedReturn(s))return result('returned','已退回修改',s.reviewNote,'copilot',null,'修改草稿后重新提交');
  if(s.draft.approval&&s.reviewStatus==='approved')return result('approved','已批准待交付','当前版本已获批，可以交付给模拟客户。','copilot','deliver','交付当前版本');
  if(s.reviewStatus==='submitted')return result('submitted','等待人工复核','复核人检查具体版本，可批准或填写意见退回。','copilot',null,'前往复核');
  return result('editing','草稿待提交',d.canExplain?'确认一般解释正文后，可以直接交付。':'编辑草稿后提交复核，提交前仍可继续修改。','copilot',d.canExplain?'deliver':'submit',d.canExplain?'交付一般解释':'提交人工复核');
}
function clean(s){if(hasUnsaved(s))throw new Error('存在未保存修改，请先保存或放弃修改。');}
function supersede(s){
  const record=s.deliveries.find(x=>x.id===s.delivery?.id);if(record)record.status='superseded';
  s.delivery=null;s.receipt=null;
}
export function invalidateCase(s,reason){
  supersede(s);if(s.draft)s.draft.approval=null;s.reviewStatus=s.draft?'editing':'none';s.reviewFormChecked=false;s.reviewFormNote='';audit(s,'资料变更',reason);
}
export function generate(s){
  clean(s);if(needsReply(s))throw new Error('请先填写客户追问的补充答复。');const draft=makeDraft(s.case,advisors.author);supersede(s);
  s.versionCounter++;draft.version=s.versionCounter;s.draft=draft;s.editorText=draft.body;s.reviewStatus='editing';s.reviewFormNote='';s.reviewFormChecked=false;
  audit(s,'生成解释草稿',`版本 V${draft.version}；依据当前客户与资料快照`);return draft;
}
export function saveDraft(s,body){
  if(!s.draft)throw new Error('请先生成草稿');
  if(typeof body!=='string'||!body.trim())throw new Error('草稿不能为空');
  if(body.trim()===s.draft.body){s.editorText=s.draft.body;return false;}
  s.draft=editDraft(s.draft,body);s.versionCounter=Math.max(s.versionCounter+1,s.draft.version);s.draft.version=s.versionCounter;s.editorText=s.draft.body;supersede(s);s.reviewStatus='editing';s.reviewFormChecked=false;s.reviewFormNote='';audit(s,'保存草稿修改',`版本 V${s.draft.version}，需要重新提交复核`);return true;
}
export function submit(s){
  clean(s);const d=evaluate(s.case,advisors.author);
  if(!d.canDraft||!isDraftCurrent(s.case,s.draft))throw new Error('资料尚未就绪或草稿已失效，请重新检查并生成。');
  if(unchangedReturn(s))throw new Error('正文与资料仍和被退回的版本相同，请根据意见作出修改。');
  if(needsReply(s))throw new Error('请先补充客户追问答复。');
  if(s.reviewStatus==='submitted')return false;
  if(s.draft.approval)throw new Error('当前版本已批准，可以直接交付。');
  s.reviewStatus='submitted';s.reviewFormNote='';s.reviewFormChecked=false;audit(s,'提交人工复核',`提交 V${s.draft.version} 给陈复核`);return true;
}
export function review(s,action,note,checked=false){
  clean(s);if(s.reviewStatus!=='submitted')throw new Error('请先提交当前草稿，才能进行复核。');
  if(!isDraftCurrent(s.case,s.draft)||!evaluate(s.case,advisors.author).canDraft)throw new Error('草稿资料已经变化，请重新生成并提交。');
  if(typeof note!=='string'||!note.trim())throw new Error('请填写复核意见。');
  if(action==='approve'){
    if(!checked)throw new Error('请勾选已完成复核检查');
    s.draft=approveDraft(s.case,s.draft,advisors.reviewer,note);s.reviewStatus='approved';s.returnedContent=null;s.returnedVersion=null;audit(s,'批准草稿',`陈复核批准 V${s.draft.version}：${note.trim()}`);
  }else if(action==='return'){
    s.draft.approval=null;s.reviewStatus='returned';s.returnedVersion=s.draft.version;s.returnedContent=draftContent(s.draft);audit(s,'退回修改',`V${s.draft.version}：${note.trim()}`);
  }else throw new Error('未知复核操作');
  s.reviewNote=note.trim();s.reviewFormNote=note.trim();s.reviewFormChecked=false;
}
export function deliver(s){
  clean(s);const d=evaluate(s.case,advisors.author);
  if(d.canDraft&&s.reviewStatus!=='approved')throw new Error('当前草稿尚未完成审批。');
  const payload=deliverDraft(s.case,s.draft,advisors.author);
  if(s.delivery&&s.delivery.version===payload.version)return s.delivery;
  const record={id:`${s.case.id}-V${payload.version}`,version:payload.version,createdAt:now(),status:'current',report:clone(buildReport(s.case,s.draft,advisors.author)),payload:clone(payload),receipt:null};
  s.deliveries.unshift(record);s.deliveries=s.deliveries.slice(0,20);s.delivery={id:record.id,...payload};s.receipt=null;audit(s,'交付客户',`交付 V${payload.version}，等待客户确认阅读`);return s.delivery;
}
export function acknowledge(s){
  clean(s);if(!s.delivery)throw new Error('当前没有可确认的交付');
  deliverDraft(s.case,s.draft,advisors.author);
  if(s.receipt)return s.receipt;
  s.receipt={deliveryId:s.delivery.id,confirmedAt:now(),by:'合成客户'};
  const record=s.deliveries.find(x=>x.id===s.delivery.id);if(record)record.receipt=clone(s.receipt);
  audit(s,'客户确认阅读',`已确认 V${s.delivery.version}，本次案例流程完成`);return s.receipt;
}
export function requestFollowup(s,question,kind='same'){
  clean(s);if(!s.delivery)throw new Error('请先完成一次交付，再提出追问。');
  deliverDraft(s.case,s.draft,advisors.author);
  if(typeof question!=='string'||!question.trim()||question.trim().length>1000)throw new Error('请填写 1–1000 字的追问。');
  if(!['same','personalized'].includes(kind))throw new Error('请选择有效的追问方向。');
  const source=s.delivery.id;
  const previousTask=s.case.task,escalated=kind==='personalized'&&previousTask!=='personalized';
  s.case.followup={question:question.trim(),kind,previousTask,escalated,requestedAt:now(),fromDelivery:source,reply:null};
  if(escalated){
    s.case.task='personalized';s.case.consent=false;
    s.case.profile={...s.case.profile,confirmedAt:null,validUntil:null};
  }
  s.followupText='';s.followupKind='same';s.replyText='';invalidateCase(s,`客户追问 ${source}：${question.trim()}`);
  if(escalated)audit(s,'追问转为个人情况','需重新确认演示授权与客户信息，核对持仓和证据，补充答复后提交人工复核');
}
export function answerFollowup(s,reply){
  clean(s);if(!needsReply(s))throw new Error('当前没有待答复的追问。');
  if(typeof reply!=='string'||!reply.trim()||reply.trim().length>4000)throw new Error('请填写 1–4000 字的补充答复。');
  const next=clone(s.case);next.followup.reply=reply.trim();
  makeDraft(next,advisors.author); // Validate before committing the answer.
  s.case=next;s.replyText=reply.trim();invalidateCase(s,'顾问已填写补充答复，需生成新版本并走对应审核流程');generate(s);
}
export function switchCase(w,id){if(!scenarios.some(x=>x.id===id))throw new Error('未知演示场景');if(!w.cases[id])w.cases[id]=newCase(id);w.active=id;return w.cases[id];}
export function restoreWorkspace(text){
  if(!text)return newWorkspace();
  if(text.length>2000000)throw new Error('保存的演示进度超过限制');
  const w=JSON.parse(text);if(w.schema!==3||!w.cases||!scenarios.some(x=>x.id===w.active))throw new Error('演示进度版本不匹配');
  for(const [id,saved]of Object.entries(w.cases)){
    if(!saved||typeof saved!=='object'||Array.isArray(saved)||!saved.case||saved.scenario!==id)throw new Error('保存的场景标识无效');
    const s={...newCase(id),...saved};w.cases[id]=s;
    if(!scenarios.some(x=>x.id===id)||!s.case||s.scenario!==id||!Array.isArray(s.audit)||!Array.isArray(s.deliveries)||!Number.isInteger(s.versionCounter)||s.versionCounter<0||s.case.id!==newCase(id).case.id)throw new Error('保存的场景结构无效');
    if(!['none','editing','submitted','returned','approved'].includes(s.reviewStatus))throw new Error('保存的审核状态无效');
    s.audit=s.audit.slice(0,100);s.deliveries=s.deliveries.slice(0,20);
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
    if(!object(s.case.profile)||!Array.isArray(s.case.evidence)||s.case.evidence.some(e=>!object(e))||!object(s.fee))throw new Error('保存的演示资料不完整');
    if(s.case.holdings&&(!object(s.case.holdings)||!Array.isArray(s.case.holdings.items)||s.case.holdings.items.some(x=>!object(x))))throw new Error('保存的持仓结构无效');
    if(s.audit.some(x=>!object(x)||typeof x.action!=='string'||typeof x.detail!=='string'))throw new Error('保存的操作轨迹无效');
    if(s.case.followup&&(!object(s.case.followup)||typeof s.case.followup.question!=='string'||(s.case.followup.reply!==null&&typeof s.case.followup.reply!=='string')))throw new Error('保存的追问无效');
    if(!['same','personalized'].includes(s.followupKind))throw new Error('保存的追问方向无效');
    if(typeof s.followupText!=='string'||typeof s.replyText!=='string')throw new Error('保存的追问或答复输入无效');
    if(s.pendingProfile!==null&&!object(s.pendingProfile))throw new Error('未保存的客户信息无效');
    if(s.editorText!==null&&typeof s.editorText!=='string')throw new Error('未保存的正文无效');
    if(s.receipt&&!object(s.receipt))throw new Error('确认记录无效');
    if(s.draft){if(typeof s.draft.body!=='string'||!Array.isArray(s.draft.citations)||s.draft.citations.some(x=>!object(x))||!Number.isInteger(s.draft.version))throw new Error('保存的草稿无效');s.versionCounter=Math.max(s.versionCounter,s.draft.version);if(s.reviewStatus==='returned'&&!s.returnedContent)s.returnedContent=draftContent(s.draft);}
    if(s.deliveries.some(x=>!object(x)||!object(x.report)||typeof x.report.body!=='string'||!Array.isArray(x.report.citations)||x.report.citations.some(c=>!object(c))||!Array.isArray(x.report.questions)||(x.report.portfolio&&(!Array.isArray(x.report.portfolio.rows)||x.report.portfolio.rows.some(r=>!object(r)||!Number.isFinite(r.amount)||!Number.isFinite(r.weight))))))throw new Error('保存的交付记录无效');
    if(s.report&&(!Array.isArray(s.report.results)||s.report.results.some(t=>!object(t))||!Number.isInteger(s.report.total)||!Number.isInteger(s.report.passed)))delete s.report;
    if(s.draft?.approval){try{deliverDraft(s.case,s.draft,advisors.author);}catch{s.draft.approval=null;s.reviewStatus='editing';}}
    if(s.delivery){try{const current=deliverDraft(s.case,s.draft,advisors.author);if(current.body!==s.delivery.body||current.version!==s.delivery.version||!s.deliveries.some(x=>x.id===s.delivery.id))throw new Error();}catch{supersede(s);}}
    if(s.receipt&&s.receipt.deliveryId!==s.delivery?.id)s.receipt=null;
    if(s.delivery){const record=s.deliveries.find(x=>x.id===s.delivery.id);if(record){record.report=clone(buildReport(s.case,s.draft,advisors.author));record.payload=clone(deliverDraft(s.case,s.draft,advisors.author));record.receipt=s.receipt?clone(s.receipt):null;record.status='current';}}
  }
  if(!w.cases[w.active])throw new Error('当前场景不存在');return w;
}
export function recoverWorkspace(text){
  if(!text)return {workspace:newWorkspace(),recovered:[]};
  if(text.length>2000000)throw new Error('保存的演示进度超过限制');
  const parsed=JSON.parse(text);if(!parsed||parsed.schema!==3||!parsed.cases||typeof parsed.cases!=='object'||Array.isArray(parsed.cases))throw new Error('演示进度版本不匹配');
  const workspace={schema:3,active:scenarios.some(x=>x.id===parsed.active)?parsed.active:'missing',cases:{}},recovered=[];
  for(const scenario of scenarios){const id=scenario.id;if(!Object.hasOwn(parsed.cases,id))continue;try{workspace.cases[id]=restoreWorkspace(JSON.stringify({schema:3,active:id,cases:{[id]:parsed.cases[id]}})).cases[id];}catch{workspace.cases[id]=newCase(id);recovered.push(id);}}
  if(!workspace.cases[workspace.active])workspace.cases[workspace.active]=newCase(workspace.active);
  return {workspace,recovered};
}
