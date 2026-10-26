import {evaluate, deliverDraft, calculatePortfolio} from './engine.js';

export const references = [
  {id:'R1',publisher:'Morgan Stanley',date:'2024-06-26',title:'AI @ Morgan Stanley Debrief 发布说明',url:'https://www.morganstanley.com/press-releases/ai-at-morgan-stanley-debrief-launch',summary:'经客户同意，工具整理会谈要点与行动项，顾问可以编辑后续沟通草稿。',application:'本 demo 增加会前摘要、待确认事项与客户沟通报告。'},
  {id:'R2',publisher:'Investor.gov · 美国 SEC 投资者教育',date:'网页未标注发布日期',title:'基金与 ETF 的费用',url:'https://www.investor.gov/introduction-investing/investing-basics/glossary/mutual-fund-fees-and-expenses',summary:'产品成本包括交易相关费用和持续运营费用。费率差异会影响投资成本，完整项目需查阅说明书。',application:'对比工具只计算已知的管理费，并明确列出未包含的费用。'},
  {id:'R3',publisher:'Investor.gov · 美国 SEC 投资者教育',date:'网页未标注发布日期',title:'资产配置与分散投资',url:'https://www.investor.gov/introduction-investing/getting-started/asset-allocation',summary:'配置需要结合投资期限与风险承受度。持有多个基金仍可能重叠，需要查看底层持仓。',application:'持仓卡增加核对提示，不把产品数量或单项占比当作完整风险结论。'},
  {id:'R4',publisher:'中国证监会',date:'2025-12-31',title:'公募基金销售费用管理规定修订发布说明',url:'https://www.csrc.gov.cn/csrc/c100028/c7606047/content.shtml',summary:'发布说明介绍销售费用制度调整，注明新规定自 2026 年 1 月 1 日施行。',application:'费用资料保留适用时点。演示费率为虚构样例，不代表真实基金现行收费。'},
  {id:'R5',publisher:'金仕达',date:'官网首页，未标注统一发布日期',title:'金仕达官方业务介绍',url:'https://www.kingstartech.com/',summary:'官网介绍交易、风险管理和人工智能等技术及业务方向。',application:'作为行业背景；本项目产品设计沿用已有聊天，不宣称为金仕达官方产品或合作项目。'}
];

export function estimateFees(c, actor, principal, months) {
  const d=evaluate(c,actor);
  if(!d.canDraft&&!d.canExplain)throw new Error('请先处理信息与证据检查中的问题，再比较费用。');
  if(!Number.isFinite(principal)||principal<=0||principal>100000000)throw new Error('比较金额需大于 0，且不超过 1 亿元。');
  if(!Number.isInteger(months)||months<1||months>120)throw new Error('比较期限需为 1–120 个整月。');
  const fees=d.evidence.filter(e=>e.metric==='年管理费率'&&e.unit==='%');
  if(fees.length<2||new Set(fees.map(e=>e.period)).size!==1)throw new Error('需要至少两项同一期间的管理费率，才能作同口径比较。');
  if(fees.some(e=>typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<0||e.value>100))throw new Error('管理费率无效。');
  const products=new Map();
  for(const e of fees)if(!products.has(e.product))products.set(e.product,e);
  if(products.size<2)throw new Error('需要两个不同产品的管理费率。');
  const rows=[...products.values()].map(e=>({product:e.product,rate:e.value,citation:e.id,cost:Math.round(principal*e.value/100*months/12*100)/100}));
  return {principal,months,period:fees[0].period,rows,difference:Math.round((Math.max(...rows.map(r=>r.cost))-Math.min(...rows.map(r=>r.cost)))*100)/100};
}

export function nextQuestions(c) {
  if(c.task==='education')return ['如需结合个人情况讨论，再确认投资目标、期限与资金安排。'];
  if(c.task==='compare')return ['核对两类产品的风险、赎回条件和完整收费项目，费用差异不能单独决定选择。'];
  return ['确认近期计划用钱的具体金额，以及是否已有独立的应急储备。','补充产品赎回限制、到账时间及完整费用，再讨论资金安排。','查看底层资产、行业和发行人重叠，进一步核对集中度。'];
}

