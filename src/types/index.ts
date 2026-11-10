export interface Word {
  id: string;
  word: string;
  entryType?: "word" | "phrase";
  definition: string;
  pronounce?: string;
  type?: string;
  example?: string;
  level?: number;
  chineseDefinition?: string;
  synonyms?: string[];
  category?: string;
}
