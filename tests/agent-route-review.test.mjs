import test from 'node:test';
import assert from 'node:assert/strict';
import {GiftAgentError} from '../server/gift-agent.mjs';
import {createAgentHandler,gatewayToken} from '../server/agent-api.mjs';

// These are synthetic route calls. No model, Shop service, credential service,
// or other external destination is contacted.
const input=()=>({consent:true,likes:'They enjoy ocean walks.',dislikes:'silk',occasion:'Birthday',budget:75,query:'ocean gifts',excludedFactors:['fragrance']});
const configured={AI_GATEWAY_API_KEY:'SYNTHETIC_TEST_TOKEN',AI_GATEWAY_MODEL:'openai/gpt-4.1-mini'};
async function invoke(handler,body=input(),{method='POST',headers={}}={}){
  const req={method,body,headers:{host:'gift.example.org',origin:'https://gift.example.org','content-type':'application/json',...headers},socket:{remoteAddress:'203.0.113.25'}};
  let text;const responseHeaders={};const res={statusCode:200,setHeader(k,v){responseHeaders[k.toLowerCase()]=v;},end(value){text=value;}};
  await handler(req,res);return {status:res.statusCode,body:JSON.parse(text),text,headers:responseHeaders};
}

test('Agent route review: configuration read is honest and performs no model call',async()=>{
  let calls=0;const handler=createAgentHandler({env:configured,runAgent:async()=>{calls++;}});
  const r=await invoke(handler,undefined,{method:'GET'});
  assert.equal(calls,0);assert.equal(r.body.configured,true);assert.equal(r.body.modelConnected,false);
  assert.equal(r.body.model,'openai/gpt-4.1-mini');assert.doesNotMatch(r.text,/SYNTHETIC_TEST_TOKEN/);
});

test('Agent route review: missing consent and forbidden identity/model fields never reach core',async()=>{
  let calls=0;const handler=createAgentHandler({env:configured,runAgent:async()=>{calls++;}});
  for(const patch of [{consent:false},{consent:undefined},{recipient:'Private Name'},{relationship:'Friend'},{model:'evil/override'}]){
    const r=await invoke(handler,{...input(),...patch});assert.equal(r.status,400);
  }
  assert.equal(calls,0);
});

test('Agent route review: missing token and client-supplied local OIDC cannot authorize a model call',async()=>{
  let calls=0;const handler=createAgentHandler({env:{},runAgent:async()=>{calls++;}});
  const r=await invoke(handler,input(),{headers:{'x-vercel-oidc-token':'UNTRUSTED_CLIENT_TOKEN'}});
  assert.equal(r.status,503);assert.equal(r.body.error.code,'MODEL_NOT_CONFIGURED');assert.equal(calls,0);
  assert.equal(gatewayToken({headers:{'x-vercel-oidc-token':'UNTRUSTED_CLIENT_TOKEN'}},{}),null);
});

test('Agent route review: origin, content type, method and body-size gates precede model core',async()=>{
  let calls=0;const handler=createAgentHandler({env:configured,runAgent:async()=>{calls++;}});
  for(const [body,options,status] of [
    [input(),{headers:{origin:'https://other.example.org'}},403],
    [input(),{headers:{'content-type':'text/plain'}},415],
    [input(),{method:'PUT'},405],
    [{...input(),likes:'x'.repeat(17000)},{},413],
  ])assert.equal((await invoke(handler,body,options)).status,status);
  assert.equal(calls,0);
});

test('Agent route review: exact configured model reaches core and only consented fields are forwarded',async()=>{
  let observed;const handler=createAgentHandler({env:configured,runAgent:async(body,options)=>{observed={body,model:options.model,token:await options.getToken()};return {model:options.model,modelConnected:true,recommendations:[],products:[]};}});
  const r=await invoke(handler);
  assert.equal(r.status,200);assert.equal(observed.model,'openai/gpt-4.1-mini');assert.equal(observed.token,'SYNTHETIC_TEST_TOKEN');
  const {consent,...expected}=input();assert.deepEqual(observed.body,expected);assert.doesNotMatch(r.text,/SYNTHETIC_TEST_TOKEN/);
});

test('Agent route review: rate cap and concurrency cap prevent excess model calls',async()=>{
  let calls=0;const handler=createAgentHandler({env:configured,limit:2,runAgent:async()=>{calls++;return {modelConnected:true};}});
  assert.equal((await invoke(handler)).status,200);assert.equal((await invoke(handler)).status,200);
  assert.equal((await invoke(handler)).status,429);assert.equal(calls,2);
  const pending=[];let activeCalls=0;const concurrent=createAgentHandler({env:configured,limit:10,runAgent:()=>{activeCalls++;return new Promise(resolve=>pending.push(resolve));}});
  const a=invoke(concurrent),b=invoke(concurrent);await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await invoke(concurrent)).status,429);assert.equal(activeCalls,2);
  for(const resolve of pending)resolve({modelConnected:true});await Promise.all([a,b]);
});

