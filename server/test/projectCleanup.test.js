import { afterEach, it, mock } from "node:test";
import assert from "node:assert/strict";
import Project from "../src/models/project.model.js";
import Canvas from "../src/models/canvas.model.js";
import ProjectMessage from "../src/models/projectMessage.model.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import { deleteProjectContent, deleteUserCollaborateData } from "../src/lib/projectCleanup.js";

afterEach(() => mock.restoreAll());
const io = { to: () => ({ emit() {} }) };
const query = (value) => ({ select: () => ({ lean: async () => value }) });

it("deletes canvas and messages after the project deletion notification", async () => {
  const calls=[]; const project="aaaaaaaaaaaaaaaaaaaaaaaa";
  mock.method(Canvas,"deleteOne",async filter=>calls.push(["canvas",filter]));
  mock.method(ProjectMessage,"deleteMany",async filter=>calls.push(["messages",filter]));
  await deleteProjectContent({to: room => ({emit: (event,payload)=>calls.push([event,room,payload])})},project,createWorkspaceRegistry());
  assert.deepEqual(calls,[["workspace:removed",`project:${project}`,{projectId:project,reason:"deleted"}],["canvas",{project}],["messages",{project}]]);
});

it("cleans owned projects, memberships, invitations and sender messages in order", async () => {
  const calls=[], user={_id:"aaaaaaaaaaaaaaaaaaaaaaaa",email:"Example@Email.com"}, owned="bbbbbbbbbbbbbbbbbbbbbbbb", member="cccccccccccccccccccccccc";
  mock.method(Project,"find",filter=>{calls.push(["find",filter]); return query(filter.owner ? [{_id:owned}] : [{_id:member}]);});
  mock.method(Project,"deleteOne",async filter=>{calls.push(["delete",filter]);return {deletedCount:0};});
  mock.method(Project,"updateMany",async (...args)=>calls.push(["update",...args]));
  mock.method(Canvas,"deleteOne",async filter=>calls.push(["canvas",filter]));
  mock.method(ProjectMessage,"deleteMany",async filter=>calls.push(["messages",filter]));
  await deleteUserCollaborateData(io,user,createWorkspaceRegistry());
  assert.deepEqual(calls.map(c=>c[0]),["find","delete","canvas","messages","find","update","update","messages"]);
  assert.deepEqual(calls[5].slice(1),[{"members.user":user._id},{$pull:{members:{user:user._id}}}]);
  assert.deepEqual(calls[6].slice(1),[{"invites.email":"example@email.com"},{$pull:{invites:{email:"example@email.com"}}}]);
  assert.deepEqual(calls[7][1],{sender:user._id});
});

it("propagates model failures", async () => {
  mock.method(Canvas,"deleteOne",async ()=>{throw new Error("database unavailable")});
  await assert.rejects(deleteProjectContent(io,"aaaaaaaaaaaaaaaaaaaaaaaa",createWorkspaceRegistry()),/database unavailable/);
});
it("skips the invite pull for invalid email", async () => {
  const updates=[];
  mock.method(Project,"find",()=>query([]));
  mock.method(Project,"updateMany",async (...args)=>updates.push(args));
  mock.method(ProjectMessage,"deleteMany",async ()=>{});
  await deleteUserCollaborateData(io,{_id:"aaaaaaaaaaaaaaaaaaaaaaaa",email:"invalid"},createWorkspaceRegistry());
  assert.equal(updates.length,1);
  assert.deepEqual(updates[0][0],{"members.user":"aaaaaaaaaaaaaaaaaaaaaaaa"});
});
it("removes live connections from each membership found before the pull", async () => {
  const user="aaaaaaaaaaaaaaaaaaaaaaaa", ids=["bbbbbbbbbbbbbbbbbbbbbbbb","cccccccccccccccccccccccc"], registry=createWorkspaceRegistry(), emits=[];
  const leases=[];
  for (const project of ids) {
    leases.push(await registry.acquire(project,async()=>({nodes:[],edges:[],version:0})));
    registry.addConnection(project,`socket-${project}`,{userId:user,tabId:"tab",role:"viewer"});
  }
  mock.method(Project,"find",filter=>query(filter.owner ? [] : ids.map(_id=>({_id}))));
  mock.method(Project,"updateMany",async()=>{}); mock.method(ProjectMessage,"deleteMany",async()=>{});
  await deleteUserCollaborateData({to:room=>({emit:(event,payload)=>emits.push({room,event,payload})})},{_id:user,email:"bad"},registry);
  assert.equal(emits.filter(e=>e.event==="workspace:removed").length,2);
  assert.ok(ids.every(project=>registry.getRoom(project).connections.size===0));
  for (const lease of leases) lease.release();
});
