import { z } from "zod";
import { W, H } from "./world";
export const saveSchema = z.object({
  version: z.literal(1),
  seed: z.number().int().min(0).max(1000000),
  tiles: z.array(z.number().int().min(0).max(13)).length(W * H),
  player: z.object({
    x: z
      .number()
      .min(0)
      .max(W * 24 - 16),
    y: z
      .number()
      .min(0)
      .max(H * 24 - 34),
    hp: z.number().min(0).max(100),
  }),
  inventory: z.record(
    z.string().regex(/^(?:[1-9]|1[012])$/),
    z.number().int().min(0).max(1000000),
  ),
  tool: z.number().int().min(0).max(3),
  born: z.number().int().min(0).max(4102444800000),
  updated: z.number().int().min(0).max(4102444800000),
  stats: z.object({
    mined: z.number().int().nonnegative(),
    placed: z.number().int().nonnegative(),
    crafted: z.number().int().nonnegative(),
    kills: z.number().int().nonnegative(),
  }),
});
