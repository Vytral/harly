import { describe, expect, it } from "vitest";

import { emptyCanvasGraph } from "../../definition/schema-v2";
import { addNode, connectNodes, type EditorSnapshot } from "../state/commands";
import { createBlock } from "../state/blocks";
import { asLiteral, bindingOptionsFor } from "./bindings";

describe("BindingPicker options", () => {
  it("preserves nested JSON config values instead of stringifying them", () => {
    const binding = asLiteral([
      { title: "Passport", instructions: "Upload a scan" },
      { title: "Tax form", instructions: "Optional" },
    ]);

    expect(binding).toEqual({
      kind: "literal",
      value: [
        { title: "Passport", instructions: "Upload a scan" },
        { title: "Tax form", instructions: "Optional" },
      ],
    });
  });

  it("disables outputs from a branch that is not guaranteed to run", () => {
    let snapshot: EditorSnapshot = { graph: emptyCanvasGraph(), layout: { positions: {}, collapsedNodeIds: [] } };
    const condition = createBlock("condition");
    const yes = createBlock("action", { actionType: "add_tag" });
    const no = createBlock("action", { actionType: "add_note" });
    snapshot = addNode(snapshot, condition, { x: 0, y: 80 });
    snapshot = addNode(snapshot, yes, { x: -80, y: 180 });
    snapshot = addNode(snapshot, no, { x: 80, y: 180 });
    const a = connectNodes(snapshot, { source: "trigger", port: "next", target: condition.id });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = connectNodes(a.snapshot, { source: condition.id, port: "true", target: yes.id });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const c = connectNodes(b.snapshot, { source: condition.id, port: "false", target: no.id });
    expect(c.ok).toBe(true);
    if (!c.ok) return;

    const options = bindingOptionsFor(c.snapshot.graph, no.id);
    const fromYes = options.filter((item) => item.id.includes(yes.id));
    expect(fromYes.length).toBeGreaterThan(0);
    expect(fromYes.every((item) => item.disabled)).toBe(true);
    expect(fromYes[0]?.reason).toMatch(/branch/i);
  });

  it("exposes the uploaded request id for a downstream signature step", () => {
    let snapshot: EditorSnapshot = { graph: emptyCanvasGraph(), layout: { positions: {}, collapsedNodeIds: [] } };
    const request = createBlock("action", { actionType: "request_documents" });
    const signature = createBlock("action", { actionType: "send_document_for_signature" });
    snapshot = addNode(snapshot, request, { x: 0, y: 80 });
    snapshot = addNode(snapshot, signature, { x: 0, y: 180 });
    const first = connectNodes(snapshot, { source: "trigger", port: "next", target: request.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = connectNodes(first.snapshot, { source: request.id, port: "success", target: signature.id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const options = bindingOptionsFor(second.snapshot.graph, signature.id);
    expect(options.some((item) => item.id === `output:${request.id}:primaryRequestId` && !item.disabled)).toBe(true);
  });

  it("exposes durable IDs for chained offer and interview actions", () => {
    let snapshot: EditorSnapshot = { graph: emptyCanvasGraph(), layout: { positions: {}, collapsedNodeIds: [] } };
    const offer = createBlock("action", { actionType: "create_offer" });
    const sendOffer = createBlock("action", { actionType: "send_offer" });
    snapshot = addNode(snapshot, offer, { x: 0, y: 80 });
    snapshot = addNode(snapshot, sendOffer, { x: 0, y: 180 });

    const first = connectNodes(snapshot, { source: "trigger", port: "next", target: offer.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = connectNodes(first.snapshot, { source: offer.id, port: "success", target: sendOffer.id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const chained = bindingOptionsFor(second.snapshot.graph, sendOffer.id);
    expect(chained.some((item) => item.id === `output:${offer.id}:offerId` && !item.disabled)).toBe(true);

    let interviewSnapshot: EditorSnapshot = { graph: emptyCanvasGraph(), layout: { positions: {}, collapsedNodeIds: [] } };
    const interview = createBlock("action", { actionType: "schedule_interview" });
    const reschedule = createBlock("action", { actionType: "reschedule_interview" });
    interviewSnapshot = addNode(interviewSnapshot, interview, { x: 0, y: 80 });
    interviewSnapshot = addNode(interviewSnapshot, reschedule, { x: 0, y: 180 });
    const interviewStart = connectNodes(interviewSnapshot, { source: "trigger", port: "next", target: interview.id });
    expect(interviewStart.ok).toBe(true);
    if (!interviewStart.ok) return;
    const interviewNext = connectNodes(interviewStart.snapshot, { source: interview.id, port: "success", target: reschedule.id });
    expect(interviewNext.ok).toBe(true);
    if (!interviewNext.ok) return;
    const interviewOptions = bindingOptionsFor(interviewNext.snapshot.graph, reschedule.id);
    expect(interviewOptions.some((item) => item.id === `output:${interview.id}:interviewId` && !item.disabled)).toBe(true);
  });

  it("exposes structured HTTP response fields for downstream bindings", () => {
    let snapshot: EditorSnapshot = { graph: emptyCanvasGraph(), layout: { positions: {}, collapsedNodeIds: [] } };
    const request = createBlock("action", { actionType: "http_request" });
    const next = createBlock("action", { actionType: "add_note" });
    snapshot = addNode(snapshot, request, { x: 0, y: 80 });
    snapshot = addNode(snapshot, next, { x: 0, y: 180 });

    const first = connectNodes(snapshot, { source: "trigger", port: "next", target: request.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = connectNodes(first.snapshot, { source: request.id, port: "success", target: next.id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const options = bindingOptionsFor(second.snapshot.graph, next.id);
    expect(options.some((item) => item.id === `output:${request.id}:status` && !item.disabled)).toBe(true);
    expect(options.some((item) => item.id === `output:${request.id}:body` && !item.disabled)).toBe(true);
    expect(options.some((item) => item.id === `output:${request.id}:result`)).toBe(false);
  });
});
