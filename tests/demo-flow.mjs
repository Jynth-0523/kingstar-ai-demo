// Source-level DOM simulation only. This is not a live browser or visual QA test.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const staticNodes=new Map(),dynamicNodes=new Map();let nodes=[],lastDownload=null,printed=0;
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function attributes(source){const attrs={};for(const a of source.matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=decode(a[2]??'');return attrs;}
class Element {
  constructor(attrs={}){Object.assign(this,{attrs,value:attrs.value??'',checked:Object.hasOwn(attrs,'checked'),disabled:Object.hasOwn(attrs,'disabled'),hidden:Object.hasOwn(attrs,'hidden'),textContent:'',dataset:{},classList:{add(){},remove(){}}});for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;}
  set innerHTML(html){this.html=html;if(this===staticNodes.get('main')){dynamicNodes.clear();nodes=[];for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){const attrs=attributes(match[2]),node=new Element(attrs),tail=html.slice(match.index+match[0].length);if(match[1]==='textarea')node.value=decode(tail.split('</textarea>')[0]);if(match[1]==='select'){const options=[...tail.split('</select>')[0].matchAll(/<option([^>]*)>([^<]*)<\/option>/g)],option=options.find(o=>o[1].includes('selected'))??options[0];if(option)node.value=attributes(option[1]).value??decode(option[2]);}if(match[1]==='form')node.formHtml=tail.split('</form>')[0];nodes.push(node);if(attrs.id)dynamicNodes.set(attrs.id,node);}}}
  get innerHTML(){return this.html??'';}
  click(){assert(!this.disabled,'不能点击禁用的按钮');if(this.download)lastDownload={name:this.download,blob:blobs.get(this.href)};else this.onclick?.();}
}
for(const id of ['main','navigation','view-title','toast','reset','start-tour','save-indicator'])staticNodes.set(id,new Element());
const blobs=new Map();URL.createObjectURL=b=>{const id='blob:test-'+blobs.size;blobs.set(id,b);return id;};URL.revokeObjectURL=()=>{};
globalThis.document={querySelector:s=>staticNodes.get(s.slice(1))??dynamicNodes.get(s.slice(1))??null,querySelectorAll:s=>nodes.filter(n=>Object.hasOwn(n.attrs,s.slice(1,-1))),createElement:()=>new Element()};
let routeHash='#overview';globalThis.location={get hash(){return routeHash;},set hash(v){routeHash=v.startsWith('#')?v:'#'+v;}};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const listeners={};globalThis.window={addEventListener:(k,f)=>listeners[k]=f,scrollTo(){},print(){printed++;},setTimeout:()=>0};
globalThis.FormData=class {constructor(form){this.values=form.values??{};if(!form.values){for(const m of (form.formHtml??'').matchAll(/<input\b([^>]*)>/g)){const a=attributes(m[1]);if(a.name&&(a.type!=='checkbox'||Object.hasOwn(a,'checked')))this.values[a.name]=a.value??'on';}for(const m of (form.formHtml??'').matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)){const a=attributes(m[1]),options=[...m[2].matchAll(/<option([^>]*)>([^<]*)<\/option>/g)],o=options.find(x=>x[1].includes('selected'))??options[0];if(a.name&&o){const v=attributes(o[1]);this.values[a.name]=v.value??decode(o[2]);}}}}get(k){return this.values[k]??'';}has(k){return Object.hasOwn(this.values,k);}};
await import('../dist/app.js');
const el=id=>document.querySelector('#'+id),click=id=>{assert(el(id),`缺少 ${id}`);el(id).click();},html=()=>el('main').innerHTML;
const nav=route=>{location.hash=route;listeners.hashchange();};
const checks=[];const check=(name,fn)=>{fn();checks.push({name,passed:true});};
click('start-tour');check('导览先阻断缺失期限',()=>{assert.equal(location.hash,'#companion');assert(el('tour-next').disabled);});
el('profile-form').values={goal:'两年内保持灵活性',horizonMonths:'24',liquidityMonths:'6',riskCapacity:'15',lockMonths:'0',riskPreference:'中等',consent:'on'};
el('profile-form').onsubmit({preventDefault(){}});check('保存客户信息后可以进入证据步骤',()=>assert(!el('tour-next').disabled));
click('tour-next');check('费用结果和引用出现在证据页',()=>{assert.equal(location.hash,'#evidence');assert(html().includes('¥300')&&html().includes('¥800')&&html().includes('¥500'));});
el('fee-form').values={principal:'50000',months:'6'};el('fee-form').onsubmit({preventDefault(){}});check('金额和期限更新重新计算',()=>assert(html().includes('¥75')&&html().includes('¥200')&&html().includes('¥125')));
click('tour-next');check('生成草稿后须先提交',()=>{assert.equal(location.hash,'#copilot');assert(el('approve').disabled&&!el('submit').disabled);});
click('submit');check('提交后允许复核',()=>assert(!el('approve').disabled&&!el('return-draft').disabled));
click('approve');check('缺少复核意见显示持续提示并保留已提交草稿',()=>{assert.equal(el('action-error').hidden,false);assert(el('action-error').textContent.includes('复核意见'));assert(el('draft-body'));});
el('review-note').value='请明确近期用钱金额尚待确认。';click('return-draft');check('退回意见可见，禁止原样重提',()=>{assert(html().includes('退回意见')&&html().includes('近期用钱金额'));assert(el('submit').disabled);});
el('draft-body').value+='\n补充：近期用钱金额仍需确认。';el('draft-body').oninput();check('未保存修改阻断提交',()=>assert(el('submit').disabled));
click('save-draft');click('submit');el('review-check').checked=true;el('review-note').value='已核对客户目标、资料引用与待确认事项。';click('approve');check('修改重提后可审批',()=>assert(!el('tour-next').disabled));
click('tour-next');check('交付后转到客户确认',()=>{assert.equal(location.hash,'#companion');assert(el('acknowledge')&&!el('acknowledge').disabled);assert(html().includes('待客户确认'));});
click('acknowledge');check('客户确认后案例完成',()=>{assert.equal(location.hash,'#delivery');assert(html().includes('本案例已完成')&&html().includes('客户已确认阅读'));});
click('export-report');const downloaded=await lastDownload.blob.text();check('导出固定版本的自包含报告',()=>{assert.equal(lastDownload.name,'kingstar-client-report.html');assert(downloaded.includes('<!doctype html>')&&downloaded.includes('已核对客户目标'));assert(!downloaded.includes('<script'));});
click('print-report');check('打印入口可用',()=>assert.equal(printed,1));
click('tour-next');check('切换冲突场景暂停测算',()=>{assert.equal(location.hash,'#evidence');assert(html().includes('已暂停')&&!el('fee-form'));});
click('restore-evidence');check('恢复资料后可再次计算',()=>assert(el('fee-form')));click('tour-next');check('完成导览退出提示',()=>assert(!el('tour-next')));
el('scenario').onchange({target:{value:'missing'}});nav('delivery');check('切回场景恢复已确认报告',()=>assert(html().includes('客户已确认阅读')&&html().includes('V2')));
nav('evidence');click('change-version');check('版本变化明确显示草稿失效',()=>assert(html().includes('草稿需要更新')));nav('delivery');check('旧报告作为历史记录保留',()=>assert(html().includes('历史版本')&&document.querySelectorAll('[data-export-history]').length===1));
nav('copilot');check('失效草稿不能提交或批准',()=>assert(el('submit').disabled&&el('approve').disabled));click('generate');check('重新生成版本递增',()=>assert(html().includes('V3')));
const savedBody=el('draft-body').value;el('draft-body').value+='临时修改';el('draft-body').oninput();check('输入变化即时阻断提交并更新状态',()=>{assert(el('submit').disabled);assert.equal(el('flow-label').textContent,'有修改待保存');});
el('draft-body').value=savedBody;el('draft-body').oninput();check('改回原文后按钮和状态即时恢复',()=>{assert(!el('submit').disabled);assert.equal(el('flow-label').textContent,'草稿待提交');});
el('draft-body').value+='\n待保存的新说明';el('draft-body').oninput();nav('overview');nav('copilot');check('页面切换保留未保存正文',()=>assert(el('draft-body').value.includes('待保存的新说明')));
await import('../dist/app.js?reload');check('刷新后恢复未保存修改',()=>{assert(el('draft-body').value.includes('待保存的新说明'));assert(el('submit').disabled);});click('discard-draft');check('放弃修改后可继续提交',()=>assert(!el('submit').disabled));
click('reset');check('重置前解释清空范围',()=>assert(el('reset-confirm')&&html().includes('其他场景保持原状')));click('reset-cancel');check('取消重置保留草稿',()=>assert(el('draft-body')));
el('scenario').onchange({target:{value:'education'}});nav('companion');click('generate');check('一般解释直达客户，不进入人工复核',()=>{assert.equal(location.hash,'#companion');assert(el('acknowledge'));});click('acknowledge');check('一般解释也能确认并完成',()=>assert(html().includes('本案例已完成')));
nav('companion');click('request-followup');check('空追问显示提示且保留原交付',()=>{assert.equal(el('action-error').hidden,false);assert(el('action-error').textContent.includes('追问'));assert(el('acknowledge').disabled);});
el('followup-question').value='分散投资是否能够保证不亏损？';el('followup-question').oninput();nav('delivery');nav('companion');check('未发送追问在切换页面后保留',()=>assert(el('followup-question').value.includes('保证不亏损')));
click('request-followup');check('追问进入顾问待办并阻断旧稿交付',()=>{assert.equal(location.hash,'#copilot');assert(el('followup-reply'));assert(el('generate').disabled&&el('deliver').disabled);assert(html().includes('待顾问答复追问'));});
el('followup-reply').value='根据演示知识卡，分散投资降低对单一资产的依赖，但不能保证盈利或避免全部损失。';el('followup-reply').oninput();
await import('../dist/app.js?followup-reload');check('刷新恢复待答复追问和答复输入',()=>assert(el('followup-reply').value.includes('不能保证盈利')));
click('answer-followup');check('保存补充答复生成新版本',()=>{assert(html().includes('V2'));assert(el('draft-body').value.includes('客户补充问题：分散投资'));assert(!el('deliver').disabled);});
click('deliver');click('acknowledge');check('追问答复再次交付确认并保留两轮记录',()=>{assert(html().includes('本案例已完成'));assert.equal(document.querySelectorAll('[data-export-history]').length,2);});
check('页面报告与导出共用交付编号和客户确认信息',()=>assert(html().includes('交付记录：CASE-004-V2')&&html().includes('客户确认：')));
click('export-report');const followupReport=await lastDownload.blob.text();check('追问报告包含补充内容、交付编号和确认时间',()=>{assert(followupReport.includes('分散投资是否能够保证不亏损'));assert(followupReport.includes('顾问补充答复'));assert(followupReport.includes('CASE-004-V2'));assert(!followupReport.includes('尚未确认'));});
document.querySelectorAll('[data-export-history]')[1].click();const historicalReport=await lastDownload.blob.text();check('历史报告保持原始正文及当时回执',()=>{assert(historicalReport.includes('CASE-004-V1'));assert(!historicalReport.includes('客户补充问题'));assert(!historicalReport.includes('尚未确认'));});
nav('evidence');el('scenario').onchange({target:{value:'access'}});nav('companion');check('越权场景不展示客户信息表单',()=>assert(!el('profile-form')&&!html().includes('客户 001')));
for(const route of ['overview','companion','copilot','evidence','references','evaluation','delivery']){nav(route);assert(html().length>300);}check('七个页面均可渲染',()=>assert.equal(el('view-title').textContent,'项目交付'));
nav('evaluation');click('run-tests');check('页面验收运行 120 项检查',()=>assert(html().includes('120')));
const storageKey='kingstar-demo-workspace-v3',broken=JSON.parse(storage.get(storageKey));broken.active='ready';broken.cases.ready={};const brokenText=JSON.stringify(broken);storage.set(storageKey,brokenText);
await import('../dist/app.js?partial-recovery');check('部分进度损坏时提示恢复并保存原始备份',()=>{assert(html().includes('1 个损坏场景'));assert.equal(storage.get(storageKey+'-recovery-backup'),brokenText);});
click('recovery-download');const recoveryFile=await lastDownload.blob.text();check('恢复提示可下载未经改写的原始记录',()=>assert.equal(recoveryFile,brokenText));click('recovery-dismiss');
nav('companion');el('scenario').onchange({target:{value:'education'}});nav('delivery');check('恢复损坏场景不丢失其他已完成案例',()=>{assert(html().includes('本案例已完成'));assert.equal(document.querySelectorAll('[data-export-history]').length,2);});
const byData=(attribute,key)=>document.querySelectorAll('[data-'+attribute+']').find(e=>e.attrs['data-'+attribute]===key);
nav('overview');check('首页待办仅列出已打开且未完成的案例',()=>{assert(html().includes('顾问待办总览'));assert(!byData('task-row','education'));assert(!byData('task-row','expired'));});
byData('task-filter','closed').click();check('待办可以筛选已完成案例',()=>assert(byData('task-row','education')));byData('resume-case','education').click();check('已完成待办直达当前交付报告',()=>{assert.equal(location.hash,'#delivery');assert(html().includes('CASE-004-V2'));});
nav('companion');el('followup-kind').value='personalized';el('followup-kind').onchange();click('sample-question');check('示例追问按个人方向填入且尚未提交',()=>{assert(el('followup-question').value.includes('现有持仓'));assert(el('request-followup'));assert(el('acknowledge').disabled);assert(el('sample-question').disabled);});
nav('delivery');nav('companion');check('追问方向和示例输入切页后保留',()=>{assert.equal(el('followup-kind').value,'personalized');assert(el('followup-question').value.includes('六个月'));});
click('request-followup');check('个人追问先回到授权与客户信息',()=>{assert.equal(location.hash,'#companion');assert(el('profile-form'));assert(html().includes('已转为个人情况'));assert(!el('acknowledge'));});
click('sample-profile');check('示例客户信息待保存且不会自动勾选授权',()=>{assert(html().includes('有客户信息修改待保存'));assert(!new FormData(el('profile-form')).has('consent'));});
el('profile-form').values={goal:'两年内保持资金使用灵活性',horizonMonths:'24',liquidityMonths:'6',riskCapacity:'15',lockMonths:'0',riskPreference:'中等',consent:'on'};el('profile-form').onsubmit({preventDefault(){}});click('refresh-holdings');
check('补齐个人信息和持仓后要求核对产品资料',()=>assert(html().includes('待核对资料')));click('flow-action');check('下一步进入证据中心',()=>assert.equal(location.hash,'#evidence'));click('restore-evidence');
nav('overview');byData('task-filter','reply').click();check('最新追问列入待答复并显示个人问题',()=>{assert(byData('task-row','education'));assert(html().includes('讨论现有持仓'));});byData('resume-case','education').click();check('待答复入口返回顾问工作台',()=>{assert.equal(location.hash,'#copilot');assert(el('followup-reply'));});
click('sample-reply');check('示例答复仅填入文字，保留保存和复核步骤',()=>{assert(el('followup-reply').value.includes('到账时间'));assert(el('submit').disabled);assert(el('sample-reply').disabled);});
click('answer-followup');check('个人追问答复生成新稿但禁止直接交付',()=>{assert(el('draft-body').value.includes('顾问补充答复'));assert(!el('submit').disabled&&el('deliver').disabled);});click('submit');
nav('overview');byData('task-filter','review').click();check('提交后出现在待复核列表',()=>assert(byData('task-row','education')));byData('resume-case','education').click();el('review-note').value='已确认新追问属于个人情况，并核对授权、资料与答复边界。';el('review-check').checked=true;click('approve');click('deliver');
nav('overview');byData('task-filter','confirmation').click();check('获批交付后出现在待客户确认列表',()=>assert(byData('task-row','education')));byData('resume-case','education').click();click('acknowledge');
check('个人追问完成闭环且三轮报告都可追溯',()=>{assert(html().includes('本案例已完成'));assert.equal(document.querySelectorAll('[data-export-history]').length,3);assert(html().includes('CASE-004-V3'));});
click('export-report');const escalatedReport=await lastDownload.blob.text();check('新版报告对应本轮个人问题并保留初始问题及复核记录',()=>{assert(escalatedReport.includes('讨论现有持仓'));assert(escalatedReport.includes('初始问题：什么是分散投资'));assert(escalatedReport.includes('已确认新追问属于个人情况'));});
nav('overview');byData('task-filter','open').click();check('完成的个人追问退出开放待办',()=>assert(!byData('task-row','education')));
const result={timestamp:new Date().toISOString(),mode:'Node source-level DOM simulation; no live-browser or visual assertions',passed:checks.length,checks};await writeFile('artifacts/demo-flow-results.json',JSON.stringify(result,null,2));console.log(`${checks.length}/${checks.length} interaction checks passed (DOM simulation).`);
