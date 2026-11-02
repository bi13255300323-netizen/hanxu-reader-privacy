'use strict';
let paused=false;
const element=id=>document.querySelector('#'+id);
const stages={starting:'等待首次读取','document-wait':'等待页面加载','config':'连接本机客户端','config-unavailable':'本机客户端未连接',paused:'已暂停','user-active':'正在操作网页，稍后读取','business-flow':'读取昨日流量与成交','business-refund':'读取昨日退款','checking-page':'检查页面状态',identity:'核对店铺身份',home:'读取首页昨日指标',status:'提交页面状态',stabilizing:'等待指标稳定',capture:'核验保存',complete:'本次已提交',unchanged:'指标未变化',quiet:'等待页面更新','waiting-page':'等待商家首页','waiting-date':'等待首页昨日指标','waiting-refresh':'首页已跨日，等待手动刷新','signed-out':'等待登录',challenge:'等待人工验证',mismatch:'店铺身份未匹配','page-changed':'页面状态已变化',rejected:'数据未通过核验',error:'读取出错'};
const reportMessages={complete:'已独立提交保存','not-ready':'平台昨日报表尚未就绪',auth:'登录失效，读取已停止',identity:'店铺身份不一致，未保存',digits:'数字格式无法核验，未保存',date:'日期未核对，未保存',save:'本机核验未通过，未保存'};
async function load(){
 const config=await chrome.runtime.sendMessage({kind:'config'}),summary=await chrome.runtime.sendMessage({kind:'summary'});
 element('store').textContent=config.ok?config.config.name:config.error;
 paused=!!summary.paused;
 const date=new Date(Date.now()+8*3600000-86400000).toISOString().slice(0,10);
 element('business-api').textContent=paused?'经营自动读取已暂停。':[['flow','流量与成交'],['refund','退款汇总']].map(([kind,label])=>{
  const local=summary.businessReports?.[kind],report=local?.date===date?local:config.config?.reportStops?.[kind];
  return label+'：'+(report?.state==='running'?'正在读取':report?reportMessages[report.code]||'本日读取已停止':'等待读取');
 }).join('；')+'。各份报表独立保存。';
 element('toggle').disabled=false;element('toggle').textContent=paused?'恢复页面读取':'暂停读取';
}
async function pageDiagnostics(){
 const version=chrome.runtime.getManifest().version;
 element('connect').hidden=true;element('diagnostics').textContent='';
 element('status').textContent=paused?'读取已暂停。':'正在检查商家页面。';
 let phase='query-tab';
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!Number.isInteger(tab?.id))throw Error('No tab');
  let merchant=false;try{merchant=new URL(tab.url).origin==='https://mms.pinduoduo.com';}catch{}
  element('business-api').hidden=!merchant;
  if(!merchant){element('status').textContent='当前页面不在经营采集范围内，请回到商家首页。';element('connection').textContent='扩展 '+version+' · 仅连接商家经营页面。';return;}
  phase='send-message';
  const result=await chrome.tabs.sendMessage(tab.id,{kind:'page-diagnostics'},{frameId:0});
  phase='response';if(!result?.ok)throw Error('No reply');
  const report=result.report,diagnostics=report?.diagnostics,receipt=report?.receipt;
  element('status').textContent=paused?'读取已暂停。':receipt?.message||({'signed-out':'请在官方页面登录店铺',challenge:'页面需要人工验证，读取已停止',mismatch:'页面店铺与本机资料不一致，未读取','waiting-refresh':'首页已跨日，请方便时手动刷新'}[report?.state])||'当前页面已连接，经营数据会自动核验保存。';
  if(diagnostics)element('diagnostics').textContent='当前页面识别：'+(diagnostics.datedPairCount||0)+' 项首页昨日指标。'+(diagnostics.dates?.length?'日期：'+diagnostics.dates.join('、')+'。':'');
  const stage=stages[result.stage]||'等待页面状态',age=Math.max(0,Math.floor((Date.now()-result.stageAt)/1000));
  element('connection').textContent='扩展 '+version+' · 当前页面已连接。读取阶段：'+stage+'（'+age+' 秒前）。';
  if(result.error){const code=['ReferenceError','TypeError','RangeError','SyntaxError','SecurityError','InvalidStateError','ReadError'].includes(result.error.code)?result.error.code:'ReadError';element('status').textContent='当前页面读取出错：'+(stages[result.error.stage]||'读取')+' / '+code+'。';}
 }catch(error){
  const code=phase==='query-tab'?'NO-TAB':/Receiving end does not exist/i.test(String(error?.message||''))?'NO-SCRIPT':phase==='response'?'NO-REPLY':'MESSAGE-ERROR';
  element('status').textContent={'NO-TAB':'无法确定当前标签页','NO-SCRIPT':'Chrome 未找到当前网页的读取组件','NO-REPLY':'读取组件没有返回状态','MESSAGE-ERROR':'Chrome 消息调用失败'}[code]+'。';
  element('connection').textContent='扩展 '+version+' · '+code+'（'+phase+'）。';element('connect').hidden=code!=='NO-SCRIPT';
 }
}
element('toggle').addEventListener('click',async()=>{await chrome.runtime.sendMessage({kind:'pause',paused:!paused});await load();await pageDiagnostics();});
element('connect').addEventListener('click',async()=>{
 const button=element('connect');button.disabled=true;
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const result=await chrome.runtime.sendMessage({kind:'connect-page',tabId:tab?.id});if(result?.ok)await pageDiagnostics();else element('status').textContent=result?.error||'连接未成功';}
 catch{element('status').textContent='连接未成功，请重新打开扩展';}finally{button.disabled=false;}
});
load().catch(()=>{element('status').textContent='请重新打开扩展';}).then(pageDiagnostics);