import { config } from "../config.js";
import { MemoryBusinessStore } from "./memoryBusinessStore.js";
import { PrismaBusinessStore } from "./prismaBusinessStore.js";
import type { BusinessStore } from "./types.js";

export function createBusinessStore(): BusinessStore {
  return config.databaseUrl ? new PrismaBusinessStore(config.databaseUrl) : new MemoryBusinessStore();
}

export type * from "./types.js";
