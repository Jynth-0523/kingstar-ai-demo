import * as w from './workflow.js';
import {AS_OF,baseCase,clone} from './fixtures.js';
const assert=(v)=>{if(!v)throw new Error('预期状态未满足');};
const throws=fn=>{let failed=false;try{fn();}catch{failed=true;}assert(failed);};
function ready(){return w.newCase('ready');}
function approved(){const s=ready();w.generate(s);w.submit(s);w.review(s,'approve','已检查',true);return s;}
function delivered(){const s=approved();w.deliver(s);return s;}
function generalDelivered(){const s=w.newCase('education');w.generate(s);w.deliver(s);w.acknowledge(s);return s;}
function escalate(){const s=generalDelivered();w.requestFollowup(s,'我的持仓是否适合六个月后的用钱安排？','personalized');return s;}
export function runWorkflowSuite(){
  const tests=[];const test=(id,name,fn)=>tests.push({id,name,fn});
  test('F01','没有草稿时不允许提交或审批',()=>{const s=ready();throws(()=>w.submit(s));throws(()=>w.review(s,'approve','检查',true));});
  test('F02','生成后先编辑，提交后才进入复核',()=>{const s=ready();w.generate(s);assert(w.flow(s).id==='editing');throws(()=>w.review(s,'approve','检查',true));w.submit(s);assert(w.flow(s).id==='submitted');});
  test('F03','批准要求意见和检查确认',()=>{const s=ready();w.generate(s);w.submit(s);throws(()=>w.review(s,'approve','',true));throws(()=>w.review(s,'approve','检查',false));});
  test('F04','退回意见保留且不允许原样重提',()=>{const s=ready();w.generate(s);w.submit(s);w.review(s,'return','补充流动性说明');assert(w.flow(s).id==='returned');throws(()=>w.submit(s));w.saveDraft(s,s.draft.body);throws(()=>w.submit(s));});
  test('F05','退回后修改、重提、获批完成闭环',()=>{const s=ready();w.generate(s);w.submit(s);w.review(s,'return','补充说明');w.saveDraft(s,s.draft.body+'\n补充说明');w.submit(s);w.review(s,'approve','修改已检查',true);assert(w.flow(s).id==='approved'&&s.draft.version===2);});
  test('F06','未经批准的个性化草稿不可交付',()=>{const s=ready();w.generate(s);w.submit(s);throws(()=>w.deliver(s));});
  test('F07','交付后客户确认才完成案例',()=>{const s=delivered();assert(w.flow(s).id==='delivered');w.acknowledge(s);assert(w.flow(s).id==='closed'&&s.receipt.deliveryId===s.delivery.id);});
  test('F08','重复交付不会新增记录与日志',()=>{const s=delivered(),count=s.audit.length;w.deliver(s);assert(s.deliveries.length===1&&s.audit.length===count);});
  test('F09','重复确认不会生成新回执',()=>{const s=delivered(),r=w.acknowledge(s),count=s.audit.length;assert(w.acknowledge(s)===r&&s.audit.length===count);});
  test('F10','未交付无法确认阅读',()=>throws(()=>w.acknowledge(approved())));
  test('F11','一般知识跳过人工复核但保留客户确认',()=>{const s=w.newCase('education');w.generate(s);w.deliver(s);assert(!s.draft.approval&&w.flow(s).id==='delivered');w.acknowledge(s);assert(w.flow(s).id==='closed');});
  test('F12','未保存的草稿修改阻断提交、审批和交付',()=>{const s=approved();s.editorText=s.draft.body+'改';assert(w.flow(s).id==='unsaved');throws(()=>w.submit(s));throws(()=>w.deliver(s));});
  test('F13','未保存客户信息阻断生成和确认',()=>{const s=delivered();s.pendingProfile={goal:'新目标'};throws(()=>w.generate(s));throws(()=>w.acknowledge(s));});
  test('F14','批准后保存修改撤销审批并重新提交',()=>{const s=approved();w.saveDraft(s,s.draft.body+'改');assert(!s.draft.approval&&w.flow(s).id==='editing');throws(()=>w.deliver(s));w.submit(s);assert(w.flow(s).id==='submitted');});
  test('F15','仅保存相同正文不产生新版本',()=>{const s=approved();assert(w.saveDraft(s,s.draft.body)===false&&s.draft.version===1&&w.flow(s).id==='approved');});
  test('F16','重新生成的版本持续递增',()=>{const s=approved();w.generate(s);w.generate(s);assert(s.draft.version===3&&s.versionCounter===3);});
  test('F17','更新来源后旧草稿不可继续审批或交付',()=>{const s=approved();s.case.evidence[0].version='2';w.invalidateCase(s,'版本变化');assert(w.flow(s).id==='stale');throws(()=>w.submit(s));throws(()=>w.deliver(s));w.generate(s);assert(w.flow(s).id==='editing');});
  test('F18','旧交付报告在更新资料后仍完整保留',()=>{const s=delivered(),body=s.deliveries[0].report.body;w.acknowledge(s);s.case.profile.horizonMonths=36;w.invalidateCase(s,'期限变更');assert(!s.delivery&&!s.receipt&&s.deliveries[0].status==='superseded'&&s.deliveries[0].report.body===body&&s.deliveries[0].receipt);});
  test('F19','交付后新草稿不会改写旧报告',()=>{const s=delivered(),body=s.deliveries[0].report.body;w.saveDraft(s,'修订正文');assert(s.deliveries[0].report.body===body&&!s.delivery);w.submit(s);w.review(s,'approve','已核对新版本',true);w.deliver(s);assert(s.deliveries.length===2&&s.deliveries[0].version===2);});
  test('F20','切换场景时保存独立进度',()=>{const box=w.newWorkspace(),s=w.switchCase(box,'ready');w.generate(s);w.switchCase(box,'education');assert(w.switchCase(box,'ready').draft.version===1&&box.cases.education.draft===null);});
  test('F21','刷新恢复完整交付和客户回执',()=>{const box=w.newWorkspace();box.cases.ready=delivered();box.active='ready';w.acknowledge(box.cases.ready);const restored=w.restoreWorkspace(JSON.stringify(box));assert(w.flow(restored.cases.ready).id==='closed');});
  test('F22','刷新恢复未保存正文而不冒充获批内容',()=>{const box=w.newWorkspace();box.cases.ready=approved();box.active='ready';box.cases.ready.editorText+='未保存';const s=w.restoreWorkspace(JSON.stringify(box)).cases.ready;assert(w.flow(s).id==='unsaved');throws(()=>w.deliver(s));});
  test('F23','损坏或不兼容的保存数据被拒绝',()=>{for(const text of ['{','{}','{"schema":2,"cases":{}}'])throws(()=>w.restoreWorkspace(text));});
  test('F24','恢复时撤销与新资料不匹配的审批',()=>{const box=w.newWorkspace();box.cases.ready=approved();box.active='ready';box.cases.ready.case.evidence[0].version='9';const s=w.restoreWorkspace(JSON.stringify(box)).cases.ready;assert(!s.draft.approval&&w.flow(s).id==='stale');});
  test('F25','多项阻断有明确恢复步骤',()=>{const s=w.newCase('combined');assert(w.flow(s).id==='context');s.case.profile.horizonMonths=24;assert(w.flow(s).id==='evidence');});
  test('F26','过期持仓暂停流程，更新后恢复',()=>{const s=w.newCase('expired');assert(w.flow(s).id==='context');s.case.holdings.validUntil=AS_OF;assert(w.flow(s).id==='ready');});
  test('F27','撤销客户授权时停止处理与确认',()=>{const s=delivered();s.case.consent=false;w.invalidateCase(s,'撤销授权');assert(w.flow(s).id==='blocked');throws(()=>w.generate(s));throws(()=>w.acknowledge(s));});
  test('F28','未知场景不会改写已保存工作空间',()=>{const box=w.newWorkspace();throws(()=>w.switchCase(box,'unknown'));assert(box.active==='missing');});
  test('F29','操作轨迹有长度限制且保留最新记录',()=>{const s=ready();for(let i=0;i<110;i++)w.audit(s,'操作',String(i));assert(s.audit.length===100&&s.audit[0].detail==='109');});
  test('F30','客户确认后重复交付保持原回执',()=>{const s=delivered();const receipt=w.acknowledge(s);w.deliver(s);assert(s.receipt===receipt&&w.flow(s).id==='closed');});
  test('F31','重新生成相同的被退回正文不能绕过修改要求',()=>{const s=ready();w.generate(s);w.submit(s);w.review(s,'return','请补充说明');w.generate(s);assert(w.flow(s).id==='returned'&&s.reviewNote==='请补充说明');throws(()=>w.submit(s));});
  test('F32','修改后又恢复退回原文仍不能重提',()=>{const s=ready();w.generate(s);const body=s.draft.body;w.submit(s);w.review(s,'return','需要实质修改');w.saveDraft(s,body+'补充');w.saveDraft(s,body);throws(()=>w.submit(s));});
  test('F33','未交付时不能发起客户追问',()=>throws(()=>w.requestFollowup(approved(),'请解释')));
  test('F34','空或过长追问不改变原交付',()=>{const s=delivered(),id=s.delivery.id;for(const q of ['   ','长'.repeat(1001)])throws(()=>w.requestFollowup(s,q));assert(s.delivery.id===id&&!s.case.followup);});
  test('F35','已确认客户可追问且保留上一轮记录',()=>{const s=delivered();w.acknowledge(s);w.requestFollowup(s,'六个月后取用需要确认什么？');assert(w.flow(s).id==='followup'&&!s.delivery&&!s.receipt&&s.deliveries[0].receipt&&s.deliveries[0].status==='superseded');});
  test('F36','追问尚无答复时不能生成或提交',()=>{const s=delivered();w.requestFollowup(s,'需要补什么信息？');throws(()=>w.generate(s));throws(()=>w.submit(s));});
  test('F37','补充答复生成新版并重新复核',()=>{const s=delivered();w.requestFollowup(s,'资金够不够？');w.answerFollowup(s,'仍需确认用钱金额与赎回到账时间。');assert(s.draft.version===2&&s.draft.body.includes('客户补充问题：资金够不够？')&&s.draft.body.includes('仍需确认用钱金额'));assert(w.flow(s).id==='editing');throws(()=>w.deliver(s));});
  test('F38','追问答复完整走通第二次复核交付和确认',()=>{const s=delivered();w.requestFollowup(s,'请解释费用');w.answerFollowup(s,'示例只计算管理费，其他成本需确认。');w.submit(s);w.review(s,'approve','补充答复已检查',true);w.deliver(s);w.acknowledge(s);assert(w.flow(s).id==='closed'&&s.deliveries.length===2&&s.deliveries[0].version===2);});
  test('F39','一般知识追问答复继续跳过个性化审批',()=>{const s=w.newCase('education');w.generate(s);w.deliver(s);w.requestFollowup(s,'持有多个基金就分散了吗？');w.answerFollowup(s,'还需查看底层持仓是否重叠。');w.deliver(s);w.acknowledge(s);assert(!s.draft.approval&&w.flow(s).id==='closed');});
  test('F40','无效答复不改变追问和版本',()=>{const s=delivered();w.requestFollowup(s,'请补充');for(const reply of [' ','字'.repeat(4001)])throws(()=>w.answerFollowup(s,reply));assert(w.needsReply(s)&&s.versionCounter===1);});
  test('F41','损坏的资料和追问输入结构在恢复阶段被识别',()=>{for(const bad of ['evidence','holdings','followupText','replyText']){const box=w.newWorkspace();if(bad==='evidence')box.cases.missing.case.evidence=[null];else if(bad==='holdings')box.cases.missing.case.holdings.items=[null];else box.cases.missing[bad]=null;throws(()=>w.restoreWorkspace(JSON.stringify(box)));}});
  test('F42','单个损坏场景不会清空其他场景的完成记录',()=>{const box=w.newWorkspace();box.cases.ready=delivered();w.acknowledge(box.cases.ready);box.cases.missing.case.evidence=[null];const r=w.recoverWorkspace(JSON.stringify(box));assert(r.recovered.includes('missing')&&w.flow(r.workspace.cases.ready).id==='closed'&&w.flow(r.workspace.cases.missing).id==='context');});
  test('F43','损坏的当前场景恢复成初始案例并保留场景选择',()=>{const box=w.newWorkspace();box.active='ready';box.cases.ready={};const r=w.recoverWorkspace(JSON.stringify(box));assert(r.workspace.active==='ready'&&r.recovered.includes('ready'));});
  test('F44','恢复不接受损坏根结构',()=>{for(const text of ['null','{','{"schema":3,"cases":[]}'])throws(()=>w.recoverWorkspace(text));});
  test('F45','刷新保留追问和顾问未提交答复',()=>{const box=w.newWorkspace();box.cases.ready=delivered();box.active='ready';w.requestFollowup(box.cases.ready,'请解释');box.cases.ready.replyText='尚未提交的答复';const s=w.restoreWorkspace(JSON.stringify(box)).cases.ready;assert(w.needsReply(s)&&s.replyText==='尚未提交的答复');});
  test('F46','恢复当前报告时按有效交付正文重建显示内容',()=>{const box=w.newWorkspace();box.active='ready';box.cases.ready=delivered();box.cases.ready.deliveries[0].report.body='意外损坏的报告正文';const s=w.restoreWorkspace(JSON.stringify(box)).cases.ready;assert(s.deliveries[0].report.body===s.delivery.body);});
  test('F47','历史报告中损坏的金额在恢复阶段被识别',()=>{const box=w.newWorkspace();box.active='ready';box.cases.ready=delivered();w.generate(box.cases.ready);box.cases.ready.deliveries[0].report.portfolio.rows[0].amount=null;const r=w.recoverWorkspace(JSON.stringify(box));assert(r.recovered.includes('ready'));});
  test('F48','无效验收缓存不影响恢复已完成案例',()=>{const box=w.newWorkspace();box.active='ready';box.cases.ready=delivered();w.acknowledge(box.cases.ready);box.cases.ready.report={results:[null]};const s=w.restoreWorkspace(JSON.stringify(box)).cases.ready;assert(!s.report&&w.flow(s).id==='closed');});
  test('F49','一般追问转个人情况时重新确认授权并保留旧报告',()=>{const s=escalate();assert(s.case.task==='personalized'&&s.case.consent===false&&w.flow(s).id==='blocked');assert(s.deliveries[0].receipt&&!s.deliveries[0].report.profile&&!s.delivery);throws(()=>w.answerFollowup(s,'未经确认的答复'));});
  test('F50','转个人情况后依次检查客户信息持仓和证据',()=>{const s=escalate();s.case.consent=true;assert(w.flow(s).id==='context');s.case.profile=clone(baseCase.profile);assert(w.flow(s).id==='context');s.case.holdings=clone(baseCase.holdings);assert(w.flow(s).id==='evidence');throws(()=>w.answerFollowup(s,'知识卡不足以支持个人解释'));s.case.evidence=clone(baseCase.evidence);assert(w.flow(s).id==='followup');});
  test('F51','转个人情况的答复必须经过复核才能再次交付',()=>{const s=escalate();s.case.consent=true;s.case.profile=clone(baseCase.profile);s.case.holdings=clone(baseCase.holdings);s.case.evidence=clone(baseCase.evidence);w.answerFollowup(s,'仍需核对用钱金额与到账时间。');throws(()=>w.deliver(s));w.submit(s);w.review(s,'approve','已核对个人情况与补充答复',true);w.deliver(s);w.acknowledge(s);assert(w.flow(s).id==='closed'&&s.deliveries.length===2&&s.deliveries[0].report.approval&&s.deliveries[0].report.question.includes('我的持仓')&&s.deliveries[1].report.question==='什么是分散投资？');});
  test('F52','事实比较转个人情况不能沿用旧画像确认和授权',()=>{const s=w.newCase('conflict');s.case.evidence=clone(baseCase.evidence);w.generate(s);w.deliver(s);w.requestFollowup(s,'我是否适合这个产品？','personalized');assert(!s.case.consent&&s.case.profile.confirmedAt===null&&s.case.profile.validUntil===null);s.case.consent=true;assert(w.flow(s).id==='context');});
  test('F53','个人情况追问不能通过继续原话题降级免审',()=>{const s=delivered();w.requestFollowup(s,'再解释一下','same');w.answerFollowup(s,'补充答复');assert(s.case.task==='personalized');throws(()=>w.deliver(s));});
  test('F54','无效追问方向不修改任何交付状态',()=>{const s=generalDelivered(),before=JSON.stringify(s);throws(()=>w.requestFollowup(s,'新问题','unknown'));assert(JSON.stringify(s)===before);});
  test('F55','刷新保留个人情况分流与授权待办',()=>{const box=w.newWorkspace();box.active='education';box.cases.education=escalate();const s=w.restoreWorkspace(JSON.stringify(box)).cases.education;assert(s.case.followup.escalated&&s.case.task==='personalized'&&!s.case.consent&&s.deliveries[0].receipt);});
  test('F56','旧版没有追问方向字段的进度仍可恢复',()=>{const box=w.newWorkspace();box.active='ready';box.cases.ready=delivered();delete box.cases.ready.followupKind;const s=w.restoreWorkspace(JSON.stringify(box)).cases.ready;assert(s.followupKind==='same'&&w.flow(s).id==='delivered');});
  const results=tests.map(t=>{try{t.fn();return{id:t.id,name:t.name,passed:true};}catch(e){return{id:t.id,name:t.name,passed:false,error:e.message};}});
  return results;
}
