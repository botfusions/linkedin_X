import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import dotenv from 'dotenv';
import sharp from 'sharp';

export const dayInIstanbul = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function validate(config, text, image, day) {
  if (!config.enabled || day < config.startDate || day > config.endDate) throw new Error('30 günlük yayın yetkisi bu tarihte etkin değil.');
  if (!config.expectedSub || config.xPaused !== true) throw new Error('Profil veya X kapatma ayarı eksik.');
  if (typeof text !== 'string' || text.trim().length < 10 || text.length > 3000) throw new Error('Geçersiz LinkedIn metni.');
  if ((text.match(/#[\p{L}\p{N}_]+/gu) || []).length > 3) throw new Error('En fazla 3 hashtag kullanılabilir.');
  const png = image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = image[0] === 255 && image[1] === 216 && image[2] === 255;
  if (!png && !jpeg) throw new Error('Yalnızca render edilmiş PNG veya JPEG desteklenir. Video/PDF göndermeyin.');
  if (image.length > 10 * 1024 * 1024) throw new Error('Görsel 10 MB sınırını aşıyor.');
  return png ? 'image/png' : 'image/jpeg';
}
export async function apiRequest(fetcher, token, url, init = {}) {
  const response = await fetcher(url, {...init, headers:{Authorization:`Bearer ${token}`, 'X-Restli-Protocol-Version':'2.0.0',...init.headers},signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`LinkedIn API HTTP ${response.status}`);
  return response;
}
export async function publish({fetcher=fetch,token,config,text,image,mime,onPosting}) {
  const profile = await (await apiRequest(fetcher,token,'https://api.linkedin.com/v2/userinfo')).json();
  if (profile.sub !== config.expectedSub) throw new Error('Bağlı kişisel profil beklenen hesap değil.');
  const author = `urn:li:person:${profile.sub}`;
  const reg = await (await apiRequest(fetcher,token,'https://api.linkedin.com/v2/assets?action=registerUpload',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({registerUploadRequest:{recipes:['urn:li:digitalmediaRecipe:feedshare-image'],owner:author,serviceRelationships:[{relationshipType:'OWNER',identifier:'urn:li:userGeneratedContent'}]}})
  })).json();
  const asset = reg.value?.asset;
  const uploadUrl = reg.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  if (!asset || !uploadUrl || new URL(uploadUrl).protocol !== 'https:') throw new Error('Görsel yükleme yanıtı geçersiz.');
  await apiRequest(fetcher,token,uploadUrl,{method:'PUT',headers:{'Content-Type':mime},body:image});
  // Belirsiz ağ hatasında otomatik tekrar yapmamak için gönderimden önce kaydet.
  await onPosting();
  const response = await apiRequest(fetcher,token,'https://api.linkedin.com/v2/ugcPosts',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author,lifecycleState:'PUBLISHED',specificContent:{'com.linkedin.ugc.ShareContent':{shareCommentary:{text},shareMediaCategory:'IMAGE',media:[{status:'READY',media:asset}]}},visibility:{'com.linkedin.ugc.MemberNetworkVisibility':'PUBLIC'}})
  });
  const body = await response.json().catch(()=>({}));
  const urn = response.headers.get('x-restli-id') || body.id;
  if (typeof urn !== 'string' || !/^urn:li:(share|ugcPost|activity):\d+$/.test(urn)) throw new Error('Yayın isteği kabul edildi fakat geçerli gönderi kimliği yok. Tekrar göndermeyin.');
  return {status:'api_accepted',urn,url:`https://www.linkedin.com/feed/update/${urn}/`};
}

export function readMcpResult(result) {
  if (result.isError) throw new Error('LinkedIn MCP işlemi başarısız.');
  const text = result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  if (!text) throw new Error('LinkedIn MCP boş yanıt döndürdü.');
  return JSON.parse(text);
}
export async function publishWithMcp({client,config,text,imagePath,onPosting}) {
  const profile = readMcpResult(await client.callTool({name:'linkedin_get_profile',arguments:{}}));
  if (profile.sub !== config.expectedSub) throw new Error('Bağlı kişisel profil beklenen hesap değil.');
  await onPosting();
  const result = readMcpResult(await client.callTool({name:'linkedin_create_post',arguments:{text,image:path.resolve(imagePath),visibility:'PUBLIC'}}));
  if (result.author !== `urn:li:person:${config.expectedSub}` || !/^urn:li:(share|ugcPost|activity):\d+$/.test(result.id)) throw new Error('MCP geçerli kişisel gönderi kimliği döndürmedi. Tekrar göndermeyin.');
  const url = `https://www.linkedin.com/feed/update/${result.id}/`;
  if (result.url !== url) throw new Error('MCP gönderi URL ve kimliği eşleşmiyor.');
  return {status:'api_accepted',backend:'vlpmedialtd/linkedin-mcp',urn:result.id,url};
}
export async function openMcp(token) {
  const repo = path.resolve('integrations/linkedin-mcp');
  const requireMcp = createRequire(path.join(repo,'package.json'));
  const {Client} = requireMcp('@modelcontextprotocol/sdk/client/index.js');
  const {StdioClientTransport} = requireMcp('@modelcontextprotocol/sdk/client/stdio.js');
  const client = new Client({name:'botfusions-geo-trial',version:'1.0.0'});
  const transport = new StdioClientTransport({command:process.execPath,args:[path.join(repo,'dist/index.js')],env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'',LINKEDIN_ACCESS_TOKEN:token},stderr:'pipe'});
  await client.connect(transport);
  return client;
}

