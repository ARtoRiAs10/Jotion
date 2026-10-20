import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { ConvexYjsProvider, colorForUser } from "@/lib/collaboration";

/**
 * A fake server: it keeps the updates of every document and hands them to
 * the other clients.
 */
const createServer = () => {
  const updates: string[] = [];
  const listeners: (() => void)[] = [];

  return {
    updates,
    push: (update: string) => {
      updates.push(update);
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.push(listener);
    },
    deliver: (provider: ConvexYjsProvider) => {
      provider.applyUpdates([...updates]);
    },
  };
};

const createClient = (server: ReturnType<typeof createServer>, id: string) => {
  const provider = new ConvexYjsProvider({
    documentId: "doc-1",
    user: { name: id, color: colorForUser(id) },
    push: server.push,
    leave: () => undefined,
  });
  return provider;
};

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

describe("collaborative editing", () => {
  it("merges concurrent edits without losing changes", async () => {
    const server = createServer();
    const ada = createClient(server, "ada");
    const linus = createClient(server, "linus");

    // Both clients start from the same content.
    ada.fragment.insert(0, [new Y.XmlElement("paragraph")]);
    await wait();
    server.deliver(linus);

    expect(linus.fragment.length).toBe(1);

    // Ada types something …
    ada.fragment.get(0).setAttribute("text", "Hello");
    await wait();

    // … and Linus types something else at the same time.
    linus.fragment.get(0).setAttribute("color", "blue");
    await wait();

    // Now the updates are exchanged.
    server.deliver(ada);
    server.deliver(linus);

    // Both documents converged.
    const adaState = JSON.stringify(ada.fragment.toJSON());
    const linusState = JSON.stringify(linus.fragment.toJSON());
    expect(adaState).toBe(linusState);
    expect(adaState).toContain("Hello");
    expect(adaState).toContain("blue");

    ada.destroy();
    linus.destroy();
  });

  it("does not push the updates that came from the server back", async () => {
    const server = createServer();
    const ada = createClient(server, "ada");
    const linus = createClient(server, "linus");

    ada.fragment.insert(0, [new Y.XmlElement("paragraph")]);
    await wait();
    const pushed = server.updates.length;

    server.deliver(linus);
    await wait();

    // Linus did not push anything back.
    expect(server.updates.length).toBe(pushed);

    ada.destroy();
    linus.destroy();
  });

  it("tracks the presence of the collaborators", () => {
    const server = createServer();
    const ada = createClient(server, "ada");
    const linus = createClient(server, "linus");

    ada.setPresence({ name: "Ada", color: "#E8384F" });
    linus.setPresence({ name: "Linus", color: "#1B84E4" });

    ada.awareness.setRemoteStates([
      { clientId: linus.clientId_, name: "Linus", color: "#1B84E4" },
    ]);

    const states = Array.from(ada.awareness.getStates().values());
    expect(states.length).toBe(2);
    expect(
      states.some((state) => (state.user as { name: string })?.name === "Linus"),
    ).toBe(true);

    ada.destroy();
    linus.destroy();
  });

  it("gives every user a stable cursor colour", () => {
    expect(colorForUser("user_1")).toBe(colorForUser("user_1"));
    expect(colorForUser("user_1")).not.toBe(colorForUser("user_2"));
  });
});
