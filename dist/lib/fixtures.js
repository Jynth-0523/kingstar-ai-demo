export const AS_OF = '2026-10-26';
export const clone = value => JSON.parse(JSON.stringify(value));
export const advisors = {
  author: {id:'advisor-01', tenant:'demo-a', role:'advisor', name:'林顾问'},
  reviewer: {id:'reviewer-02', tenant:'demo-a', role:'reviewer', name:'陈复核'},
  outsider: {id:'reviewer-x', tenant:'demo-b', role:'reviewer', name:'外部机构'}
};
export const baseCase = {
  id:'CASE-001', tenant:'demo-a', clientTenant:'demo-a', client:'客户 001',
  task:'personalized', question:'我想了解当前持仓是否与未来两年的用钱计划一致。',
  asOf:AS_OF, consent:true, retrieval:'ok',
  profile:{goal:'两年内保持资金使用灵活性',horizonMonths:24,riskPreference:'中等',riskCapacity:15,liquidityMonths:6,lockMonths:0,confirmedAt:'2026-10-25',validUntil:'2026-11-25'},
  holdings:{asOf:'2026-10-25',validUntil:'2026-10-27',items:[{name:'示例债券产品 A',amount:120000,currency:'CNY'},{name:'示例权益产品 B',amount:50000,currency:'CNY'},{name:'示例现金',amount:30000,currency:'CNY'}]},
  evidence:[
    {id:'E-001',origin:'synthetic-a',title:'示例债券产品 A 说明书',section:'第 3 页 · 费用',product:'A',metric:'年管理费率',value:0.3,unit:'%',period:'2026-10',version:'1.0',publishedAt:'2026-10-01',validUntil:'2026-11-01',snippet:'合成资料：示例债券产品 A 的年管理费率为 0.30%。',synthetic:true},
    {id:'E-002',origin:'synthetic-b',title:'示例权益产品 B 说明书',section:'第 4 页 · 费用',product:'B',metric:'年管理费率',value:0.8,unit:'%',period:'2026-10',version:'1.0',publishedAt:'2026-10-01',validUntil:'2026-11-01',snippet:'合成资料：示例权益产品 B 的年管理费率为 0.80%。',synthetic:true}
  ]
};
export const scenarios = [
  {id:'missing',label:'01 信息待补',caption:'先询问投资期限',make(){const c=clone(baseCase);c.profile.horizonMonths=null;c.question='我想了解当前持仓是否适合我的用钱计划。';c.profile.goal='希望保持资金使用灵活性';return c;}},
  {id:'ready',label:'02 完整流程',caption:'从草稿到获批交付',make(){return clone(baseCase);}},
  {id:'conflict',label:'03 来源冲突',caption:'同口径数据不一致',make(){const c=clone(baseCase);c.task='compare';c.question='请比较两个示例产品的管理费用。';c.evidence.push({...c.evidence[0],id:'E-003',origin:'synthetic-alt',value:0.6,title:'示例资料 A 修订副本',snippet:'合成资料：另一版本记载管理费率为 0.60%。'});return c;}},
  {id:'education',label:'04 通用解释',caption:'无需完整客户画像',make(){const c=clone(baseCase);c.task='education';c.question='什么是分散投资？';c.profile={};c.holdings=null;c.consent=false;c.evidence=[{...c.evidence[0],id:'E-EDU',title:'演示知识卡 分散投资',section:'概念卡 01',product:'concept',metric:'definition',value:'分散持有不同资产可降低对单一资产的依赖，但不能保证盈利或避免全部损失。',unit:'text',snippet:'分散持有不同资产可降低对单一资产的依赖，但不能保证盈利或避免全部损失。'}];return c;}},
  {id:'expired',label:'05 数据过期',caption:'持仓快照需更新',make(){const c=clone(baseCase);c.holdings.validUntil='2026-10-20';return c;}},
  {id:'combined',label:'06 多项阻断',caption:'缺信息与证据冲突并存',make(){const c=scenarios.find(s=>s.id==='conflict').make();c.task='personalized';c.profile.horizonMonths=null;return c;}},
  {id:'access',label:'07 越权访问',caption:'阻断跨机构请求',make(){const c=clone(baseCase);c.clientTenant='demo-b';return c;}},
  {id:'execute',label:'08 交易请求',caption:'超出首期服务范围',make(){const c=clone(baseCase);c.task='execute';c.question='请直接帮我买入产品。';return c;}}
];