async function checkExistingPost(day) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error('Eski yayınlarla çakışma kontrolü için Supabase ayarları gerekli.');
  const start = new Date(`${day}T00:00:00+03:00`);
  const end = new Date(start.getTime()+86400000);
  const url = new URL('/rest/v1/linkedin+x',process.env.SUPABASE_URL);
  url.searchParams.set('select','linkedin_url,published_at');
  url.searchParams.set('and',`(published_at.gte.${start.toISOString()},published_at.lt.${end.toISOString()})`);
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
  if (!r.ok) throw new Error(`Eski yayın kontrolü başarısız: HTTP ${r.status}`);
  const rows = await r.json();
  if (rows.some(r=>typeof r.linkedin_url==='string' && (r.linkedin_url.startsWith('https://www.linkedin.com/') || r.linkedin_url==='published'))) throw new Error('Bugün eski sistemde LinkedIn yayını var. Yeni yayın atlandı.');
}
async function main() {
  dotenv.config({quiet:true});
  const args = process.argv.slice(2);
  if (args.includes('--mcp-check')) {
    const config = JSON.parse(await fs.readFile('data/geo-trial.json','utf8'));
    const token = JSON.parse(await fs.readFile('data/.linkedin_token.json','utf8'));
    if (!token.access_token || !token.expiresAt || Date.now() >= token.expiresAt) throw new Error('LinkedIn token eksik veya süresi dolmuş.');
    const client = await openMcp(token.access_token);
    try {
      const profile = readMcpResult(await client.callTool({name:'linkedin_get_profile',arguments:{}}));
      if (profile.sub !== config.expectedSub) throw new Error('MCP profil eşleşmedi.');
      const listed = await client.listTools();
      console.log(JSON.stringify({status:'mcp_connection_verified',profile:profile.name,tools:listed.tools.length,backend:'vlpmedialtd/linkedin-mcp'}));
    } finally {await client.close();}
    return;
  }
  const captions = args[args.indexOf('--captions')+1];
  const imagePath = args[args.indexOf('--image')+1];
  if (!args.includes('--captions') || !args.includes('--image') || !captions || !imagePath) throw new Error('Kullanım: npm run geo:linkedin -- --captions /mutlak/captions.json --image /mutlak/gorsel.png [--publish]');
  const config = JSON.parse(await fs.readFile('data/geo-trial.json','utf8'));
  const text = JSON.parse(await fs.readFile(captions,'utf8')).linkedin_personal;
  const image = await fs.readFile(imagePath);
  const day = dayInIstanbul();
  const mime = validate(config,text,image,day);
  const metadata = await sharp(image).metadata();
  if (!metadata.width || !metadata.height || !['png','jpeg'].includes(metadata.format)) throw new Error('Görsel çözümlenemedi.');
  const dir = path.resolve('data/geo-trial-receipts');
  await fs.mkdir(dir,{recursive:true});
  const receipt = path.join(dir,`${day}.json`);
  try { await fs.access(receipt); throw new Error('Bugün bir yayın veya belirsiz gönderim kaydı var. Yeniden göndermeyin.'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  const tokenInfo = JSON.parse(await fs.readFile('data/.linkedin_token.json','utf8'));
  if (!tokenInfo.access_token || !tokenInfo.expiresAt || Date.now() >= tokenInfo.expiresAt) throw new Error('LinkedIn token eksik veya süresi dolmuş.');
  const profile = await (await apiRequest(fetch,tokenInfo.access_token,'https://api.linkedin.com/v2/userinfo')).json();
  if (profile.sub !== config.expectedSub) throw new Error('Bağlı kişisel profil beklenen hesap değil.');
  await checkExistingPost(day);
  const hash = createHash('sha256').update(text).update(image).digest('hex');
  for (const file of await fs.readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    const prior = JSON.parse(await fs.readFile(path.join(dir,file),'utf8'));
    if (prior.hash === hash) throw new Error('Aynı metin ve medya daha önce gönderilmiş.');
  }
  if (!args.includes('--publish')) { console.log(JSON.stringify({status:'preflight_passed',day,profile:profile.name,x:'paused',characters:text.length,mime})); return; }
  const lock = path.join(dir,'.publish.lock');
  const handle = await fs.open(lock,'wx');
  let posting = false;
  const base = {day,hash,profile:profile.name,image:path.resolve(imagePath),createdAt:new Date().toISOString()};
  try {
    // Kilit alındıktan sonra ikinci süreç aynı günü geçemez.
    try {await fs.access(receipt);throw new Error('Günlük kayıt mevcut.');} catch(e){if(e.code!=='ENOENT')throw e;}
    if (config.backend !== 'linkedin-mcp') throw new Error('Onaylanan GitHub MCP arka ucu seçilmemiş.');
    const client = await openMcp(tokenInfo.access_token);
    let result;
    try {
      result = await publishWithMcp({client,config,text,imagePath,onPosting:async()=>{posting=true;await fs.writeFile(receipt,JSON.stringify({...base,status:'posting',backend:'vlpmedialtd/linkedin-mcp'},null,2),{flag:'wx'});}});
    } finally {await client.close();}
    await fs.writeFile(receipt,JSON.stringify({...base,...result},null,2));
    console.log(JSON.stringify(result));
  } catch(e) {
    if(posting) await fs.writeFile(receipt,JSON.stringify({...base,status:'needs_verification',error:e.message},null,2));
    throw e;
  } finally {await handle.close();await fs.unlink(lock);}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
