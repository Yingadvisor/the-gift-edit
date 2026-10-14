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
