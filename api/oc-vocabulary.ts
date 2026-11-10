import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MongoClient, type Collection } from "mongodb";

interface VocabularyEntry {
  id: string;
  word: string;
  entryType?: "word" | "phrase";
  definition: string;
  pronounce?: string;
  type: string;
  level: number;
  chineseDefinition: string;
  synonyms?: string[];
  category: string;
}

interface VocabularyDocument {
  normalizedWord: string;
  entry: VocabularyEntry;
  createdAt: Date;
}

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}

class ApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

let clientPromise: Promise<MongoClient> | undefined;
let indexPromise: Promise<string> | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function normalizeVocabularyTerm(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new ApiError(503, "MongoDB is not configured. Set MONGODB_URI in Vercel.");
  clientPromise ??= new MongoClient(uri).connect();
  return clientPromise;
}

async function getVocabularyCollection(): Promise<Collection<VocabularyDocument>> {
  const client = await getMongoClient();
  const collection = client
    .db(process.env.MONGODB_DB || "spellingbee")
    .collection<VocabularyDocument>("oc_vocabulary");
  indexPromise ??= collection.createIndex({ normalizedWord: 1 }, { unique: true })
    .catch((error: unknown) => {
      indexPromise = undefined;
      throw error;
    });
  await indexPromise;
  return collection;
}

function normalizeEntry(value: unknown): VocabularyEntry {
  const valueRecord = asRecord(value);
  const word = typeof valueRecord?.word === "string" ? valueRecord.word.trim() : "";
  const entryType = valueRecord?.entryType === undefined ? "word" : valueRecord.entryType;
  const chineseDefinition = typeof valueRecord?.chineseDefinition === "string"
    ? valueRecord.chineseDefinition.trim()
    : "";
  const pronunciation = typeof valueRecord?.pronounce === "string"
    ? valueRecord.pronounce.trim()
    : "";
  const rawSynonyms = Array.isArray(valueRecord?.synonyms) ? valueRecord.synonyms : [];
  const synonyms = Array.from(new Set(
    rawSynonyms
      .filter((synonym): synonym is string => typeof synonym === "string")
      .map((synonym) => synonym.trim())
      .filter(Boolean),
  ));

  if (entryType !== "word" && entryType !== "phrase") {
    throw new ApiError(400, "Entry type must be word or phrase.");
  }
  if (!word || word.length > 100) {
    throw new ApiError(400, "Word or phrase is required and must be 100 characters or fewer.");
  }
  if (!chineseDefinition || chineseDefinition.length > 500) {
    throw new ApiError(400, "Chinese meaning is required and must be 500 characters or fewer.");
  }
  if (pronunciation.length > 200) {
    throw new ApiError(400, "Pronunciation must be 200 characters or fewer.");
  }
  if (
    (entryType === "word" && !synonyms.length) ||
    synonyms.length > 20 ||
    synonyms.some((synonym) => synonym.length > 100)
  ) {
    throw new ApiError(400, "Words need 1 to 20 synonyms, each 100 characters or fewer.");
  }

  const categories = new Set(["Reading vocabulary", "Emotion", "Attitude"]);
  const category = typeof valueRecord?.category === "string" && categories.has(valueRecord.category)
    ? valueRecord.category
    : "Reading vocabulary";

  return {
    id: `oc-custom-${randomUUID()}`,
    word,
    entryType,
    definition: chineseDefinition,
    ...(pronunciation ? { pronounce: pronunciation } : {}),
    type: "OC Reading",
    level: 1,
    chineseDefinition,
    ...(synonyms.length ? { synonyms } : {}),
    category,
  };
}

function hasWritePassword(request: VercelRequest): boolean {
  const expected = process.env.OC_VOCAB_WRITE_PASSWORD;
  const authorization = request.headers.authorization;
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

function verifySameOrigin(request: VercelRequest) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) throw new ApiError(403, "A same-origin browser request is required.");
  try {
    if (new URL(origin).host !== host) throw new ApiError(403, "Cross-origin writes are not allowed.");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, "Invalid request origin.");
  }
}

function getRequestBody(request: VercelRequest): unknown {
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body) as unknown;
    } catch {
      throw new ApiError(400, "Request body must be valid JSON.");
    }
  }
  return request.body;
}

function json(response: VercelResponse, status: number, body: unknown) {
  return response.status(status).json(body);
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  const writePasswordRequired = true;

  if (request.method === "GET") {
    try {
      const collection = await getVocabularyCollection();
      const documents = await collection.find({}, { projection: { _id: 0, entry: 1 } })
        .sort({ normalizedWord: 1 })
        .toArray();
      return json(response, 200, {
        entries: documents.map((document) => document.entry),
        writePasswordRequired,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        return json(response, error.statusCode, { error: error.message, writePasswordRequired });
      }
      console.error("Could not read the OC vocabulary from MongoDB.", error);
      return json(response, 500, {
        error: "Could not read the OC vocabulary. Check Vercel function logs and MongoDB configuration.",
        writePasswordRequired,
      });
    }
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return json(response, 405, { error: "Method not allowed.", writePasswordRequired });
  }

  try {
    verifySameOrigin(request);
    if (!process.env.OC_VOCAB_WRITE_PASSWORD) {
      throw new ApiError(503, "Set OC_VOCAB_WRITE_PASSWORD in Vercel before adding words.");
    }
    if (!hasWritePassword(request)) {
      throw new ApiError(401, "The OC vocabulary write password is incorrect.");
    }

    const payload = asRecord(getRequestBody(request));
    const entry = normalizeEntry(payload?.entry);
    const collection = await getVocabularyCollection();
    await collection.insertOne({
      normalizedWord: normalizeVocabularyTerm(entry.word),
      entry,
      createdAt: new Date(),
    });
    return json(response, 201, { entry });
  } catch (error) {
    if (error instanceof ApiError) {
      return json(response, error.statusCode, { error: error.message, writePasswordRequired });
    }
    if (asRecord(error)?.code === 11000) {
      return json(response, 409, { error: "That entry already exists in the OC vocabulary.", writePasswordRequired });
    }
    console.error("Could not write an OC vocabulary entry to MongoDB.", error);
    return json(response, 500, {
      error: "Could not save this word to MongoDB. Check Vercel function logs and database access.",
      writePasswordRequired,
    });
  }
}