export function buildReport(c,draft,actor) {
  const delivered=deliverDraft(c,draft,actor);
  const personal=['portfolio','personalized'].includes(c.task);
  return {title:'客户沟通报告 · 演示',client:c.client,caseId:c.id,asOf:c.asOf,question:c.followup?.question??c.question,originalQuestion:c.followup?c.question:null,body:delivered.body,citations:delivered.citations,version:delivered.version,approval:draft.approval?{reviewer:draft.approval.reviewerId,note:draft.approval.note}:null,profile:personal?{...c.profile}:null,portfolio:personal?calculatePortfolio(c):null,questions:nextQuestions(c)};
}

export const escapeHtml = value => String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export function reportMarkup(r) {
  const e=escapeHtml,p=r.profile;
  return `<article class="client-report"><div class="report-label">KINGSTAR AI · DEMO REPORT</div><h2>${e(r.title)}</h2><p class="report-meta">${e(r.client)} · ${e(r.caseId)} · 基准日 ${e(r.asOf)} · V${e(r.version)}</p>${r.deliveryId?`<p class="report-meta">交付记录：${e(r.deliveryId)} · ${r.recordStatus==='superseded'?'历史交付版本，后续内容已更新':'导出时的当前交付版本'}<br>交付时间：${e(r.deliveredAt)}<br>客户确认：${r.acknowledgedAt?e(r.acknowledgedAt):'尚未确认'}</p>`:''}<h3>本次问题</h3><p>${e(r.question)}</p>${r.originalQuestion?`<p class="report-meta">初始问题：${e(r.originalQuestion)}</p>`:''}${p?`<h3>已确认的客户信息</h3><dl><dt>目标</dt><dd>${e(p.goal??'本任务未收集')}</dd><dt>计划期限</dt><dd>${e(p.horizonMonths??'未提供')} 个月</dd><dt>最近用钱时间</dt><dd>${e(p.liquidityMonths??'未提供')} 个月后</dd><dt>风险偏好 / 可承受损失</dt><dd>${e(p.riskPreference??'未提供')} / ${e(p.riskCapacity??'未提供')}%</dd></dl>`:''}<h3>本次解释</h3><div class="report-body">${e(r.body)}</div>${r.portfolio?`<h3>持仓结构 · 合成快照</h3><table><thead><tr><th>项目</th><th>人民币金额</th><th>占比</th></tr></thead><tbody>${r.portfolio.rows.map(x=>`<tr><td>${e(x.name)}</td><td>¥${e(x.amount.toLocaleString('zh-CN'))}</td><td>${(x.weight*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`:''}<h3>下次沟通待确认</h3><ol>${r.questions.map(q=>`<li>${e(q)}</li>`).join('')}</ol><h3>引用资料 · 合成</h3><ul>${r.citations.map(x=>`<li>[${e(x.id)}] ${e(x.title)} · ${e(x.section)} · V${e(x.version)}</li>`).join('')}</ul><h3>${r.approval?'复核记录':'交付方式'}</h3><p>${r.approval?`复核角色：${e(r.approval.reviewer)}<br>意见：${e(r.approval.note)}`:'一般知识或事实解释，无需个性化审批。'}</p><p class="report-footnote">本报告来自演示规则和合成资料，未接入大模型、真实产品或实时数据；不构成投资建议，不执行交易。此文件记录导出时所选的交付版本；后续修改需要重新复核。</p></article>`;
}
export function reportDocument(r) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>客户沟通报告 · ${escapeHtml(r.caseId)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#173444;line-height:1.8;margin:0;padding:40px;background:#edf3f3}article{max-width:800px;margin:auto;background:white;padding:40px}h2{font-size:28px}h3{margin:28px 0 10px;font-size:16px}p,li,dd,td{font-size:13px}.report-label{font-size:11px;letter-spacing:2px;color:#007b72}.report-meta,.report-footnote{color:#637e87;font-size:12px}.report-body{white-space:pre-wrap;font-size:13px}dl{display:grid;grid-template-columns:160px 1fr;gap:8px}dt{font-size:12px;color:#637e87}dd{margin:0}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #dde7e7;text-align:left}th{font-size:12px}.report-footnote{border-top:1px solid #dde7e7;margin-top:30px;padding-top:18px}@media(max-width:600px){body{padding:10px}article{padding:20px}dl{grid-template-columns:1fr}}@media print{body,article{padding:0;background:white}h3{break-after:avoid}tr{break-inside:avoid}}</style></head><body>${reportMarkup(r)}</body></html>`;
}
