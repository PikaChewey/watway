import { campusFeed } from '../../server/feeds.js';
export default async function handler(req:any,res:any) {
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try { res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300'); return res.status(200).json(await campusFeed()); }
 catch { return res.status(503).json({error:'Campus sources temporarily unavailable'}); }
}
