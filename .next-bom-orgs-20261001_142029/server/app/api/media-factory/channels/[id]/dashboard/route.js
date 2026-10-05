(()=>{var a={};a.id=881,a.ids=[881],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3421:(a,b,c)=>{"use strict";Object.defineProperty(b,"I",{enumerable:!0,get:function(){return g}});let d=c(71237),e=c(55088),f=c(17679);async function g(a,b,c,g){if((0,d.isNodeNextResponse)(b)){var h;b.statusCode=c.status,b.statusMessage=c.statusText;let d=["set-cookie","www-authenticate","proxy-authenticate","vary"];null==(h=c.headers)||h.forEach((a,c)=>{if("x-middleware-set-cookie"!==c.toLowerCase())if("set-cookie"===c.toLowerCase())for(let d of(0,f.splitCookiesString)(a))b.appendHeader(c,d);else{let e=void 0!==b.getHeader(c);(d.includes(c.toLowerCase())||!e)&&b.appendHeader(c,a)}});let{originalResponse:i}=b;c.body&&"HEAD"!==a.method?await (0,e.pipeToNodeResponse)(c.body,i,g):i.end()}}},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},29021:a=>{"use strict";a.exports=require("fs")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:a=>{"use strict";a.exports=require("path")},44870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},51999:(a,b,c)=>{"use strict";c.d(b,{Q:()=>e});var d=c(98392);function e(){(0,d.Xv)();let a=(0,d.uQ)("atomic-news")??(0,d.oP)("Atomic News","atomic-news");return(0,d.XF)(a.id),0===(0,d.fY)(a.id).length&&((0,d.g5)(a.id,"Atomic News — briefing inicial"),(0,d.g5)(a.id,"O futuro da IA em 60 segundos"),(0,d.g5)(a.id,"Not\xedcias do mundo tech com sarcasmo nuclear")),a}},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},78335:()=>{},83004:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>E,patchFetch:()=>D,routeModule:()=>z,serverHooks:()=>C,workAsyncStorage:()=>A,workUnitAsyncStorage:()=>B});var d={};c.r(d),c.d(d,{GET:()=>y,dynamic:()=>x,runtime:()=>w});var e=c(95736),f=c(9117),g=c(4044),h=c(39326),i=c(32324),j=c(261),k=c(54290),l=c(85328),m=c(38928),n=c(46595),o=c(3421),p=c(17679),q=c(41681),r=c(63446),s=c(86439),t=c(51356),u=c(98392),v=c(51999);let w="nodejs",x="force-dynamic";async function y(a,b){(0,v.Q)();let{id:c}=await b.params;return Response.json({dashboard:(0,u.tO)(Number(c))})}let z=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/media-factory/channels/[id]/dashboard/route",pathname:"/api/media-factory/channels/[id]/dashboard",filename:"route",bundlePath:"app/api/media-factory/channels/[id]/dashboard/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"/opt/data/mirai-app/src/app/api/media-factory/channels/[id]/dashboard/route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:A,workUnitAsyncStorage:B,serverHooks:C}=z;function D(){return(0,g.patchFetch)({workAsyncStorage:A,workUnitAsyncStorage:B})}async function E(a,b,c){var d;let e="/api/media-factory/channels/[id]/dashboard/route";"/index"===e&&(e="/");let g=await z.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:A,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,resolvedPathname:D}=g,E=(0,j.normalizeAppPath)(e),F=!!(y.dynamicRoutes[E]||y.routes[D]);if(F&&!x){let a=!!y.routes[D],b=y.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||z.isDev||x||(G="/index"===(G=D)?"/":G);let H=!0===z.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>z.onRequestError(a,b,d,A)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>z.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&B&&C&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await z.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})},A),b}},l=await z.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",B?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await z.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},86439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},87550:a=>{"use strict";a.exports=require("better-sqlite3")},95736:(a,b,c)=>{"use strict";a.exports=c(44870)},96487:()=>{},98392:(a,b,c)=>{"use strict";c.d(b,{B0:()=>q,Jp:()=>o,XF:()=>n,Xv:()=>m,fY:()=>t,g5:()=>r,hr:()=>w,oP:()=>p,pd:()=>s,tO:()=>u,uQ:()=>v});var d=c(87550),e=c.n(d),f=c(29021),g=c(33873);let h=["BUSCA","THUMB","MUSICA","ANIMACAO","VIDEO_PRONTO","REVISAO","POSTADO"],i=process.env.MEDIA_FACTORY_DB_PATH||(0,g.join)(process.cwd(),"data","media-factory.sqlite"),j=null;function k(){return new Date().toISOString()}function l(a){if(!h.includes(a))throw Error(`Invalid pipeline stage: ${a}`)}function m(){let a=(j||((0,f.mkdirSync)((0,g.dirname)(i),{recursive:!0}),(j=new(e())(i)).pragma("journal_mode = WAL"),j.pragma("foreign_keys = ON")),j);return a.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'youtube',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      stage_order INTEGER NOT NULL,
      stage_name TEXT NOT NULL CHECK(stage_name IN ('BUSCA','THUMB','MUSICA','ANIMACAO','VIDEO_PRONTO','REVISAO','POSTADO')),
      status TEXT NOT NULL DEFAULT 'pendente',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      UNIQUE(channel_id, stage_name)
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      current_stage TEXT NOT NULL CHECK(current_stage IN ('BUSCA','THUMB','MUSICA','ANIMACAO','VIDEO_PRONTO','REVISAO','POSTADO')),
      thumbnail_url TEXT,
      video_url TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      posted_at TEXT,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('BUSCA','THUMB','MUSICA','ANIMACAO','VIDEO_PRONTO','REVISAO','POSTADO')),
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_channel ON pipeline_stages(channel_id, stage_order);
    CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id, current_stage);
    CREATE INDEX IF NOT EXISTS idx_logs_video ON video_logs(video_id, created_at);
  `),a}function n(a){let b=m(),c=k(),d=b.prepare(`
    INSERT OR IGNORE INTO pipeline_stages (channel_id, stage_order, stage_name, status, updated_at)
    VALUES (?, ?, ?, 'pendente', ?)
  `);return b.transaction(()=>{h.forEach((b,e)=>d.run(a,e+1,b,c))})(),q(a)}function o(){return m().prepare("SELECT * FROM channels ORDER BY created_at DESC").all()}function p(a,b){let c=m(),d=a.trim(),e=b.trim().toLowerCase();if(!d||!e)throw Error("Name and slug are required");let f=c.prepare("SELECT * FROM channels WHERE slug = ?").get(e);if(f)return f;let g=c.prepare(`
    INSERT INTO channels (name, slug, platform, active, created_at)
    VALUES (?, ?, 'youtube', 1, ?)
  `).run(d,e,k());return n(Number(g.lastInsertRowid)),c.prepare("SELECT * FROM channels WHERE id = ?").get(g.lastInsertRowid)}function q(a){return m().prepare("SELECT * FROM pipeline_stages WHERE channel_id = ? ORDER BY stage_order ASC").all(a)}function r(a,b){let c=b.trim();if(!c)throw Error("Title is required");let d=m(),e=d.prepare(`
    INSERT INTO videos (channel_id, title, current_stage, views, created_at)
    VALUES (?, ?, 'BUSCA', 0, ?)
  `).run(a,c,k()),f=d.prepare("SELECT * FROM videos WHERE id = ?").get(e.lastInsertRowid);return d.prepare(`
    INSERT INTO video_logs (video_id, stage, status, message, created_at)
    VALUES (?, 'BUSCA', 'pendente', 'V\xeddeo criado no pipeline', ?)
  `).run(f.id,k()),f}function s(a,b){l(b);let c=m(),d=k(),e="POSTADO"===b?d:null;if(0===c.prepare(`
    UPDATE videos
    SET current_stage = ?, posted_at = COALESCE(?, posted_at)
    WHERE id = ?
  `).run(b,e,a).changes)throw Error(`Video not found: ${a}`);return c.prepare(`
    INSERT INTO video_logs (video_id, stage, status, message, created_at)
    VALUES (?, ?, 'concluido', ?, ?)
  `).run(a,b,`Etapa atualizada para ${b}`,d),c.prepare("SELECT * FROM videos WHERE id = ?").get(a)}function t(a){return m().prepare("SELECT * FROM videos WHERE channel_id = ? ORDER BY created_at DESC").all(a)}function u(a){let b=m(),c=b.prepare("SELECT * FROM channels WHERE id = ?").get(a),d=b.prepare("SELECT COUNT(*) AS count FROM videos WHERE channel_id = ?").get(a).count,e=b.prepare("SELECT COUNT(*) AS count FROM videos WHERE channel_id = ? AND current_stage = 'POSTADO'").get(a).count,f=b.prepare("SELECT COALESCE(SUM(views), 0) AS total FROM videos WHERE channel_id = ?").get(a).total,g=b.prepare(`
    SELECT * FROM videos
    WHERE channel_id = ? AND current_stage != 'POSTADO'
    ORDER BY created_at ASC
    LIMIT 1
  `).get(a);return{channel:c??null,totalVideos:d,postedVideos:e,pendingVideos:d-e,totalViews:f,nextPost:g??null,stages:b.prepare(`
    SELECT ps.*, COUNT(v.id) AS video_count
    FROM pipeline_stages ps
    LEFT JOIN videos v ON v.channel_id = ps.channel_id AND v.current_stage = ps.stage_name
    WHERE ps.channel_id = ?
    GROUP BY ps.id
    ORDER BY ps.stage_order ASC
  `).all(a),recentLogs:b.prepare(`
    SELECT vl.*
    FROM video_logs vl
    JOIN videos v ON v.id = vl.video_id
    WHERE v.channel_id = ?
    ORDER BY vl.created_at DESC
    LIMIT 10
  `).all(a)}}function v(a){return m().prepare("SELECT * FROM channels WHERE slug = ?").get(a)??null}function w(a,b,c,d){l(b);let e=m(),f=e.prepare(`
    INSERT INTO video_logs (video_id, stage, status, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(a,b,c,d,k());return e.prepare("SELECT * FROM video_logs WHERE id = ?").get(f.lastInsertRowid)}}};var b=require("../../../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[873],()=>b(b.s=83004));module.exports=c})();