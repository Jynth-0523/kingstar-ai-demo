// Pure policy prototype. The browser role selector is simulation, not authentication.
export const POLICY_VERSION = '0.1.0';
const labels = {goal:'投资目标',horizonMonths:'投资期限',riskPreference:'风险偏好',riskCapacity:'可承受损失比例',liquidityMonths:'最近资金使用时间'};
const finite = v => typeof v === 'number' && Number.isFinite(v);
const present = v => typeof v === 'string' && v.trim().length > 0;
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const canonical = value => JSON.stringify(value, (_k,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const snapshot = c => canonical({policy:POLICY_VERSION,case:c});
export const isDraftCurrent=(c,d)=>Boolean(d&&d.caseId===c.id&&d.tenant===c.tenant&&d.inputSnapshot===snapshot(c));
export function evaluate(c, actor) {
  const reasons=[]; const add=(category,code,message,field=null)=>reasons.push({category,code,message,field});
  const result=()=>({policy:POLICY_VERSION,states:[...new Set(reasons.map(r=>r.category))],reasons,canDraft:false,canExplain:false,evidence:[],independentSources:0});
  if(!c || !actor || !['advisor','reviewer'].includes(actor.role) || !present(c.tenant) || actor.tenant!==c.tenant || c.clientTenant!==c.tenant) {
    add('scope','ACCESS_DENIED','此请求不在当前演示机构的访问范围内。');return result();
  }
  if(!['education','compare','portfolio','personalized'].includes(c.task)) {add('scope','TASK_OUT_OF_SCOPE','当前原型支持解释与顾问复核，不执行交易。');return result();}
  if(!date(c.asOf)){add('scope','INVALID_AS_OF','任务基准日期无效。');return result();}
  const personal=['portfolio','personalized'].includes(c.task);
  if(personal && c.consent!==true){add('scope','CONSENT_REQUIRED','尚未取得本次演示客户资料使用授权。');return result();}
  const p=c.profile??{};
  if(c.task==='personalized') {
    for(const field of ['goal','horizonMonths','riskPreference','riskCapacity','liquidityMonths']) {
      const v=p[field];const valid=field==='horizonMonths'? finite(v)&&v>0&&v<=600:field==='riskCapacity'?finite(v)&&v>=0&&v<=100:field==='liquidityMonths'?finite(v)&&v>=0&&v<=600:present(v);
      if(!valid)add('context','MISSING_'+field.toUpperCase(),`请确认${labels[field]}，用于判断当前任务的信息是否充分。`,field);
    }
    if(!date(p.confirmedAt)||!date(p.validUntil)||p.confirmedAt>c.asOf||p.validUntil<c.asOf||p.validUntil<p.confirmedAt)add('context','PROFILE_STALE','客户信息的确认日期或有效期需要重新核对。');
    if(p.lockMonths!=null && (!finite(p.lockMonths)||p.lockMonths<0||p.lockMonths>600))add('context','INVALID_LOCK','资金不可动用期限无效。','lockMonths');
    if(finite(p.lockMonths)&&finite(p.liquidityMonths)&&p.lockMonths>p.liquidityMonths)add('context','LIQUIDITY_CONFLICT','不可动用期限长于最近用钱时间，请先澄清流动性安排。','lockMonths');
  }
  if(personal) {
    const h=c.holdings;
    if(!h||!Array.isArray(h.items)||h.items.length===0||h.items.some(x=>!present(x.name)||!finite(x.amount)||x.amount<0||x.currency!=='CNY')||!finite(h.items.reduce((s,x)=>s+x.amount,0))||!(h.items.reduce((s,x)=>s+x.amount,0)>0))add('context','INVALID_HOLDINGS','需要完整且金额有效的人民币持仓快照。');
    if(!h||!date(h.asOf)||!date(h.validUntil)||h.asOf>c.asOf||h.validUntil<c.asOf||h.validUntil<h.asOf)add('context','HOLDINGS_STALE','持仓快照不符合当前任务的时点要求。');
  }
  const all=Array.isArray(c.evidence)?c.evidence:[];
  // Quarantined records are never used as facts; no text is executed or interpreted as tool instructions.
  const usable=all.filter(e=>e.quarantined!==true);
  if(c.retrieval!=='ok')add('evidence','RETRIEVAL_FAILED','资料检索未成功，暂停依赖该资料的结论。');
  if(usable.length===0)add('evidence','NO_EVIDENCE','没有可用证据。');
  if(usable.some(e=>!['id','origin','title','section','product','metric','unit','period','version'].every(k=>present(e[k])) || !['number','string'].includes(typeof e.value) || (typeof e.value==='number'&&!finite(e.value)) || (typeof e.value==='string'&&!present(e.value))))add('evidence','INVALID_EVIDENCE','证据缺少必要定位或事实字段。');
  if(new Set(usable.map(e=>e.id)).size!==usable.length)add('evidence','DUPLICATE_ID','证据标识重复，无法明确定位引用。');
  if(usable.some(e=>!date(e.publishedAt)||!date(e.validUntil)||e.publishedAt>c.asOf||e.validUntil<c.asOf||e.validUntil<e.publishedAt))add('evidence','EVIDENCE_STALE','部分证据日期无效或已超出配置的有效期。');
  const groups=new Map();
  for(const e of usable){const key=canonical([e.product,e.metric,e.unit,e.period]);if(!groups.has(key))groups.set(key,new Set());groups.get(key).add(canonical(e.value));}
  if([...groups.values()].some(v=>v.size>1))add('evidence','SOURCE_CONFLICT','同产品、同指标、同时间和同单位的证据存在冲突。');
  const independent=new Set(usable.map(e=>e.origin)).size;
  if(c.task==='compare'||c.task==='personalized'){
    if(independent<2)add('evidence','INSUFFICIENT_ORIGINS','当前演示规则要求至少两个独立来源；转载不重复计数。');
  }
  const r=result();r.evidence=usable;r.independentSources=independent;
  if(reasons.length===0){r.states=[personal?'review':'explain'];r.canDraft=personal;r.canExplain=!personal;}
  return r;
}
export function calculatePortfolio(c) {
  const items=c.holdings?.items;
  if(!Array.isArray(items)||!items.length||items.some(x=>!finite(x.amount)||x.amount<0||x.currency!=='CNY'))throw new Error('持仓输入无效');
  const total=items.reduce((s,x)=>s+x.amount,0);if(!finite(total)||total<=0)throw new Error('持仓合计必须大于零');
  const rows=items.map(x=>({...x,weight:x.amount/total}));
  return {currency:'CNY',total,rows,maxWeight:Math.max(...rows.map(x=>x.weight)),formula:'持仓占比 = 单项金额 / 持仓总额'};
}
export function makeDraft(c, actor) {
  const decision=evaluate(c,actor);if(!decision.canDraft&&!decision.canExplain)throw new Error('必要条件尚未满足，不能生成草稿。');
  const citations=decision.evidence.map(e=>({id:e.id,title:e.title,section:e.section,version:e.version,claim:typeof e.value==='number'?`${e.product} 的${e.metric}为 ${e.value}${e.unit}（${e.period}）。`:e.value}));
  const portfolio=['portfolio','personalized'].includes(c.task)?calculatePortfolio(c):null;
  const lines=[c.task==='education'?'通用知识解释':'顾问解释草稿'];
  if(c.task==='personalized') lines.push(`本次目标：${c.profile.goal}。计划期限 ${c.profile.horizonMonths} 个月，最近计划用钱时间为 ${c.profile.liquidityMonths} 个月后；风险偏好为${c.profile.riskPreference}，自述可承受损失比例 ${c.profile.riskCapacity}%。这些字段是沟通信息，不是适当性评估结论。`);
  lines.push(...citations.map(e=>`${e.claim} [${e.id}]`));
  if(c.followup){lines.push(`客户补充问题：${c.followup.question}`,`顾问补充答复：${c.followup.reply||'尚待顾问填写，本草稿不能作为已答复内容。'}`);}
  if(portfolio) lines.push(`基于 ${c.holdings.asOf} 的合成持仓，总额为 ¥${portfolio.total.toLocaleString('zh-CN')}，最大单项占比 ${(portfolio.maxWeight*100).toFixed(1)}%。`, '上述占比是持仓结构说明，不构成产品配置结论。具体适配性须由顾问结合已确认目标、资金使用安排和风险承受能力复核。');
  if(portfolio) lines.push('下一步待确认：近期用钱的具体金额、独立应急储备、产品赎回限制和到账时间。仅凭当前快照无法判断资金安排是否足够或产品是否适合。');
  if(c.task==='compare'||c.task==='personalized') lines.push('费用口径：这里只列示年管理费率，未包含申购、赎回、托管和销售服务等费用。不同类型产品的风险与流动性不同，不能仅凭管理费高低选择产品。');
  lines.push('本次内容采用合成演示资料，不涉及真实产品、实时行情或交易执行。');
  return {caseId:c.id,tenant:c.tenant,authorId:actor.id,body:lines.join('\n\n'),citations,portfolio,inputSnapshot:snapshot(c),approval:null,version:1};
}
const contentKey = d=>canonical({body:d.body,citations:d.citations,portfolio:d.portfolio,version:d.version,inputSnapshot:d.inputSnapshot});
export function editDraft(d, body){if(!present(body))throw new Error('草稿不能为空');return {...d,body:body.trim(),version:d.version+1,approval:null};}
export function approveDraft(c,d,reviewer,note) {
  if(!reviewer||reviewer.role!=='reviewer'||reviewer.tenant!==c.tenant||d.tenant!==c.tenant||reviewer.id===d.authorId)throw new Error('需由同机构的另一位复核角色审批。');
  if(!present(note))throw new Error('请填写复核意见。');
  const v=evaluate(c,reviewer);if(!v.canDraft||snapshot(c)!==d.inputSnapshot)throw new Error('上下文或证据已改变，请重新生成并复核。');
  return {...d,approval:{reviewerId:reviewer.id,note:note.trim(),contentKey:contentKey(d),policy:POLICY_VERSION}};
}
export function deliverDraft(c,d,actor) {
  const v=evaluate(c,actor);
  if(d.tenant!==c.tenant || snapshot(c)!==d.inputSnapshot || (!v.canDraft&&!v.canExplain))throw new Error('当前条件不满足交付要求，请重新检查。');
  if(v.canDraft && (!d.approval||d.approval.contentKey!==contentKey(d)||d.approval.policy!==POLICY_VERSION))throw new Error('草稿尚未获批或审批已失效。');
  return {body:d.body,citations:d.citations,version:d.version,caseId:c.id,synthetic:true};
}
