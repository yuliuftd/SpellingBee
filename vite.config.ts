import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

interface VocabularyEntry {
  id: string;
  word: string;
  definition: string;
  pronounce: string;
  type: string;
  level: number;
  chineseDefinition: string;
  synonyms: string[];
  category: string;
}

class ApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new ApiError(413, "Request body is too large.");
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

function normalizeEntry(value: unknown): VocabularyEntry {
  const entry = asRecord(value);
  const word = typeof entry?.word === "string" ? entry.word.trim() : "";
  const pronunciation = typeof entry?.pronounce === "string" ? entry.pronounce.trim() : "";
  const chineseDefinition = typeof entry?.chineseDefinition === "string"
    ? entry.chineseDefinition.trim()
    : "";
  const rawSynonyms = Array.isArray(entry?.synonyms) ? entry.synonyms : [];
  const synonyms = Array.from(new Set(
    rawSynonyms
      .filter((synonym): synonym is string => typeof synonym === "string")
      .map((synonym) => synonym.trim())
      .filter(Boolean),
  ));

  if (!word || !pronunciation || !chineseDefinition || !synonyms.length) {
    throw new ApiError(400, "Word, pronunciation, Chinese meaning, and at least one synonym are required.");
  }

  const categories = new Set(["Reading vocabulary", "Emotion", "Attitude"]);
  const category = typeof entry?.category === "string" && categories.has(entry.category)
    ? entry.category
    : "Reading vocabulary";

  return {
    id: typeof entry?.id === "string" && entry.id.trim()
      ? entry.id
      : `oc-custom-${randomUUID()}`,
    word,
    definition: chineseDefinition,
    pronounce: pronunciation,
    type: "OC Reading",
    level: 1,
    chineseDefinition,
    synonyms,
    category,
  };
}

function ocVocabularyWriteApi(): Plugin {
  const vocabularyFile = resolve(process.cwd(), "src/data/oc_vocab.json");
  let writeQueue: Promise<void> = Promise.resolve();

  const updateVocabulary = (entry: VocabularyEntry) => {
    const operation = writeQueue.then(async () => {
      const current: unknown = JSON.parse(await readFile(vocabularyFile, "utf8"));
      if (!Array.isArray(current)) throw new Error("OC vocabulary JSON must contain an array.");
      if (current.some((item) => {
        const savedWord = asRecord(item)?.word;
        return typeof savedWord === "string" && savedWord.toLowerCase() === entry.word.toLowerCase();
      })) {
        throw new ApiError(409, `“${entry.word}” already exists in oc_vocab.json.`);
      }

      const updated = [...current, entry];
      const temporaryFile = `${vocabularyFile}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryFile, `${JSON.stringify(updated, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx",
        });
        await rename(temporaryFile, vocabularyFile);
      } catch (error) {
        await rm(temporaryFile, { force: true });
        throw error;
      }
      return updated.length;
    });

    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const handler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          sendJson(response, 403, { error: "Cross-origin writes are not allowed." });
          return;
        }
      } catch {
        sendJson(response, 403, { error: "Invalid request origin." });
        return;
      }
    }

    try {
      const payload = asRecord(await readJsonBody(request));
      const entry = normalizeEntry(payload?.entry);
      const count = await updateVocabulary(entry);
      sendJson(response, 201, { entry, count });
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(response, error.statusCode, { error: error.message });
      } else {
        sendJson(
          response,
          500,
          { error: error instanceof Error ? `Could not write oc_vocab.json: ${error.message}` : "Could not write oc_vocab.json." },
        );
      }
    }
  };

  return {
    name: "oc-vocabulary-write-api",
    configureServer(server) {
      server.middlewares.use("/api/oc-vocabulary", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/oc-vocabulary", handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), ocVocabularyWriteApi()],
});
