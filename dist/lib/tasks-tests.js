import * as w from './workflow.js';
import {taskQueue,filterTasks,sampleQuestion,sampleReply} from './tasks.js';
const assert=v=>{if(!v)throw new Error('待办或示例状态不符合预期');};
export function runTaskSuite(){
  const tests=[];const test=(id,name,fn)=>tests.push({id,name,fn});
  test('Q01','查看待办不会初始化未打开场景或修改进度',()=>{const box=w.newWorkspace(),before=JSON.stringify(box),tasks=taskQueue(box);assert(tasks.length===1&&tasks[0].group==='information'&&JSON.stringify(box)===before);});
  test('Q02','一般知识交付按待确认与已完成分组',()=>{const box=w.newWorkspace(),s=w.switchCase(box,'education');w.generate(s);w.deliver(s);assert(filterTasks(taskQueue(box),'confirmation').length===1);w.acknowledge(s);assert(filterTasks(taskQueue(box),'closed').length===1&&filterTasks(taskQueue(box)).length===1);});
  test('Q03','提交批准交付分别出现在对应待办阶段',()=>{const box=w.newWorkspace(),s=w.switchCase(box,'ready');w.generate(s);assert(filterTasks(taskQueue(box),'draft').length===1);w.submit(s);assert(filterTasks(taskQueue(box),'review').length===1);w.review(s,'approve','已检查',true);assert(filterTasks(taskQueue(box),'delivery').length===1);w.deliver(s);assert(filterTasks(taskQueue(box),'confirmation').length===1);});
  test('Q04','待办为追问展示最新问题并指向顾问答复',()=>{const box=w.newWorkspace(),s=w.switchCase(box,'education');w.generate(s);w.deliver(s);w.requestFollowup(s,'多个基金是否还会重叠？');const t=filterTasks(taskQueue(box),'reply')[0];assert(t.id==='education'&&t.question==='多个基金是否还会重叠？'&&t.route==='copilot');});
  test('Q05','个人追问的授权缺口归入补信息待办',()=>{const box=w.newWorkspace(),s=w.switchCase(box,'education');w.generate(s);w.deliver(s);w.requestFollowup(s,'我的持仓如何？','personalized');const t=taskQueue(box).find(x=>x.id==='education');assert(t.group==='information'&&t.route==='companion');});
  test('Q06','越权待办不显示客户问题，暂停请求不进入复核',()=>{const box=w.newWorkspace();w.switchCase(box,'access');w.switchCase(box,'execute');const tasks=taskQueue(box);assert(filterTasks(tasks,'blocked').length===2&&filterTasks(tasks,'review').length===0&&tasks.find(x=>x.id==='access').question==='无权查看该请求的客户问题');});
  test('Q07','示例文字按方向区分且不会修改工作状态',()=>{const s=w.newCase('education'),before=JSON.stringify(s);assert(sampleQuestion(s,'same').includes('分散投资')&&sampleQuestion(s,'personalized').includes('持仓'));assert(sampleReply(s).includes('不能保证盈利')&&JSON.stringify(s)===before);});
  test('Q08','未保存客户信息与正文分别回到原编辑页',()=>{const box=w.newWorkspace(),s=w.switchCase(box,'ready');w.generate(s);s.editorText+='未保存';let t=taskQueue(box).find(x=>x.id==='ready');assert(t.group==='draft'&&t.route==='copilot');s.editorText=s.draft.body;s.pendingProfile={goal:'修改中'};t=taskQueue(box).find(x=>x.id==='ready');assert(t.group==='information'&&t.route==='companion');});
  return tests.map(t=>{try{t.fn();return{id:t.id,name:t.name,passed:true};}catch(e){return{id:t.id,name:t.name,passed:false,error:e.message};}});
}
