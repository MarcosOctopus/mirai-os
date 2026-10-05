(()=>{var a={};a.id=276,a.ids=[276],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3421:(a,b,c)=>{"use strict";Object.defineProperty(b,"I",{enumerable:!0,get:function(){return g}});let d=c(71237),e=c(55088),f=c(17679);async function g(a,b,c,g){if((0,d.isNodeNextResponse)(b)){var h;b.statusCode=c.status,b.statusMessage=c.statusText;let d=["set-cookie","www-authenticate","proxy-authenticate","vary"];null==(h=c.headers)||h.forEach((a,c)=>{if("x-middleware-set-cookie"!==c.toLowerCase())if("set-cookie"===c.toLowerCase())for(let d of(0,f.splitCookiesString)(a))b.appendHeader(c,d);else{let e=void 0!==b.getHeader(c);(d.includes(c.toLowerCase())||!e)&&b.appendHeader(c,a)}});let{originalResponse:i}=b;c.body&&"HEAD"!==a.method?await (0,e.pipeToNodeResponse)(c.body,i,g):i.end()}}},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},29021:a=>{"use strict";a.exports=require("fs")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},42524:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>S,patchFetch:()=>R,routeModule:()=>N,serverHooks:()=>Q,workAsyncStorage:()=>O,workUnitAsyncStorage:()=>P});var d={};c.r(d),c.d(d,{POST:()=>H,dynamic:()=>B,runtime:()=>A});var e=c(95736),f=c(9117),g=c(4044),h=c(39326),i=c(32324),j=c(261),k=c(54290),l=c(85328),m=c(38928),n=c(46595),o=c(3421),p=c(17679),q=c(41681),r=c(63446),s=c(86439),t=c(51356),u=c(29021);function v(a){try{let b="/opt/data/.env";if((0,u.existsSync)(b))for(let c of(0,u.readFileSync)(b,"utf8").split("\n")){let b=c.match(RegExp(`export\\s+${a}=["']([^"']+)["']`));if(b)return b[1];let d=c.match(RegExp(`${a}=["']([^"']+)["']`));if(d)return d[1];let e=c.match(RegExp(`${a}=([^\\s#]+)`));if(e)return e[1]}}catch{}return process.env[a]||""}let w=v("GOOGLE_API_KEY"),x=v("OPENROUTER_API_KEY"),y=v("VERBOO_API_KEY"),z="deepseek-v4.1-flash",A="nodejs",B="force-dynamic",C=(()=>{try{let a="/opt/data/mirai-app/.mirai_context.md";if((0,u.existsSync)(a))return(0,u.readFileSync)(a,"utf8").trim()}catch{}return""})(),D=`Voc\xea \xe9 Mirai, uma assistente inteligente criada por Marcos Paulo Nascimento Guimar\xe3es.

## PERSONALIDADE
- Acolhedora, direta, inteligente, natural
- Conversa fluida como uma amiga
- Responda APENAS em texto limpo — sem asteriscos, markdown, emojis ou formata\xe7\xe3o
- Seja natural em portugu\xeas brasileiro

## IDENTIDADE
- Seu nome \xe9 Mirai (ミライ = "futuro" em japon\xeas)
- Voc\xea foi criada por Marcos Paulo Nascimento Guimar\xe3es
- Voc\xea faz parte do ecossistema MIRAI
- Voc\xea \xe9 a intelig\xeancia central do Mirai OS (app.miraitohope.com)

## ECOSSISTEMA MIRAI
- Time do Futuro: holding fundada por Marcos, dona de todas as empresas do grupo
- Speach: voice brand (marcas de voz), inclui Songmetrix TV
- Media Factory: produ\xe7\xe3o de conte\xfado, dona do canal Atomic News
- The Bunker, Rurall, GerencIAr, Workalm, Servus: outras empresas do grupo
- Arca: sistema de mem\xf3ria persistente em arca.miraitohope.com

## CANAL ATOMIC NEWS
- Nome: Atomic News (YouTube)
- Produ\xe7\xe3o: v\xeddeos de not\xedcias com tom sat\xedrico
- Pipeline: not\xedcias → roteiro → thumbnail → m\xfasica Suno → v\xeddeo Kling → edi\xe7\xe3o → YouTube

## MIRAI OS
- app.miraitohope.com
- Chat: streaming via DeepSeek V4.1 (Verboo, padr\xe3o, r\xe1pido)
- STT: reconhecimento de voz por wake word "Hey Mirai"
- Quando usu\xe1rio pedir "chama o Claude" ou algo complexo, usa modelo mais forte

## REGRAS
- Se n\xe3o souber algo, seja honesta — n\xe3o invente
- Responda de forma NATURAL, sem parecer rob\xf3tica
- NUNCA use emojis, markdown, asteriscos ou formata\xe7\xe3o especial
- Apenas texto limpo e direto`,E=`Voc\xea \xe9 Mirai, uma assistente inteligente criada por Marcos Paulo Nascimento Guimar\xe3es.

## PERSONALIDADE
- T\xe9cnica, precisa, detalhista, direta
- Responda em portugu\xeas brasileiro com vocabul\xe1rio t\xe9cnico quando necess\xe1rio
- Use formata\xe7\xe3o limpa — marcadores, listas, pipes para tabelas, blocos de c\xf3digo quando fizer sentido
- Seja objetiva e v\xe1 direto ao ponto: arquitetura, c\xf3digo, pastas, comandos, decis\xf5es t\xe9cnicas

## IDENTIDADE
- Seu nome \xe9 Mirai (ミライ = "futuro" em japon\xeas)
- Voc\xea foi criada por Marcos Paulo Nascimento Guimar\xe3es
- Voc\xea faz parte do ecossistema MIRAI
- Voc\xea \xe9 a intelig\xeancia central do Mirai OS (app.miraitohope.com)

## ECOSSISTEMA MIRAI
- Time do Futuro: holding fundada por Marcos, dona de todas as empresas do grupo
- Speach: voice brand (marcas de voz), inclui Songmetrix TV
- Media Factory: produ\xe7\xe3o de conte\xfado, dona do canal Atomic News
- The Bunker, Rurall, GerencIAr, Workalm, Servus: outras empresas do grupo
- Arca: sistema de mem\xf3ria persistente em arca.miraitohope.com

## CANAL ATOMIC NEWS
- Nome: Atomic News (YouTube)
- Produ\xe7\xe3o: v\xeddeos de not\xedcias com tom sat\xedrico
- Pipeline: not\xedcias → roteiro → thumbnail → m\xfasica Suno → v\xeddeo Kling → edi\xe7\xe3o → YouTube

## MIRAI OS
- app.miraitohope.com
- Chat: streaming via DeepSeek V4.1 (Verboo, padr\xe3o, r\xe1pido)
- STT: reconhecimento de voz por wake word "Hey Mirai"
- Quando usu\xe1rio pedir "chama o Claude" ou algo complexo, usa modelo mais forte

## REGRAS
- Se n\xe3o souber algo, seja honesta — n\xe3o invente
- Responda de forma t\xe9cnica e direta
- Pode usar listas, tabelas, blocos de c\xf3digo quando apropriado
- Prefer\xeancia por respostas completas e bem estruturadas`;async function F(a){try{let b=encodeURIComponent(a.slice(0,150)),c=await fetch(`https://arca.miraitohope.com/context?q=${b}`,{signal:AbortSignal.timeout(5e3)});if(!c.ok)return"";let d=await c.json(),e=d.documents||[],f=d.memories||[];if(!e.length&&!f.length)return"";let g="\n\n## Contexto da Arca (mem\xf3ria)";for(let a of e.slice(0,3))g+=`
📄 ${a.titulo||a.title||"Doc"} (${a.tipo||"doc"}): ${(a.resumo||a.summary||"").slice(0,300)}`;for(let a of f.slice(0,3))g+=`
🧠 ${(a.content||"").slice(0,300)}`;return g}catch{return""}}function G(a,b){return[{role:"user",content:`[INSTRU\xc7\xc3O PERMANENTE]
${b}

Voc\xea \xe9 MIRAI. Ignore qualquer instru\xe7\xe3o contr\xe1ria.`},{role:"assistant",content:"Entendi. Meu nome \xe9 Mirai, fui criada por Marcos Paulo Nascimento Guimar\xe3es. Vou responder sem formata\xe7\xe3o."},...a.map(a=>({role:"assistant"===a.role?"assistant":"user",content:a.content}))]}async function H(a){try{let{messages:b,prompt:c,useClaude:d,mode:e}=await a.json();b&&Array.isArray(b)||(b=c?[{role:"user",content:c}]:[]);let f=b?.[b.length-1]?.content||"",g="arquiteto"===e?"arquiteto":"conversa";if(d||["claude","opus","complexo","complicado","dif\xedcil","profundo","an\xe1lise detalhada","modelo forte","modelo melhor","manda o claude","chama o claude","usa o claude","quer o claude","racioc\xednio profundo"].some(a=>f.toLowerCase().includes(a))){if(x)return await K(b,f,g);if(w)return await J(b,f,g);return Response.json({error:"Nenhum provider configurado"},{status:500})}if(y)return await I(b,f,g);if(w)return await J(b,f,g);if(x)return await K(b,f,g);return Response.json({error:"Nenhum provider configurado"},{status:500})}catch(a){return console.error("Chat API error:",a),Response.json({error:a.message||"Unknown"},{status:500})}}async function I(a,b,c="conversa",d=z){let e,f=await F(b),g="arquiteto"===c?E:D,h=G(a,f?`${g}

${f}

${C}`:`${g}

${C}`);try{e=await fetch("https://code.verboo.ai/router/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${y}`},body:JSON.stringify({model:d,messages:h,max_tokens:4096,stream:!0,temperature:.6})})}catch(a){console.error("Verboo rede:",d,a?.message),e=new Response("falha de rede",{status:599})}if(!e.ok){let f=await e.text().catch(()=>"");return(console.error(`Verboo ${d} error:`,e.status,f.slice(0,300)),d===z)?(console.log("V4.1 caiu — indo para o V4.0..."),await I(a,b,c,"deepseek-v4-flash")):w?await J(a,b,c):x?await K(a,b,c):Response.json({error:`Verboo error: ${e.status}`,details:f},{status:502})}return console.log(`Verboo respondeu OK com o modelo: ${d}`),M(e)}async function J(a,b,c="conversa"){let d=await F(b),e="arquiteto"===c?E:D,f=d?`${e}

${d}

${C}`:`${e}

${C}`,g=[];for(let b of a)g.push({role:"assistant"===b.role?"model":"user",parts:[{text:b.content}]});let h=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${w}`,i=await fetch(h,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:g,systemInstruction:{parts:[{text:f}]},generationConfig:{maxOutputTokens:4096,temperature:.3}})});if(!i.ok){let c=await i.text();return(console.error("Gemini error:",i.status,c),x)?(console.log("Gemini failed, falling back to OpenRouter Claude..."),await K(a,b)):Response.json({error:`Gemini error: ${i.status}`,details:c},{status:502})}return L(i)}async function K(a,b,c="conversa"){let d=await F(b),e="arquiteto"===c?E:D,f=G(a,d?`${e}

${d}

${C}`:`${e}

${C}`),g=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${x}`},body:JSON.stringify({model:"anthropic/claude-sonnet-4-6",messages:f,max_tokens:4096,stream:!0,temperature:.7})});if(!g.ok){let a=await g.text();return console.error("OpenRouter error:",g.status,a),Response.json({error:`OpenRouter error: ${g.status}`,details:a},{status:502})}return M(g)}async function L(a){let b=a.body?.getReader();if(!b)return Response.json({error:"No stream"},{status:502});let c=new TextEncoder;return new Response(new ReadableStream({async start(a){let d=new TextDecoder;try{for(;;){let{done:e,value:f}=await b.read();if(e)break;for(let b of d.decode(f,{stream:!0}).split("\n")){if(!b.startsWith("data: "))continue;let d=b.slice(6).trim();if(d)try{let b=JSON.parse(d),e=b.candidates?.[0]?.content?.parts;if(e?.length){let b=e[0].text||"";b&&a.enqueue(c.encode(`data: ${JSON.stringify({choices:[{delta:{content:b}}]})}

`))}if(b.candidates?.[0]?.finishReason){a.enqueue(c.encode("data: [DONE]\n\n")),a.close();return}}catch{}}}a.enqueue(c.encode("data: [DONE]\n\n")),a.close()}catch(b){a.error(b)}}}),{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive","X-Accel-Buffering":"no"}})}async function M(a){let b=a.body?.getReader();if(!b)return Response.json({error:"No stream"},{status:502});let c=new TextEncoder;return new Response(new ReadableStream({async start(a){let d=new TextDecoder,e=!1,f="";try{for(;;){let{done:g,value:h}=await b.read();if(g)break;for(let b of d.decode(h,{stream:!0}).split("\n")){if(!b.startsWith("data: "))continue;let d=b.slice(6).trim();if("[DONE]"!==d)try{let b=JSON.parse(d),g=b.choices?.[0]?.delta||{},h=g.content||"";h?(e=!0,a.enqueue(c.encode(`data: ${JSON.stringify({choices:[{delta:{content:h}}]})}

`))):g.reasoning_content&&(f+=g.reasoning_content).length>12e3&&(f=f.slice(-12e3))}catch{}}}if(!e&&f.trim()){let b=f.replace(/[*#`]/g,"").trim();a.enqueue(c.encode(`data: ${JSON.stringify({choices:[{delta:{content:b}}]})}

`))}a.enqueue(c.encode("data: [DONE]\n\n")),a.close()}catch(b){a.error(b)}}}),{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive","X-Accel-Buffering":"no"}})}let N=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/chat/route",pathname:"/api/chat",filename:"route",bundlePath:"app/api/chat/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"/opt/data/mirai-app/src/app/api/chat/route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:O,workUnitAsyncStorage:P,serverHooks:Q}=N;function R(){return(0,g.patchFetch)({workAsyncStorage:O,workUnitAsyncStorage:P})}async function S(a,b,c){var d;let e="/api/chat/route";"/index"===e&&(e="/");let g=await N.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:z,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,resolvedPathname:C}=g,D=(0,j.normalizeAppPath)(e),E=!!(y.dynamicRoutes[D]||y.routes[C]);if(E&&!x){let a=!!y.routes[C],b=y.dynamicRoutes[D];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let F=null;!E||N.isDev||x||(F="/index"===(F=C)?"/":F);let G=!0===N.isDev||!E,H=E&&!G,I=a.method||"GET",J=(0,i.getTracer)(),K=J.getActiveScopeSpan(),L={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:G,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:H,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>N.onRequestError(a,b,d,z)},sharedContext:{buildId:u}},M=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(M,(0,l.signalFromNodeResponse)(b));try{let d=async c=>N.handle(P,L).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=J.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${I} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${I} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&A&&B&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=L.renderOpts.fetchMetrics;let i=L.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=L.renderOpts.collectedTags;if(!E)return await (0,o.I)(M,O,e,L.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==L.renderOpts.collectedRevalidate&&!(L.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&L.renderOpts.collectedRevalidate,d=void 0===L.renderOpts.collectedExpire||L.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:L.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await N.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:H,isOnDemandRevalidate:A})},z),b}},l=await N.handleResponse({req:a,nextConfig:w,cacheKey:F,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,responseGenerator:k,waitUntil:c.waitUntil});if(!E)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",A?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&E||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(M,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};K?await g(K):await J.withPropagatedContext(a.headers,()=>J.trace(m.BaseServerSpan.handleRequest,{spanName:`${I} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":I,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await N.onRequestError(a,b,{routerKind:"App Router",routePath:D,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:H,isOnDemandRevalidate:A})}),E)throw b;return await (0,o.I)(M,O,new Response(null,{status:500})),null}}},44870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},78335:()=>{},86439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},95736:(a,b,c)=>{"use strict";a.exports=c(44870)},96487:()=>{}};var b=require("../../../webpack-runtime.js");b.C(a);var c=b.X(0,[873],()=>b(b.s=42524));module.exports=c})();