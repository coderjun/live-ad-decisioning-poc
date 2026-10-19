import { Hono } from "hono";

/** The decision service. Routes arrive with the asset-list contract; for now it only reports health. */
export const app = new Hono().get("/health", (c) => c.json({ ok: true }));
