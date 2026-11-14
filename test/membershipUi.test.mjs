import assert from "node:assert/strict";
import { before, after, beforeEach, it } from "node:test";
import { createServer } from "vite";
process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";
const PROJECT="64b0000000000000000000aa", OTHER="64b0000000000000000000bb", SELF="64b0000000000000000000a1";
const defer=()=>{let resolve; const promise=new Promise(r=>{resolve=r}); return {promise,resolve};};
const flush=()=>new Promise(r=>setImmediate(r));
const ok=data=>({data,status:200,statusText:"OK",headers:{},config:{}});
const error=(status,message)=>Object.assign(new Error(message),{response:{status,data:{message}}});
function createSocket() {
  const handlers=new Map();
  return { id:"socket", connected:true, active:true, sent:[], handler:async()=>({ok:false}),
    on(event,fn){if(!handlers.has(event))handlers.set(event,new Set()); handlers.get(event).add(fn);},
    off(event,fn){handlers.get(event)?.delete(fn);},
    emit(event,payload){this.sent.push({event,payload});},
    volatile:{emit(){}},
    timeout(){return {emitWithAck:(event,payload)=>{this.sent.push({event,payload});return this.handler(event,payload);}};},
    fire(event,payload){for(const fn of handlers.get(event)||[])fn(payload);},
    count(event){return handlers.get(event)?.size||0;},
  };
}
const join=(role="editor")=>({ok:true,project:{_id:PROJECT,name:"Design",description:""},role,canvas:{nodes:[],edges:[],version:0},participants:[],turn:null,serverNow:1});
let vite, ws, session, share, invitations, axios, toast, originals, requests, handler;
before(async()=>{
  globalThis.window = {};
  vite=await createServer({server:{middlewareMode:true,hmr:false,port:24928},appType:"custom",logLevel:"error",plugins:[{name:"dialog-ssr",enforce:"pre",transform(code,id){const path=id.replaceAll("\\","/"); if(path.endsWith("/components/ui/Dialog.jsx")) return code.replace("return createPortal(","return (").replace(",\n    document.body,\n  );","\n  );"); if(path.endsWith("/routes/ProjectsPage.jsx")) return code.replace('import { UserButton } from "@clerk/clerk-react";', 'const UserButton = () => null;').replace('const [hasRequested, setHasRequested] = useState(false);', 'const [hasRequested, setHasRequested] = useState(true);'); if(path.endsWith("/routes/WorkspacePage.jsx")) return code.replace('import { Link, Navigate, useParams } from "react-router-dom";', 'import { Link, useParams } from "react-router-dom"; const Navigate = ({to}) => <span data-route={to}/>;');}}]});
  ws=await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
  session=(await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js")).useSessionStore;
  share=(await vite.ssrLoadModule("/src/collaborate/store/useShareStore.js")).useShareStore;
  invitations=(await vite.ssrLoadModule("/src/collaborate/store/useInvitationsStore.js")).useInvitationsStore;
  axios=(await vite.ssrLoadModule("/src/collaborate/lib/axios.js")).axiosInstance;
  toast=(await import("react-toastify")).toast; originals={};
  for(const name of ["error","success","info"]) { originals[name]=toast[name]; toast[name]=(message,options)=>toasts.push({name,message,options}); }
  axios.defaults.adapter=async config=>{requests.push(config);return handler(config);};
});
let toasts=[];
beforeEach(()=>{requests=[];toasts=[];handler=async()=>ok({});ws.useWorkspaceStore.getState().resetWorkspace();share.getState().close();session.setState({authUser:{_id:SELF},socket:null,isConnected:false});});
after(async()=>{ws.useWorkspaceStore.getState().resetWorkspace(); share.getState().close(); axios.defaults.adapter=undefined; for(const name in originals)toast[name]=originals[name]; await vite.close();});
async function attached(role="editor") {const socket=createSocket();socket.handler=async()=>join(role); const dispose=ws.useWorkspaceStore.getState().bindWorkspace(socket,PROJECT); await flush();return {socket,dispose};}
it("removal clears state, ignores subsequent events and detaches listeners",async()=>{
  const {socket,dispose}=await attached(); socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"});
  assert.equal(ws.useWorkspaceStore.getState().status,"removed"); assert.deepEqual(ws.useWorkspaceStore.getState().history,{undo:0,redo:0,busy:false,replay:null,gesture:false});
  assert.equal(toasts[0].message,"You were removed from this project"); assert.equal(toasts[0].options.toastId,`workspace-exit-${PROJECT}`);
  socket.fire("presence:update",{projectId:PROJECT,participants:[]}); socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"}); assert.equal(toasts.length,1);
  dispose(); assert.equal(socket.count("workspace:removed"),0); assert.equal(socket.count("workspace:role"),0);
});
it("validates removal and labels self-leave and deletion",async()=>{
  let a=await attached(); a.socket.fire("workspace:removed",{projectId:OTHER,reason:"removed"});a.socket.fire("workspace:removed",{projectId:PROJECT,reason:"bad"});assert.equal(ws.useWorkspaceStore.getState().status,"ready");
  ws.markSelfLeave(PROJECT); a.socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"});assert.equal(toasts.at(-1).message,"You left the project");a.dispose();
  a=await attached(); a.socket.fire("workspace:removed",{projectId:PROJECT,reason:"deleted"});assert.equal(toasts.at(-1).message,"This project was deleted");a.dispose();
});
it("role events regate and superseded joins retry once",async()=>{
  const a=await attached(); a.socket.fire("workspace:role",{projectId:PROJECT,role:"viewer"}); assert.equal(ws.useWorkspaceStore.getState().role,"viewer");assert.equal(ws.selectCanEdit(ws.useWorkspaceStore.getState()),false);
  a.socket.fire("workspace:role",{projectId:PROJECT,role:"owner"});assert.equal(ws.useWorkspaceStore.getState().role,"viewer");a.dispose();
  const socket=createSocket();socket.handler=async()=>({ok:false,message:"Workspace request superseded"});const dispose=ws.useWorkspaceStore.getState().bindWorkspace(socket,PROJECT);await flush();await flush();
  assert.equal(socket.sent.filter(e=>e.event==="workspace:join").length,2);assert.equal(ws.useWorkspaceStore.getState().status,"error");dispose();
});
it("share store loads, ignores late responses and sends trimmed invitations",async()=>{
  const pending=defer();handler=()=>pending.promise;const loading=share.getState().open(PROJECT);share.getState().close();pending.resolve(ok({project:{_id:PROJECT},role:"owner"}));await loading;assert.equal(share.getState().detail,null);
  handler=async config=>config.method==="get"?ok({project:{_id:PROJECT,members:[],invites:[]},role:"owner"}):ok({});await share.getState().open(PROJECT);
  assert.equal(await share.getState().invite("  a@example.com  ","editor"),true); assert.equal(requests.find(r=>r.method==="post").data,JSON.stringify({email:"a@example.com",role:"editor"}));
});
it("share mutations serialize and report errors",async()=>{
  handler=async()=>ok({project:{_id:PROJECT},role:"owner"});await share.getState().open(PROJECT);
  const gate=defer();handler=()=>gate.promise;const pending=share.getState().removeMember(SELF);assert.equal(await share.getState().invite("a@b.co","viewer"),false);gate.resolve(ok({}));assert.equal(await pending,true);
  handler=async()=>{throw error(400,"Project membership changed")};assert.equal(await share.getState().changeRole(SELF,"viewer"),false);assert.ok(toasts.some(t=>t.message==="Project membership changed"));
});
it("invitations load and acceptance update the local list",async()=>{
  const invite={_id:"invite",project:{_id:PROJECT,name:"Design"},role:"editor",invitedBy:null};
  handler=async config=>config.method==="get"?ok({invites:[invite]}):ok({projectId:PROJECT,role:"editor"});await invitations.getState().loadInvites();assert.equal(invitations.getState().invites.length,1);
  assert.equal(await invitations.getState().accept(invite),true);assert.equal(invitations.getState().invites.length,0);assert.ok(toasts.some(t=>t.message==="You joined Design"));
});
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
let restoreSnapshot, restorePortal, render, React, Router, ShareDialog, Navbar, InvitationList;
it("renders owner and member share controls, seat limit, and navbar",async()=>{
  React=require("react"); const old=React.useSyncExternalStore; React.useSyncExternalStore=(sub,get)=>old(sub,get,get); restoreSnapshot=()=>{React.useSyncExternalStore=old;};
  const dom=require("react-dom"), original=dom.createPortal; dom.createPortal=children=>children; restorePortal=()=>{dom.createPortal=original;};
  globalThis.document={activeElement:null,body:{}};
  render=require("react-dom/server").renderToStaticMarkup;
  Router=(await vite.ssrLoadModule("/test/ssrRender.js")).MemoryRouter;
  ShareDialog=(await vite.ssrLoadModule("/src/collaborate/components/workspace/ShareDialog.jsx")).default;
  Navbar=(await vite.ssrLoadModule("/src/collaborate/components/workspace/WorkspaceNavbar.jsx")).default;
  InvitationList=(await vite.ssrLoadModule("/src/collaborate/components/projects/InvitationsList.jsx")).default;
  const detail={_id:PROJECT,name:"Design",owner:{_id:SELF,fullName:"Ada",img:""},members:[{user:{_id:OTHER,fullName:"Sam",img:""},role:"editor"}],invites:[{_id:"one",email:"invite@example.com",role:"viewer"}]};
  share.setState({projectId:PROJECT,detail,viewerRole:"owner",status:"ready",busy:null});
  let html=render(React.createElement(Router,null,React.createElement(ShareDialog,{open:true,onClose(){},projectId:PROJECT})));
  for(const text of ["Share project","Seats used: 2/10","invite@example.com","Revoke","Remove"]) assert.ok(html.includes(text),text);
  share.setState({detail:{...detail,invites:Array.from({length:9},(_,i)=>({_id:String(i),email:`${i}@example.com`,role:"viewer"}))}});
  html=render(React.createElement(Router,null,React.createElement(ShareDialog,{open:true,onClose(){},projectId:PROJECT}))); assert.ok(html.includes("Remove a member or revoke an invitation"));
  session.setState({authUser:{_id:OTHER}});share.setState({detail,viewerRole:"viewer"});
  html=render(React.createElement(Router,null,React.createElement(ShareDialog,{open:true,onClose(){},projectId:PROJECT})));assert.ok(html.includes("Leave project"));assert.ok(html.includes("Sam (you)"));assert.ok(!html.includes("invite@example.com"));assert.ok(!html.includes("<select"));
  ws.useWorkspaceStore.setState({status:"ready",project:{_id:PROJECT,name:"Design"},role:"viewer"});
  html=render(React.createElement(Router,null,React.createElement(Navbar)));assert.ok(html.includes('aria-label="Share project"'));
  invitations.setState({invites:[{_id:"invite",project:{_id:PROJECT,name:"Design"},role:"viewer",invitedBy:null}],busy:null});html=render(React.createElement(InvitationList));assert.ok(html.includes("Invited by a former user"));
  restorePortal();restoreSnapshot();delete globalThis.document;
});
it("removal while rejoining defeats the late acknowledgement",async()=>{
  const {socket,dispose}=await attached(); const gate=defer();socket.handler=()=>gate.promise;
  ws.useWorkspaceStore.getState().retryWorkspace(); assert.equal(ws.useWorkspaceStore.getState().status,"loading");
  socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"});gate.resolve(join());await flush();
  assert.equal(ws.useWorkspaceStore.getState().status,"removed");dispose();
});
it("share mutations use the documented paths and reload or close on failure",async()=>{
  handler=async()=>ok({project:{_id:PROJECT},role:"owner"});await share.getState().open(PROJECT);
  await share.getState().revokeInvite("invite");await flush();await share.getState().changeRole(SELF,"viewer");await flush();await share.getState().removeMember(SELF);await flush();
  assert.ok(requests.some(r=>r.method==="delete" && r.url===`/projects/${PROJECT}/invites/invite`));
  assert.ok(requests.some(r=>r.method==="patch" && r.url===`/projects/${PROJECT}/members/${SELF}` && r.data===JSON.stringify({role:"viewer"})));
  assert.ok(requests.some(r=>r.method==="delete" && r.url===`/projects/${PROJECT}/members/${SELF}`));
  handler=async()=>{throw error(404,"Project not found")};await share.getState().removeMember(SELF);assert.equal(share.getState().status,"idle");
});
it("leave uses the session id and clears its marker after failure",async()=>{
  const a=await attached();handler=async()=>ok({project:{_id:PROJECT},role:"editor"});await share.getState().open(PROJECT);
  handler=async config=>{if(config.method==="delete")throw error(400,"Could not leave");return ok({project:{_id:PROJECT},role:"editor"});};
  assert.equal(await share.getState().leave(),false);assert.ok(requests.some(r=>r.method==="delete" && r.url===`/projects/${PROJECT}/members/${SELF}`));
  a.socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"});assert.equal(toasts.at(-1).message,"You were removed from this project");a.dispose();
});
it("invitation loads are latest-wins and failure refreshes the list",async()=>{
  const gate=defer();handler=()=>gate.promise;const older=invitations.getState().loadInvites();
  handler=async()=>ok({invites:[{_id:"new",project:{name:"New"}}]});await invitations.getState().loadInvites();gate.resolve(ok({invites:[{_id:"old"}]}));await older;assert.equal(invitations.getState().invites[0]._id,"new");
  const invite=invitations.getState().invites[0];handler=async config=>{if(config.method==="post")throw error(404,"Invitation not found");return ok({invites:[]});};
  assert.equal(await invitations.getState().decline(invite),false);await flush();assert.equal(invitations.getState().invites.length,0);assert.ok(toasts.some(t=>t.message==="Invitation not found"));
});
it("role changes are ignored on owners and stale socket ids",async()=>{
  let a=await attached("owner");a.socket.fire("workspace:role",{projectId:PROJECT,role:"viewer"});assert.equal(ws.useWorkspaceStore.getState().role,"owner");a.dispose();
  a=await attached();a.socket.id="replacement";a.socket.fire("workspace:removed",{projectId:PROJECT,reason:"deleted"});assert.equal(ws.useWorkspaceStore.getState().status,"ready");a.dispose();
});
it("successful join resets the superseded retry allowance",async()=>{
  const socket=createSocket();let n=0;socket.handler=async()=>{n++;return n===2?join():{ok:false,message:"Workspace request superseded"};};
  const dispose=ws.useWorkspaceStore.getState().bindWorkspace(socket,PROJECT);await flush();await flush();assert.equal(ws.useWorkspaceStore.getState().status,"ready");
  ws.useWorkspaceStore.getState().retryWorkspace();await flush();await flush();assert.equal(n,4);assert.equal(ws.useWorkspaceStore.getState().status,"error");dispose();
});
it("reopening a different share discards the previous response",async()=>{
  const gate=defer();handler=config=>config.url.endsWith(PROJECT)?gate.promise:Promise.resolve(ok({project:{_id:OTHER},role:"viewer"}));
  const old=share.getState().open(PROJECT);await flush();await share.getState().open(OTHER);gate.resolve(ok({project:{_id:PROJECT},role:"owner"}));await old;assert.equal(share.getState().detail._id,OTHER);
});
it("dashboard shows invitations only when present and removed workspace renders navigation",async()=>{
  React=require("react"); const old=React.useSyncExternalStore;React.useSyncExternalStore=(sub,get)=>old(sub,get,get);
  try {
    const {createElement,renderToStaticMarkup,MemoryRouter}=await vite.ssrLoadModule("/test/ssrRender.js");
    const ProjectsPage=(await vite.ssrLoadModule("/src/collaborate/routes/ProjectsPage.jsx")).default;
    const WorkspacePage=(await vite.ssrLoadModule("/src/collaborate/routes/WorkspacePage.jsx")).default;
    const projects=(await vite.ssrLoadModule("/src/collaborate/store/useProjectsStore.js")).useProjectsStore;
    projects.setState({owned:[],shared:[],hasLoaded:true,isLoading:false,loadError:false});
    invitations.setState({invites:[{_id:"i",project:{name:"Design"},role:"editor",invitedBy:null}],busy:null});
    let html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ProjectsPage)));assert.ok(html.includes("Invitations"));assert.ok(html.includes("Invited by a former user"));
    invitations.setState({invites:[]});html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ProjectsPage)));assert.ok(!html.includes("invitations-title"));
    ws.useWorkspaceStore.setState({status:"removed"});html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(WorkspacePage)));assert.ok(html.includes('data-route="/collaborate"'));assert.ok(!html.includes("Share project"));
  } finally {React.useSyncExternalStore=old;}
});
it("successful self-leave marks the event and sends one shared toast id",async()=>{
  const a=await attached();handler=async()=>ok({project:{_id:PROJECT},role:"editor"});await share.getState().open(PROJECT);
  const gate=defer();handler=config=>config.method==="delete"?gate.promise:Promise.resolve(ok({project:{_id:PROJECT},role:"editor"}));
  const leaving=share.getState().leave();await flush();a.socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"});
  gate.resolve(ok({}));assert.equal(await leaving,true);
  const exits=toasts.filter(t=>t.options?.toastId===`workspace-exit-${PROJECT}`);assert.ok(exits.every(t=>t.message==="You left the project"));a.dispose();
});
it("declining an invitation removes it and reports success",async()=>{
  const invite={_id:"invite",project:{name:"Design"}};invitations.setState({invites:[invite],busy:null});handler=async()=>ok({});
  assert.equal(await invitations.getState().decline(invite),true);assert.equal(invitations.getState().invites.length,0);assert.ok(toasts.some(t=>t.message==="Invitation declined"));
});
it("removal clears pending edits and turn traffic cannot restore them",async()=>{
  const socket=createSocket(), gate=defer();session.setState({authUser:{_id:SELF},socket,isConnected:true});
  socket.handler=async(event,payload)=>event==="workspace:join" ? {...join(),turn:{holder:{userId:SELF,tabId:payload.tabId},holderSince:1,queue:[],idleDeadline:null,graceUntil:null,serverNow:1}} : gate.promise;
  const dispose=ws.useWorkspaceStore.getState().bindWorkspace(socket,PROJECT);await flush();
  const op={type:"node.add",node:{id:"n1",type:"shape",position:{x:0,y:0},width:160,height:80,data:{label:"New",shape:"rectangle",color:"#1F1F1F",textColor:"#EDEDED"}}};
  assert.equal(ws.useWorkspaceStore.getState().dispatch([op]),true);await flush();
  socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"});
  const before=socket.sent.length;socket.fire("turn:state",{projectId:PROJECT,holder:null,holderSince:null,queue:[],idleDeadline:null,graceUntil:null,serverNow:1});
  gate.resolve({ok:true,version:1});await flush();assert.equal(ws.useWorkspaceStore.getState().status,"removed");assert.equal(ws.useWorkspaceStore.getState().history.undo,0);assert.equal(socket.sent.length,before);dispose();
});
it("promotion restores turn request gating",async()=>{
  const a=await attached("viewer");a.socket.fire("workspace:role",{projectId:PROJECT,role:"editor"});
  a.socket.fire("turn:state",{projectId:PROJECT,holder:null,holderSince:null,queue:[],idleDeadline:null,graceUntil:null,serverNow:1});await flush();
  ws.useWorkspaceStore.getState().requestTurn();assert.ok(a.socket.sent.some(e=>e.event==="turn:request"));a.dispose();
});
it("demotion followed by turn loss clears retained history",async()=>{
  const socket=createSocket();session.setState({authUser:{_id:SELF},socket,isConnected:true});
  socket.handler=async(event,payload)=>event==="workspace:join" ? {...join(),turn:{holder:{userId:SELF,tabId:payload.tabId},holderSince:1,queue:[],idleDeadline:null,graceUntil:null,serverNow:1}} : {ok:true,version:1};
  const dispose=ws.useWorkspaceStore.getState().bindWorkspace(socket,PROJECT);await flush();
  ws.useWorkspaceStore.getState().dispatch([{type:"node.add",node:{id:"n1",type:"shape",position:{x:0,y:0},width:160,height:80,data:{label:"New",shape:"rectangle",color:"#1F1F1F",textColor:"#EDEDED"}}}]);await flush();
  assert.equal(ws.useWorkspaceStore.getState().history.undo,1);socket.fire("workspace:role",{projectId:PROJECT,role:"viewer"});
  socket.fire("turn:state",{projectId:PROJECT,holder:null,holderSince:null,queue:[],idleDeadline:null,graceUntil:null,serverNow:2});await flush();
  assert.equal(ws.useWorkspaceStore.getState().history.undo,0);dispose();
});
it("successful leave without a socket event exits once and ignores a later removal",async()=>{
  const a=await attached();
  handler=async()=>ok({project:{_id:PROJECT},role:"editor"});
  await share.getState().open(PROJECT);
  toasts=[];
  assert.equal(await share.getState().leave(),true);
  assert.equal(ws.useWorkspaceStore.getState().status,"removed");
  assert.equal(toasts.length,1);
  assert.equal(toasts[0].message,"You left the project");
  a.socket.fire("workspace:removed",{projectId:PROJECT,reason:"removed"});
  assert.equal(toasts.length,1);
  a.dispose();
});