test('Agent route review: upstream failures expose no token, private payload or false AI result',async()=>{
  const handler=createAgentHandler({env:configured,runAgent:async()=>{throw new Error('SYNTHETIC_TEST_TOKEN private payload');}});
  const r=await invoke(handler);assert.equal(r.status,502);assert.equal(r.body.error.code,'AGENT_UNAVAILABLE');
  assert.doesNotMatch(r.text,/SYNTHETIC_TEST_TOKEN|private payload/);assert.equal(r.body.modelConnected,undefined);
});

test('Agent route review: development and local hosts never authorize request-header OIDC',()=>{
 for(const [host,env] of [['localhost:4173',{VERCEL:'1',VERCEL_ENV:'development'}],['localhost:4173',{VERCEL:'1',VERCEL_ENV:'production'}],['127.0.0.1',{VERCEL:'1',VERCEL_ENV:'production'}],['gift.local',{VERCEL:'1',VERCEL_ENV:'production'}],['gift.vercel.app',{VERCEL:'1',VERCEL_ENV:'development'}]])assert.equal(gatewayToken({headers:{host,'x-vercel-oidc-token':'CLIENT_TOKEN'}},env),null);
 assert.equal(gatewayToken({headers:{host:'gift.vercel.app','x-vercel-oidc-token':'UNVERIFIED_HEADER_TOKEN'}},{VERCEL:'1',VERCEL_ENV:'production'}),null);
});

test('Agent route diagnostic: trusted codes and stage are shown without mutable error messages',async()=>{
 const handler=createAgentHandler({env:configured,runAgent:async()=>{const e=new GiftAgentError('AGENT_AUTH');e.stage='model';e.message='SYNTHETIC_TEST_TOKEN private prompt';throw e;}});const r=await invoke(handler);assert.equal(r.body.error.code,'AGENT_AUTH');assert.equal(r.body.error.stage,'model');assert.match(r.body.error.message,/Gateway rejected/);assert.doesNotMatch(r.text,/SYNTHETIC_TEST_TOKEN|private prompt/);
});

test('Agent route review: only a boolean selfGift context crosses the route, never identity',async()=>{
 const seen=[];const handler=createAgentHandler({env:configured,runAgent:async input=>{seen.push(input);return {recommendations:[]};}});
 assert.equal((await invoke(handler,{...input(),selfGift:true,likes:'I enjoy ocean walks.'})).status,200);
 assert.equal(seen[0].selfGift,true);assert.equal(Object.hasOwn(seen[0],'recipient'),false);assert.equal(Object.hasOwn(seen[0],'relationship'),false);
 for(const selfGift of ['true',1,null,{}])assert.equal((await invoke(handler,{...input(),selfGift})).status,400);
 assert.equal(seen.length,1);
});


test('Agent diagnostic: only allowlisted argument reasons can leave the route',async()=>{
 for(const [argumentIssue,expected] of [['unobserved_product','unobserved_product'],['malformed_json','malformed_json'],['SYNTHETIC_TEST_TOKEN private prompt',undefined]]){
  const handler=createAgentHandler({env:configured,runAgent:async()=>{const e=new GiftAgentError('AGENT_INVALID_RESPONSE');e.stage='tool_arguments';e.argumentIssue=argumentIssue;throw e;}});const r=await invoke(handler);assert.equal(r.body.error.argumentIssue,expected);assert.doesNotMatch(r.text,/SYNTHETIC_TEST_TOKEN|private prompt/);
 }
});

test('Agent route review: generic adult context is allowed but identity and invalid audience remain blocked',async()=>{
 let seen;const handler=createAgentHandler({env:configured,runAgent:async input=>{seen=input;return {recommendations:[]};}});
 assert.equal((await invoke(handler,{...input(),audience:'men',ageBand:'30-44'})).status,200);
 assert.equal(seen.audience,'men');assert.equal(seen.ageBand,'30-44');assert.equal(Object.hasOwn(seen,'recipient'),false);
 for(const delta of [{audience:'boys'},{ageBand:'under18'},{age:35},{gender:'male'},{audience:{name:'private'}}])assert.equal((await invoke(handler,{...input(),...delta})).status,400);
});
