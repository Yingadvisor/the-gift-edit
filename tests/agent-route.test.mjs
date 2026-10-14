import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentHandler} from '../server/agent-api.mjs';
const input={consent:true,likes:'They enjoy coffee.',query:'coffee gifts',budget:100,expression:'Courage and new beginnings'};
async function invoke(handler,body){let result;const req={method:'POST',body,headers:{host:'gift.example.org',origin:'https://gift.example.org','content-type':'application/json'},socket:{remoteAddress:'203.0.113.44'}};const res={statusCode:200,setHeader(){},end(text){result={status:this.statusCode,body:JSON.parse(text)};}};await handler(req,res);return result;}
test('expression route accepts semantic text, rejects wrong types and identity fields',async()=>{
 const calls=[];const handler=createAgentHandler({env:{AI_GATEWAY_API_KEY:'SYNTHETIC_TEST_TOKEN'},runAgent:async value=>{calls.push(value);return {recommendations:[]};}});
 assert.equal((await invoke(handler,input)).status,200);assert.equal(calls[0].expression,input.expression);assert.equal(Object.hasOwn(calls[0],'recipient'),false);
 for(const expression of [null,1,{},'x'.repeat(401)])assert.equal((await invoke(handler,{...input,expression})).status,400);
 assert.equal((await invoke(handler,{...input,recipient:'Private Name'})).status,400);assert.equal(calls.length,1);
});
test('style/lifestyle route validates generic enums independently of audience',async()=>{
 const calls=[];const handler=createAgentHandler({env:{AI_GATEWAY_API_KEY:'SYNTHETIC_TEST_TOKEN'},runAgent:async value=>{calls.push(value);return {recommendations:[]};}});
 assert.equal((await invoke(handler,{...input,style:'natural',lifestyle:'public-service',audience:'any'})).status,200);assert.equal(calls[0].style,'natural');assert.equal(calls[0].lifestyle,'public-service');
 for(const patch of [{style:'men'},{lifestyle:'women'},{lifestyle:123}])assert.equal((await invoke(handler,{...input,...patch})).status,400);
 assert.equal(calls.length,1);
});
test('limit diagnostics expose only allowlisted reason and recovery stays explicitly non-AI',async()=>{
 const {GiftAgentError}=await import('../server/gift-agent.mjs');
 for(const [reason,expected] of [['oversized_batch','oversized_batch'],['PRIVATE_PROVIDER',undefined]]){
  const handler=createAgentHandler({env:{AI_GATEWAY_API_KEY:'SYNTHETIC_TEST_TOKEN'},runAgent:async()=>{const e=new GiftAgentError('AGENT_LIMIT');e.stage='tool_arguments';e.limitReason=reason;throw e;}});
  const out=await invoke(handler,input);assert.equal(out.body.error.limitReason,expected);assert.doesNotMatch(JSON.stringify(out),/PRIVATE_PROVIDER/);
 }
 const handler=createAgentHandler({env:{AI_GATEWAY_API_KEY:'SYNTHETIC_TEST_TOKEN'},runAgent:async()=>({modelConnected:false,recommendations:[],products:[],recovery:{mode:'rules',code:'AGENT_LIMIT',stage:'tool_arguments',limitReason:'oversized_batch',observedCount:1,refreshedCount:0}})});
 const out=await invoke(handler,input);assert.equal(out.status,200);assert.equal(out.body.modelConnected,false);assert.equal(out.body.recovery.mode,'rules');
});
test('final diagnostics expose only static allowlisted subreasons',async()=>{
 const {GiftAgentError}=await import('../server/gift-agent.mjs');for(const issue of ['unobserved_product','duplicate_product','malformed_json','PRIVATE_PROVIDER_TOKEN']){const handler=createAgentHandler({env:{AI_GATEWAY_API_KEY:'SYNTHETIC'},runAgent:async()=>{const e=new GiftAgentError('AGENT_INVALID_RESPONSE');e.stage='recommendation_validation';e.finalIssue=issue;throw e;}});const out=await invoke(handler,input);assert.equal(out.body.error.finalIssue,issue==='PRIVATE_PROVIDER_TOKEN'?undefined:issue);assert.doesNotMatch(JSON.stringify(out),/PRIVATE_PROVIDER_TOKEN/);}
});
