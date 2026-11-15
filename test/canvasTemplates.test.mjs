import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { before, after, it } from "node:test";
import { createServer } from "vite";
process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";
let vite, lib, shared, render, h, Dialog, Panel, Provider;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, port: 24930 }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: "template-dialog-ssr", enforce: "pre", transform(code, id) {
    if (id.replaceAll("\\", "/").endsWith("/components/ui/Dialog.jsx")) return code.replace("return createPortal(", "return (").replace(",\n    document.body,\n  );", "\n  );");
  } }] });
  lib = await vite.ssrLoadModule("/src/collaborate/lib/canvasTemplates.js");
  shared = await vite.ssrLoadModule("/server/src/shared/canvasOps.js");
  const ssr = await vite.ssrLoadModule("/test/ssrRender.js"); h = ssr.createElement; render = ssr.renderToStaticMarkup;
  Dialog = (await vite.ssrLoadModule("/src/collaborate/components/canvas/TemplatesDialog.jsx")).default;
  Panel = (await vite.ssrLoadModule("/src/collaborate/components/canvas/ShapePanel.jsx")).default;
  Provider = (await import("@xyflow/react")).ReactFlowProvider;
});
after(async () => { delete globalThis.document; await vite?.close(); });
const empty = () => ({ nodes: [], edges: [] });
function frozen(value) { if (value && typeof value === "object") { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); } }
function box(nodes) {
 const x = Math.min(...nodes.map(n => n.position.x)), y = Math.min(...nodes.map(n => n.position.y));
 return { x, y, width: Math.max(...nodes.map(n => n.position.x + n.width)) - x, height: Math.max(...nodes.map(n => n.position.y + n.height)) - y };
}
const fingerprint =(t) => createHash("sha256").update(JSON.stringify([
     t.id, t.name, t.description, t.group,
     t.nodes.map((n) => [n.key, n.label, n.shape, n.color, n.x, n.y, n.width ?? null, n.height ?? null]),
     t.edges.map((e) => [e.from, e.to, e.sourceHandle, e.targetHandle, e.label ?? null]),
   ])).digest("hex").slice(0, 16);
