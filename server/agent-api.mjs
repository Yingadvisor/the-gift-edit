import {createHmac,randomBytes} from 'node:crypto';
import {assertRequestHeaders,readBody} from './shop-api.mjs';
import {runGiftAgent} from './gift-agent.mjs';

const DEFAULT_MODEL='openai/gpt-4.1-mini';
// Existing configured credentials only. Never create, persist, return or log tokens.
export function gatewayToken(req,env=process.env){
  if(typeof env.AI_GATEWAY_API_KEY==='string'&&env.AI_GATEWAY_API_KEY.trim())return env.AI_GATEWAY_API_KEY;
  // Do not authenticate from raw incoming request headers. This plain Node
  // runtime has not established trusted request-context OIDC provenance.
  // Explicit server-managed OIDC may expire; no refresh behavior is implied.
  if(typeof env.VERCEL_OIDC_TOKEN==='string'&&env.VERCEL_OIDC_TOKEN.trim())return env.VERCEL_OIDC_TOKEN;
  return null;
}
export function createAgentHandler({runAgent=runGiftAgent,env=process.env,now=()=>Date.now(),limit=3,windowMs=60000}={}){
  const secret=randomBytes(32);const rates=new Map();let active=0;
  return async(req,res)=>{
    const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));};
    const model=env.AI_GATEWAY_MODEL||DEFAULT_MODEL;
    try{
      if(req.method==='GET')return send(200,{configured:Boolean(gatewayToken(req,env)),provider:'Vercel AI Gateway',model,modelConnected:false,disclosure:'Configuration presence is not a successful model connection. A user-requested model run must succeed first.'});
      assertRequestHeaders(req);
      const body=await readBody(req);
      if(body.consent!==true||Object.keys(body).some(k=>!['consent','likes','dislikes','occasion','budget','query','excludedFactors'].includes(k)))return send(400,{error:{code:'INVALID_REQUEST',message:'Choose AI-guided search and share only the listed non-identifying gift preferences.'}});
      const token=gatewayToken(req,env);
      if(!token)return send(503,{error:{code:'MODEL_NOT_CONFIGURED',message:'The model is not configured. No AI recommendation was generated. You can use rules-based search instead.'}});
      const at=now();for(const[k,v]of rates)if(v.expires<=at)rates.delete(k);
      const key=createHmac('sha256',secret).update(String(req.socket?.remoteAddress||'anonymous').slice(0,256)).digest('hex');
      const bucket=rates.get(key)||{count:0,expires:at+windowMs};
      if(bucket.count>=limit||active>=2||rates.size>=1024&&!rates.has(key))return send(429,{error:{code:'AGENT_RATE_LIMIT',message:'The demo’s model limit is reached. Wait a minute or use rules-based search.'}});
      bucket.count++;rates.set(key,bucket);active++;
      try{
        const {consent,...input}=body;
        const result=await runAgent(input,{getToken:async()=>token,model});
        return send(200,{...result,provider:'Vercel AI Gateway'});
      }finally{active--;}
    }catch(error){
      // Error messages from upstream can contain credentials or raw payloads.
      // Only our own bounded public error text is allowed out of the core.
      const known=['INVALID_AGENT_INPUT','MODEL_NOT_CONFIGURED','AGENT_RATE_LIMIT','INVALID_REQUEST','INVALID_JSON','REQUEST_TOO_LARGE','ORIGIN_NOT_ALLOWED','METHOD_NOT_ALLOWED','UNSUPPORTED_MEDIA_TYPE'];
      const code=known.includes(error?.code)?error.code:'AGENT_UNAVAILABLE';
      return send(code==='AGENT_UNAVAILABLE'?502:Number.isInteger(error?.status)?error.status:400,{error:{code,message:code==='AGENT_UNAVAILABLE'?'The AI-guided run could not finish safely. No checkout or payment was made. Use rules-based search or try again later.':'The model request was rejected. Check the form and use this site directly.'}});
    }
  };
}
export default createAgentHandler();
