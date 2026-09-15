import { importPublicEvent } from '../../server/feeds.js';
export default async function handler(req:any,res:any) {
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try { const url=typeof req.query.url==='string'?req.query.url:''; return res.status(200).json(await importPublicEvent(url)); }
 catch(e) { return res.status(400).json({error:e instanceof Error?e.message:'Event unavailable'}); }
}
