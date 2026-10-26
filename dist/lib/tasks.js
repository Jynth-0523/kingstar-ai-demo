import {scenarios} from './fixtures.js';
import {flow} from './workflow.js';

export const taskGroups=[
  ['open','全部待办'],['information','待补信息'],['evidence','待核资料'],
  ['reply','待答复'],['draft','待起草 / 修改'],['review','待复核'],
  ['delivery','待交付'],['confirmation','待客户确认'],['blocked','已暂停'],['closed','已完成']
];

function groupFor(s,f){
  if(f.id==='blocked')return f.decision.reasons.some(r=>r.code==='CONSENT_REQUIRED')?'information':'blocked';
  if(f.id==='unsaved')return s.pendingProfile?'information':'draft';
  return {context:'information',evidence:'evidence',followup:'reply',ready:'draft',stale:'draft',editing:'draft',returned:'draft',submitted:'review',approved:'delivery',delivered:'confirmation',closed:'closed'}[f.id]??'blocked';
}

// A projection of existing cases: viewing a queue never starts or mutates a case.
export function taskQueue(workspace){
  return scenarios.filter(x=>workspace.cases[x.id]).map(scenario=>{
    const s=workspace.cases[scenario.id],f=flow(s),restricted=f.decision.reasons.some(r=>r.code==='ACCESS_DENIED');
    return {id:scenario.id,caseId:s.case.id,title:scenario.label,question:restricted?'无权查看该请求的客户问题':s.case.followup?.question??s.case.question,
      group:groupFor(s,f),status:f.id,label:f.label,description:f.description,route:f.route,button:f.button,
      version:s.draft?.version??null};
  });
}

export function filterTasks(tasks,group='open'){
  return group==='open'?tasks.filter(t=>t.group!=='closed'):tasks.filter(t=>t.group===group);
}

export function sampleQuestion(s,kind=s.followupKind){
  if(kind==='personalized'||['personalized','portfolio'].includes(s.case.task))return '我六个月后可能需要一笔钱，讨论现有持仓前，还需要确认哪些个人信息和资金安排？';
  if(s.case.task==='education')return '分散投资是否能保证不亏损？持有多个基金还需要注意什么？';
  return '除了管理费，比较这两项产品时还应核对哪些费用和条件？';
}

export function sampleReply(s){
  if(['personalized','portfolio'].includes(s.case.task))return '结合本次已确认的合成资料，仍需确认六个月后用钱的具体金额、独立应急储备，以及产品赎回限制和到账时间。目前只能解释持仓结构与已知管理费，尚不能判断资金安排是否足够或产品是否适合。补齐这些信息后，再由顾问复核。';
  if(s.case.task==='education')return '根据演示知识卡，分散投资可以降低对单一资产的依赖，但不能保证盈利或避免全部损失。持有多个基金还应核对底层资产是否重叠；涉及个人资金安排时，需要转入个人情况流程。';
  return '当前资料只包含年管理费率，还需核对申购、赎回、托管和销售服务等费用，并确认风险、赎回限制与到账时间。不同类型产品不能仅按管理费高低作选择。';
}
