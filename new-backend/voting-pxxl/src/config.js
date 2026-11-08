import fs from "node:fs";

const categories = JSON.parse(fs.readFileSync(new URL("../public/categories.json", import.meta.url), "utf8"));
const nomineeImages = JSON.parse(fs.readFileSync(new URL("../public/nominee-images.json", import.meta.url), "utf8"));

// Category and nominee IDs are stored in Postgres and must remain stable.
export const CATEGORIES = categories.map((category) => ({
  ...category,
  nominees: category.nominees.map((name, index) => ({
    id: `${category.id}-${index + 1}`,
    name,
    image: nomineeImages[name] || null,
  })),
}));
