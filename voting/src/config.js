import categories from "../public/categories.json" with { type: "json" };

// Category and nominee IDs are part of the stored vote records.
export const CATEGORIES = categories.map((category) => ({
  ...category,
  nominees: category.nominees.map((name, index) => ({
    id: `${category.id}-${index + 1}`,
    name,
  })),
}));
