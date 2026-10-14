import http from 'node:http';
import shopHandler from '../server/shop-api.mjs';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(req,res)=>{
  try {
    if(new URL(req.url,'http://localhost').pathname==='/api/shop')return await shopHandler(req,res);
    if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(!file.startsWith(root)){res.writeHead(403);return res.end('Forbidden');}
    if(!(await stat(file)).isFile())throw new Error('Not found');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`The Gift Edit: http://127.0.0.1:${port} (rules-based, no model connected)`));