const expected = [
  [
    "microservices",
    "patterns",
    "7",
    "6",
    "0",
    "824ce8b514cc8a64"
  ],
  [
    "cicd-pipeline",
    "patterns",
    "7",
    "6",
    "0",
    "da41e2c6faaf8250"
  ],
  [
    "event-driven",
    "patterns",
    "7",
    "7",
    "0",
    "a616d5a4f436b6f9"
  ],
  [
    "scale-to-millions",
    "foundations",
    "10",
    "10",
    "5",
    "587c9da04033957c"
  ],
  [
    "rate-limiter",
    "foundations",
    "8",
    "7",
    "5",
    "24d3dd7cf5e3b207"
  ],
  [
    "url-shortener",
    "foundations",
    "6",
    "6",
    "4",
    "314d3716af0412ef"
  ],
  [
    "news-feed",
    "social",
    "11",
    "11",
    "3",
    "aa1e6448bf7b8855"
  ],
  [
    "chat-system",
    "social",
    "10",
    "9",
    "5",
    "1c6284163875b0df"
  ],
  [
    "video-streaming",
    "media-storage",
    "9",
    "10",
    "5",
    "2a8535e9ab2d006a"
  ],
  [
    "cloud-file-storage",
    "media-storage",
    "10",
    "10",
    "4",
    "202229a8d3fe1a36"
  ],
  [
    "notification-system",
    "social",
    "12",
    "14",
    "0",
    "d7dcdb324b3b37e4"
  ],
  [
    "unique-id-generator",
    "foundations",
    "6",
    "7",
    "1",
    "36be86d38ab5f7f0"
  ],
  [
    "nearby-friends",
    "social",
    "8",
    "7",
    "3",
    "344b9d6836413914"
  ],
  [
    "email-service",
    "social",
    "10",
    "10",
    "3",
    "b93f2594296c6100"
  ],
  [
    "object-storage",
    "media-storage",
    "11",
    "10",
    "3",
    "85f66048f2085539"
  ],
  [
    "web-crawler",
    "search-location",
    "9",
    "9",
    "3",
    "97657654a5a25c92"
  ],
  [
    "search-autocomplete",
    "search-location",
    "8",
    "8",
    "4",
    "2cecff9eed03829e"
  ],
  [
    "proximity-service",
    "search-location",
    "7",
    "7",
    "4",
    "098c3326cb6c5378"
  ],
  [
    "maps-navigation",
    "search-location",
    "12",
    "11",
    "2",
    "a9961d55fa54d0a6"
  ],
  [
    "payment-system",
    "payments",
    "11",
    "11",
    "3",
    "3ae1c0cbcf046cb6"
  ],
  [
    "digital-wallet",
    "payments",
    "8",
    "8",
    "5",
    "b613d331b632fdb1"
  ],
  [
    "hotel-reservation",
    "payments",
    "10",
    "10",
    "1",
    "70b2719e7c155282"
  ],
  [
    "stock-exchange",
    "payments",
    "10",
    "9",
    "4",
    "9b5f7161c5a753ab"
  ],
  [
    "distributed-message-queue",
    "data",
    "8",
    "11",
    "4",
    "ca93f1ccb9772b62"
  ],
  [
    "metrics-monitoring",
    "data",
    "9",
    "8",
    "4",
    "f19e34983107bbb0"
  ],
  [
    "ad-click-aggregation",
    "data",
    "10",
    "9",
    "2",
    "6f617634a32c2b1f"
  ],
  [
    "realtime-leaderboard",
    "data",
    "6",
    "6",
    "4",
    "22b4107a5256a0ba"
  ]
];
it("has exactly twenty-seven deeply frozen named templates and fingerprints", () => {
 assert.deepEqual(lib.CANVAS_TEMPLATES.map(t => t.id), expected.map(r => r[0])); frozen(lib.CANVAS_TEMPLATES);
 lib.CANVAS_TEMPLATES.forEach((t,i) => { const row=expected[i]; assert.ok(t.name && t.description); assert.equal(t.nodes.length,+row[2]); assert.equal(t.edges.length,+row[3]); assert.equal(t.edges.filter(e=>e.label !== undefined).length,+row[4]); assert.equal(fingerprint(t),row[5],t.id); });
});
it("exports frozen groups and assigns templates in group order", () => {
 assert.deepEqual(lib.TEMPLATE_GROUPS,[{"id": "patterns", "title": "Architecture patterns"}, {"id": "foundations", "title": "Web foundations"}, {"id": "social", "title": "Social and messaging"}, {"id": "media-storage", "title": "Media and storage"}, {"id": "search-location", "title": "Search and location"}, {"id": "payments", "title": "Payments and booking"}, {"id": "data", "title": "Data and streaming"}]); frozen(lib.TEMPLATE_GROUPS);
 lib.CANVAS_TEMPLATES.forEach((t,i)=>assert.equal(t.group,expected[i][1]));
 lib.TEMPLATE_GROUPS.forEach(g=>assert.ok(lib.CANVAS_TEMPLATES.some(t=>t.group===g.id)));
});
it("validates data, handles, unique keys and nonoverlapping rectangles", () => {
 for (const t of lib.CANVAS_TEMPLATES) {
 const keys = new Set(t.nodes.map(n => n.key)); assert.equal(keys.size,t.nodes.length);
 for (const n of t.nodes) { assert.ok(shared.NODE_SHAPES.includes(n.shape)); assert.ok(shared.NODE_COLORS.some(p => p.name === n.color)); assert.ok(n.label.length <= shared.NODE_LABEL_MAX); }
 for (const e of t.edges) { assert.ok(keys.has(e.from) && keys.has(e.to)); assert.notEqual(e.from,e.to); assert.ok(shared.HANDLE_IDS.includes(e.sourceHandle)); assert.ok(shared.HANDLE_IDS.includes(e.targetHandle)); }
 assert.ok(t.nodes.length+t.edges.length<=shared.MAX_OPS_PER_COMMIT);
 assert.equal(new Set(t.edges.map(e=>JSON.stringify([e.from,e.to]))).size,t.edges.length);
 for(const e of t.edges) if(e.label !== undefined) {assert.equal(typeof e.label,"string");assert.ok(e.label.length>0 && e.label.length<=shared.EDGE_LABEL_MAX);}
 const rects = t.nodes.map(n => ({ ...shared.DEFAULT_NODE_SIZE[n.shape], ...n }));
 if(t.group!=="patterns") {assert.equal(Math.min(...rects.map(n=>n.x)),0);assert.equal(Math.min(...rects.map(n=>n.y)),0);rects.forEach((a,i)=>rects.slice(i+1).forEach(b=>assert.ok(a.x+a.width+40<=b.x || b.x+b.width+40<=a.x || a.y+a.height+40<=b.y || b.y+b.height+40<=a.y)));}
 rects.forEach((a,i) => rects.slice(i+1).forEach(b => assert.ok(a.x+a.width <= b.x || b.x+b.width <= a.x || a.y+a.height <= b.y || b.y+b.height <= a.y)));
 }
});
it("builds each template through production applyOps with exact palette and edges", () => {
 for (const t of lib.CANVAS_TEMPLATES) {
 const built = lib.buildTemplateOps(t,[],{x:0,y:0}), result=shared.applyOps(empty(),built.ops);
 assert.equal(result.ok,true); assert.equal(result.canvas.nodes.length,t.nodes.length); assert.equal(result.canvas.edges.length,t.edges.length); assert.ok(built.ops.length <= shared.MAX_OPS_PER_COMMIT);
 result.canvas.nodes.forEach((n,i) => { const pair=shared.NODE_COLORS.find(p => p.name===t.nodes[i].color); assert.equal(n.data.color,pair.fill); assert.equal(n.data.textColor,pair.text); });
 result.canvas.edges.forEach((e,i) => { assert.equal(e.type,"link"); assert.equal(e.data.label,t.edges[i].label ?? ""); });
 built.ops.filter(o=>o.edge).forEach((o,i)=>{assert.equal(o.edge.type,"link");assert.equal(o.edge.data.label,t.edges[i].label ?? "");});
 }
});
it("centers empty placements and returns actual rounded bounds", () => {
 for(const t of lib.CANVAS_TEMPLATES) { const b=lib.buildTemplateOps(t,[],{x:123.3,y:-47.8}); assert.deepEqual(b.bounds,box(b.ops.filter(o=>o.node).map(o=>o.node))); assert.ok(Math.abs(b.bounds.x+b.bounds.width/2-123.3)<=1); assert.ok(Math.abs(b.bounds.y+b.bounds.height/2+47.8)<=1); b.ops.filter(o=>o.node).forEach(o=>{assert.ok(Number.isInteger(o.node.position.x));assert.ok(Number.isInteger(o.node.position.y));}); }
});
it("places below existing content independently of view center", () => {
 const nodes=[{position:{x:100,y:100},width:160,height:80}];
 for(const t of lib.CANVAS_TEMPLATES) { const a=lib.buildTemplateOps(t,nodes,{x:0,y:0}),b=lib.buildTemplateOps(t,nodes,{x:999,y:999}); assert.deepEqual(a.bounds,b.bounds); assert.equal(a.bounds.y,180+lib.TEMPLATE_GAP); assert.ok(Math.abs(a.bounds.x+a.bounds.width/2-180)<=1); }
});
it("fresh IDs allow repeated insertion and inversion restores the empty canvas", () => {
 for(const t of lib.CANVAS_TEMPLATES) { const a=lib.buildTemplateOps(t,[],{x:0,y:0}),b=lib.buildTemplateOps(t,[],{x:0,y:0}); const ids=new Set(a.ops.map(o=>(o.node||o.edge).id)); b.ops.forEach(o=>assert.ok(!ids.has((o.node||o.edge).id))); const applied=shared.applyOps(empty(),a.ops); assert.equal(shared.applyOps(applied.canvas,b.ops).ok,true); const inverse=shared.invertOps(empty(),a.ops); assert.equal(inverse.ok,true); assert.deepEqual(shared.applyOps(applied.canvas,inverse.ops).canvas,empty()); }
});
it("rejects malformed inputs and preserves frozen inputs", () => {
 const t=lib.CANVAS_TEMPLATES[0], snapshot=JSON.stringify(t), center={x:0,y:0};
 for(const bad of [null,3,{}, {...t,nodes:[{...t.nodes[0],shape:"bad"}]}, {...t,nodes:[{...t.nodes[0],color:"bad"}]}, {...t,edges:[{from:"missing",to:"gateway"}]}]) assert.equal(lib.buildTemplateOps(bad,[],center),null);
 assert.equal(lib.buildTemplateOps(t,null,center),null); assert.equal(lib.buildTemplateOps(t,[],{x:NaN,y:0}),null); assert.equal(JSON.stringify(t),snapshot);
});
it("validates edge label types and defers excessive lengths to atomic applyOps", () => {
 const t=lib.CANVAS_TEMPLATES[0], center={x:0,y:0};
 assert.equal(lib.buildTemplateOps({...t,edges:[{...t.edges[0],label:5}]},[],center),null);
 const built=lib.buildTemplateOps({...t,edges:[{...t.edges[0],label:"x".repeat(101)}]},[],center);
 assert.ok(built); const canvas=empty(), snapshot=JSON.stringify(canvas); assert.equal(shared.applyOps(canvas,built.ops).ok,false); assert.equal(JSON.stringify(canvas),snapshot);
 const {group,...ungrouped}=t; assert.ok(lib.buildTemplateOps(ungrouped,[],center));
});
it("production node limit rejects atomically", () => {
 const b=lib.buildTemplateOps(lib.CANVAS_TEMPLATES[0],[],{x:0,y:0}); const canvas={nodes:Array.from({length:295},(_,i)=>({...b.ops[0].node,id:`existing_${i}`})),edges:[]}; const snapshot=JSON.stringify(canvas), result=shared.applyOps(canvas,b.ops); assert.equal(result.ok,false); assert.match(result.error,/300|limit|many/i); assert.equal(JSON.stringify(canvas),snapshot);
});
function checkGroup(html, group) {
 const templates=lib.CANVAS_TEMPLATES.filter(t=>t.group===group.id);
 const controls=html.match(/<div role="group" aria-label="Template groups"[^>]*>([\s\S]*?)<\/div>/);
 assert.ok(controls);
 const buttons=[...controls[1].matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)];
 assert.deepEqual(buttons.map(m=>m[2]),lib.TEMPLATE_GROUPS.map(g=>g.title));
 assert.deepEqual(buttons.map(m=>m[1]),lib.TEMPLATE_GROUPS.map(g=>g.id===group.id?"true":"false"));
 assert.deepEqual([...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(m=>m[1]),[group.title]);
 const names=[...html.matchAll(/<h4[^>]*>(.*?)<\/h4>/g)].map(m=>m[1]);
 assert.deepEqual(names,templates.map(t=>t.name));
 assert.deepEqual([...html.matchAll(/aria-label="Add ([^"]+) template"/g)].map(m=>m[1]),names);
 for(const t of lib.CANVAS_TEMPLATES.filter(t=>t.group!==group.id)) assert.ok(!html.includes(`<h4 class="text-base font-semibold">${t.name}</h4>`));
 const svgs=html.match(/<svg[\s\S]*?<\/svg>/g); assert.equal(svgs.length,templates.length);
 svgs.forEach((svg,i)=>{assert.match(svg,/aria-hidden="true"/);assert.equal((svg.match(/<(rect|polygon|ellipse) /g)||[]).length,templates[i].nodes.length);assert.equal((svg.match(/<line /g)||[]).length,templates[i].edges.length);});
 return names;
}
it("dialog defaults to architecture patterns with accessible group controls", () => {
 globalThis.document={activeElement:null,body:{}};
 const html=render(h(Dialog,{open:true,onClose(){},onAdd(){}}));
 assert.match(html,/Starter templates/); assert.match(html,/<button[^>]*data-autofocus[^>]*>Close<\/button>/);
 assert.equal(checkGroup(html,lib.TEMPLATE_GROUPS[0]).length,3);
});
it("dialog renders each group's ordered cards and accurate hidden previews", () => {
 const names=lib.TEMPLATE_GROUPS.flatMap(group=>checkGroup(render(h(Dialog,{open:true,initialGroup:group.id})),group));
 assert.equal(names.length,27); assert.equal(new Set(names).size,27);
 assert.deepEqual([...names].sort(),lib.CANVAS_TEMPLATES.map(t=>t.name).sort());
});
it("dialog falls back for unknown groups and renders nothing when closed", () => {
 checkGroup(render(h(Dialog,{open:true,initialGroup:"nope"})),lib.TEMPLATE_GROUPS[0]);
 assert.equal(render(h(Dialog,{open:false})),"");
});
it("shape panel retains six shape items and adds the templates button", () => {
 const html=render(h(Provider,null,h(Panel))); assert.equal((html.match(/role="button"/g)||[]).length,6); assert.match(html,/<button[^>]*aria-label="Starter templates"[^>]*aria-haspopup="dialog"/);
});
