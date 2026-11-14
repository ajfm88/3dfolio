import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import User from "../src/models/user.model.js";
import * as projectAccess from "../src/lib/projectAccess.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import { registerWorkspaceHandlers, onMemberChanged, onProjectDeleted } from "../src/sockets/workspace.socket.js";

const TAB = "123e4567-e89b-41d3-a456-426614174000";
const TAB_B = "123e4567-e89b-41d3-a456-426614174001";
const TAB_C = "123e4567-e89b-41d3-a456-426614174002";
const PUBLIC_KEYS = ["graceUntil", "holder", "holderSince", "idleDeadline", "projectId", "queue", "serverNow"];

const restores = [];

afterEach(() => {
  while (restores.length > 0) restores.pop()();
});

function query(result) {
  const thenable = {
    select() { return thenable; },
    lean() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return thenable;
}

function id() {
  return new mongoose.Types.ObjectId().toString();
}

function node(nodeId = "n1", label = "Saved") {
  return {
    id: nodeId,
    type: "shape",
    position: { x: 10, y: 40 },
    width: 160,
    height: 80,
    data: { shape: "rectangle", label, color: "#1F1F1F", textColor: "#EDEDED" },
  };
}

function addOp(nodeId, label = "New") {
  return { type: "node.add", node: node(nodeId, label) };
}

function projectDoc(projectId, userId, role) {
  if (role === "owner") {
    return { _id: projectId, name: "Design", description: "Notes", owner: userId, members: [] };
  }
  return {
    _id: projectId,
    name: "Design",
    description: "Notes",
    owner: id(),
    members: [{ user: userId, role }],
  };
}

function canvasDoc() {
  return {
    _id: id(),
    project: id(),
    nodes: [],
    edges: [],
    version: 0,
  };
}

function emptyTurn(serverNow) {
  return {
    holder: null,
    holderSince: null,
    queue: [],
    idleDeadline: null,
    graceUntil: null,
    serverNow,
  };
}

function createSocket(userId, socketId = "socket-1") {
  const handlers = new Map();
  const socket = {
    id: socketId,
    connected: true,
    data: { userId },
    rooms: new Set([socketId, userId]),
    relays: [],
    on(event, handler) { handlers.set(event, handler); },
    async join(room) { socket.rooms.add(room); },
    async leave(room) { socket.rooms.delete(room); },
    to(room) {
      const call = { room, except: [], volatile: false };
      const operator = {
        except(socketId) {
          call.except.push(socketId);
          return operator;
        },
        get volatile() {
          call.volatile = true;
          return operator;
        },
        emit(event, payload) {
          socket.relays.push({
            room: call.room,
            except: [...call.except],
            volatile: call.volatile,
            event,
            payload,
          });
        },
      };
      return operator;
    },
  };
  socket.handler = (event) => handlers.get(event);
  return socket;
}

function createIo() {
  const emits = [];
  const io = {
    emits,
    to(room) {
      const call = { room, except: [], volatile: false };
      const operator = {
        except(socketId) {
          call.except.push(socketId);
          return operator;
        },
        emit(event, payload) {
          emits.push({
            room: call.room,
            except: [...call.except],
            volatile: call.volatile,
            event,
            payload,
          });
        },
        get volatile() {
          call.volatile = true;
          return operator;
        },
      };
      return operator;
    },
  };
  return io;
}

function ackCapture() {
  const calls = [];
  const ack = (body) => { calls.push(structuredClone(body)); };
  ack.calls = calls;
  return ack;
}

function turnEmits(io) {
  return io.emits.filter((item) => item.event === "turn:state");
}

function stub(roleFor) {
  const calls = { writes: [] };
  mock.method(User, "findById", () => query({ fullName: "Ada", img: "" }));
  restores.push(() => User.findById.mock.restore());
  mock.method(Canvas, "findOneAndUpdate", () => query(canvasDoc()));
  restores.push(() => Canvas.findOneAndUpdate.mock.restore());
  mock.method(Canvas, "findOne", () => query(canvasDoc()));
  restores.push(() => Canvas.findOne.mock.restore());
  mock.method(Canvas, "updateOne", (...args) => {
    calls.writes.push(args);
    return Promise.resolve({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  });
  restores.push(() => Canvas.updateOne.mock.restore());
  calls.findProjectForMember = (projectId, userId) => {
    const role = roleFor(userId);
    if (!role) return Promise.resolve(null);
    return Promise.resolve(projectDoc(projectId, userId, role));
  };
  return calls;
}

function attach(io, socket, calls, registry) {
  registerWorkspaceHandlers(io, socket, registry, {
    findProjectForMember: (...args) => calls.findProjectForMember(...args),
    roleOf: projectAccess.roleOf,
  });
}

async function join(socket, projectId, tabId) {
  const ack = ackCapture();
  await socket.handler("workspace:join")({ projectId, tabId }, ack);
  assert.equal(ack.calls[0].ok, true, ack.calls[0]?.message);
  return ack.calls[0];
}


it("removal immediately hands the turn to the queued member and revokes both tabs", async () => {
  const user=id(), other=id(), project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry();
  const a=createSocket(user,"a"), b=createSocket(user,"b"), c=createSocket(other,"c");
  for (const socket of [a,b,c]) attach(io,socket,calls,registry);
  await join(a,project,TAB); await join(b,project,TAB_B); await join(c,project,TAB_C);
  a.handler("turn:request")({projectId:project}); c.handler("turn:request")({projectId:project});
  io.emits.length=0; onMemberChanged(io,project,user,null,registry);
  assert.equal(io.emits.filter(e=>e.event==="workspace:removed").length,2);
  assert.equal(registry.getRoom(project).connections.size,1);
  assert.equal(registry.getRoom(project).turn.holder.userId,other);
  assert.equal(registry.getRoom(project).turn.graceUntil,null);
  const ack=ackCapture(); await a.handler("canvas:sync")({projectId:project},ack);
  assert.equal(ack.calls[0].message,"Project not found");
});
it("demotion transfers the turn and deletion invalidates the room", async () => {
  const user=id(), other=id(), project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry();
  const a=createSocket(user,"a"), b=createSocket(other,"b"); attach(io,a,calls,registry); attach(io,b,calls,registry);
  await join(a,project,TAB); await join(b,project,TAB_B);
  a.handler("turn:request")({projectId:project}); b.handler("turn:request")({projectId:project});
  onMemberChanged(io,project,user,"viewer",registry);
  assert.equal(registry.getRoom(project).members.get(user).role,"viewer");
  assert.equal(registry.getRoom(project).turn.holder.userId,other);
  assert.ok(io.emits.some(e=>e.event==="workspace:role" && e.payload.role==="viewer"));
  onProjectDeleted(io,project,registry); assert.equal(registry.getRoom(project),null);
  assert.ok(io.emits.some(e=>e.event==="workspace:removed" && e.payload.reason==="deleted"));
});
it("membership changes cancel in-flight joins before attachment", async () => {
  for (const role of [null, "viewer"]) {
    const user=id(), project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry(), socket=createSocket(user);
    let resolve; calls.findProjectForMember=()=>new Promise(r=>{resolve=r}); attach(io,socket,calls,registry);
    const ack=ackCapture(), pending=socket.handler("workspace:join")({projectId:project,tabId:TAB},ack);
    await new Promise(r=>setImmediate(r)); onMemberChanged(io,project,user,role,registry);
    resolve(projectDoc(project,user,"editor")); await pending;
    assert.equal(ack.calls[0].message,"Workspace request superseded"); assert.equal(registry.getRoom(project),null);
    while (restores.length) restores.pop()();
  }
});
it("project deletion cancels a pending join and permits a fresh room later", async () => {
  const user=id(), project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry(), socket=createSocket(user);
  let resolve; calls.findProjectForMember=()=>new Promise(r=>{resolve=r}); attach(io,socket,calls,registry);
  const ack=ackCapture(), pending=socket.handler("workspace:join")({projectId:project,tabId:TAB},ack);
  await new Promise(r=>setImmediate(r)); onProjectDeleted(io,project,registry); resolve(projectDoc(project,user,"editor")); await pending;
  assert.equal(ack.calls[0].message,"Workspace request superseded");
  calls.findProjectForMember=async()=>projectDoc(project,user,"editor"); await join(socket,project,TAB);
  assert.ok(registry.getRoom(project));
});
it("same role is a no-op and promoting permits a new turn request", async () => {
  const user=id(), project=id(), calls=stub(()=>"viewer"), io=createIo(), registry=createWorkspaceRegistry(), socket=createSocket(user);
  attach(io,socket,calls,registry); await join(socket,project,TAB); io.emits.length=0;
  onMemberChanged(io,project,user,"viewer",registry); assert.equal(io.emits.length,0);
  socket.handler("turn:request")({projectId:project}); assert.equal(registry.getRoom(project).turn.holder,null);
  onMemberChanged(io,project,user,"editor",registry); socket.handler("turn:request")({projectId:project});
  assert.equal(registry.getRoom(project).turn.holder.userId,user);
});
it("demoting a queued editor removes only that user's place", async () => {
  const users=[id(),id(),id()], project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry();
  const sockets=users.map((user,i)=>createSocket(user,`socket-${i}`));
  for (const socket of sockets) attach(io,socket,calls,registry);
  for (let i=0;i<3;i++) { await join(sockets[i],project,[TAB,TAB_B,TAB_C][i]); sockets[i].handler("turn:request")({projectId:project}); }
  onMemberChanged(io,project,users[1],"viewer",registry);
  assert.equal(registry.getRoom(project).turn.holder.userId,users[0]);
  assert.deepEqual(registry.getRoom(project).turn.queue.map(item=>item.userId),[users[2]]);
});
it("bad input is ignored and an emit failure does not prevent removal", async () => {
  const user=id(), project=id(), calls=stub(()=>"viewer"), io=createIo(), registry=createWorkspaceRegistry(), socket=createSocket(user);
  attach(io,socket,calls,registry); await join(socket,project,TAB);
  onMemberChanged(io,project,user,"owner",registry); assert.ok(registry.getRoom(project));
  const original=io.to; io.to=()=>{throw new Error("emit failure")};
  onMemberChanged(io,project,user,null,registry); assert.equal(registry.getRoom(project),null);
  io.to=original; onProjectDeleted(io,"bad",registry);
});
it("disconnecting an old socket does not remove its replacement from the index", async () => {
  const user=id(), project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry();
  const old=createSocket(user,"same"), replacement=createSocket(user,"same");
  attach(io,old,calls,registry); attach(io,replacement,calls,registry); await join(replacement,project,TAB);
  old.handler("disconnecting")(); onMemberChanged(io,project,user,null,registry);
  await new Promise(r=>setImmediate(r)); assert.equal(replacement.rooms.has(`project:${project}`),false);
});
it("deleting while a commit waits on the write queue supersedes it without a write", async () => {
  const user=id(), project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry(), socket=createSocket(user);
  attach(io,socket,calls,registry); await join(socket,project,TAB); socket.handler("turn:request")({projectId:project});
  let release; const barrier=new Promise(r=>{release=r});
  const held=registry.getRoom(project).writeQueue(()=>barrier);
  const ack=ackCapture(), commit=socket.handler("canvas:commit")({projectId:project,baseVersion:0,ops:[addOp("new-node")]},ack);
  onProjectDeleted(io,project,registry); release(); await held; await commit;
  assert.equal(ack.calls[0].message,"Workspace request superseded"); assert.equal(calls.writes.length,0);
});
it("removed sockets cannot relay cursor, typing, turn, commit or sync", async () => {
  const user=id(), other=id(), project=id(), calls=stub(()=>"viewer"), io=createIo(), registry=createWorkspaceRegistry();
  const a=createSocket(user,"a"), b=createSocket(other,"b"); attach(io,a,calls,registry); attach(io,b,calls,registry);
  await join(a,project,TAB); await join(b,project,TAB_B); io.emits.length=0;
  onMemberChanged(io,project,user,null,registry);
  const presence=io.emits.find(e=>e.event==="presence:update"); assert.deepEqual(presence.payload.participants.map(p=>p.userId),[other]);
  const before=io.emits.length;
  a.handler("cursor:move")({projectId:project,x:1,y:1}); a.handler("project:typing")({projectId:project,isTyping:true}); a.handler("turn:request")({projectId:project});
  assert.equal(a.relays.length,0); assert.equal(io.emits.length,before);
  for (const [event,payload] of [["canvas:commit",{projectId:project,baseVersion:0,ops:[addOp("n")]}],["canvas:sync",{projectId:project}]]) {
    const ack=ackCapture(); await a.handler(event)(payload,ack); assert.equal(ack.calls[0].message,"Project not found");
  }
});
it("removing one project's user leaves their socket in another project intact", async () => {
  const user=id(), aProject=id(), bProject=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry();
  const a=createSocket(user,"a"), b=createSocket(user,"b"); attach(io,a,calls,registry); attach(io,b,calls,registry);
  await join(a,aProject,TAB); await join(b,bProject,TAB_B); onMemberChanged(io,aProject,user,null,registry);
  assert.ok(registry.getRoom(bProject).connections.has("b"));
  b.handler("turn:request")({projectId:bProject}); assert.equal(registry.getRoom(bProject).turn.holder.userId,user);
});
it("disconnecting forgets the socket, and an unknown project has no effects", async () => {
  const user=id(), project=id(), calls=stub(()=>"editor"), io=createIo(), registry=createWorkspaceRegistry(), socket=createSocket(user);
  attach(io,socket,calls,registry); await join(socket,project,TAB);
  socket.handler("disconnecting")();
  const count=io.emits.length; onMemberChanged(io,id(),user,null,registry); assert.equal(io.emits.length,count);
  onMemberChanged(io,project,user,null,registry);
  assert.equal(io.emits.filter(e=>e.event==="workspace:removed").length,0);
});
