// EDIT THIS: your categories and nominees. IDs must stay stable once voting starts.
// The server validates every vote against this list, so nobody can vote for an unknown nominee.
export const CATEGORIES = [
  {
    id: "best-newcomer",
    name: "Best Newcomer",
    nominees: [
      { id: "bn-1", name: "Nominee One" },
      { id: "bn-2", name: "Nominee Two" },
      { id: "bn-3", name: "Nominee Three" },
    ],
  },
  {
    id: "best-innovator",
    name: "Best Innovator",
    nominees: [
      { id: "bi-1", name: "Nominee One" },
      { id: "bi-2", name: "Nominee Two" },
      { id: "bi-3", name: "Nominee Three" },
    ],
  },
  {
    id: "person-of-the-year",
    name: "Person of the Year",
    nominees: [
      { id: "py-1", name: "Nominee One" },
      { id: "py-2", name: "Nominee Two" },
      { id: "py-3", name: "Nominee Three" },
    ],
  },
];
