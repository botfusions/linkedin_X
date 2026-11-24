import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,publish,publishWithMcp,dayInIstanbul} from './geo-linkedin-trial.mjs';
const config={enabled:true,startDate:'2026-10-03',endDate:'2026-11-01',expectedSub:'expected',xPaused:true};
const image=Buffer.from([137,80,78,71,13,10,26,10]);
test('Türkiye tarihi ve 30 gün sınırı',()=>{
 assert.equal(dayInIstanbul(new Date('2026-10-02T22:00:00Z')),'2026-10-03');
 assert.equal(validate(config,'GEO kontrolü metni',image,'2026-11-01'),'image/png');
 for(const day of ['2026-10-02','2026-11-02']) assert.throws(()=>validate(config,'GEO kontrolü metni',image,day));
});
test('hashtag, format ve X kapatma koşulları',()=>{
 assert.throws(()=>validate(config,'GEO #bir #iki #uc #dort',image,'2026-10-03'));
 assert.throws(()=>validate(config,'GEO kontrolü metni',Buffer.from('%PDF'),'2026-10-03'));
 assert.throws(()=>validate({...config,xPaused:false},'GEO kontrolü metni',image,'2026-10-03'));
});
test('yanlış profil yayın ve medya yüklemesine geçemez',async()=>{
 let calls=0;
 await assert.rejects(publish({fetcher:async()=>{calls++;return Response.json({sub:'wrong'});},token:'test',config,text:'GEO kontrolü metni',image,mime:'image/png',onPosting:async()=>{}}),/beklenen hesap/);
 assert.equal(calls,1);
});
test('kişisel tek görsel yayın; gönderimden önce kayıt; URL kimliği',async()=>{
 const calls=[];let marked=false;
 const fetcher=async(url,init)=>{
  calls.push(url);
  if(url.endsWith('userinfo'))return Response.json({sub:'expected'});
  if(url.includes('registerUpload'))return Response.json({value:{asset:'urn:li:digitalmediaAsset:1',uploadMechanism:{'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest':{uploadUrl:'https://upload.linkedin.com/image'}}}});
  if(url.includes('/image'))return new Response(null,{status:201});
  assert.equal(marked,true);
  const body=JSON.parse(init.body);assert.equal(body.author,'urn:li:person:expected');assert.equal(body.specificContent['com.linkedin.ugc.ShareContent'].media.length,1);
  return new Response(null,{status:201,headers:{'x-restli-id':'urn:li:ugcPost:123'}});
 };
 const result=await publish({fetcher,token:'test',config,text:'GEO kontrolü metni',image,mime:'image/png',onPosting:async()=>{marked=true;}});
 assert.equal(result.status,'api_accepted');assert.equal(result.url,'https://www.linkedin.com/feed/update/urn:li:ugcPost:123/');assert.equal(calls.length,4);
});
test('belirsiz yayın hatasında otomatik retry yok',async()=>{
 let posts=0;const fetcher=async(url)=>{
  if(url.endsWith('userinfo'))return Response.json({sub:'expected'});
  if(url.includes('registerUpload'))return Response.json({value:{asset:'asset',uploadMechanism:{'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest':{uploadUrl:'https://upload.linkedin.com/image'}}}});
  if(url.includes('/image'))return new Response(null,{status:201});
  posts++;throw new Error('network timeout');
 };
 await assert.rejects(publish({fetcher,token:'test',config,text:'GEO kontrolü metni',image,mime:'image/png',onPosting:async()=>{}}));assert.equal(posts,1);
});

test('gerçek yayın arka ucu MCP kişisel araç çağrısını kullanır',async()=>{
 const calls=[];let marked=false;
 const client={callTool:async(args)=>{
  calls.push(args);
  if(args.name==='linkedin_get_profile')return {content:[{type:'text',text:JSON.stringify({sub:'expected'})}]};
  assert.equal(marked,true);assert.equal(args.name,'linkedin_create_post');assert.equal(args.arguments.organization_id,undefined);
  return {content:[{type:'text',text:JSON.stringify({id:'urn:li:share:123',author:'urn:li:person:expected',url:'https://www.linkedin.com/feed/update/urn:li:share:123/'})}]};
 }};
 const result=await publishWithMcp({client,config,text:'GEO kontrolü metni',imagePath:'/tmp/card.png',onPosting:async()=>{marked=true;}});
 assert.equal(result.backend,'vlpmedialtd/linkedin-mcp');assert.equal(calls.length,2);
});
test('MCP yanlış profili veya araç hatasını yayın saymaz',async()=>{
 const wrong={callTool:async()=>({content:[{type:'text',text:JSON.stringify({sub:'wrong'})}]})};
 await assert.rejects(publishWithMcp({client:wrong,config,text:'GEO kontrolü metni',imagePath:'/tmp/card.png',onPosting:async()=>{throw new Error('Çağrılmamalı');}}),/beklenen hesap/);
 const failed={callTool:async(args)=>args.name==='linkedin_get_profile'?{content:[{type:'text',text:JSON.stringify({sub:'expected'})}]}:{isError:true,content:[{type:'text',text:'403'}]}};
 await assert.rejects(publishWithMcp({client:failed,config,text:'GEO kontrolü metni',imagePath:'/tmp/card.png',onPosting:async()=>{}}),/MCP işlemi başarısız/);
});
