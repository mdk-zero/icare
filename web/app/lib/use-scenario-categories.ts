"use client";

import { fetchScenarioCategories } from "./api";
import { usePageData } from "./use-page-data";

const NO_CATEGORIES: string[] = [];

/**
 * The scenario category list, shared by every page that picks one. After
 * creating categories, pass the list the create call returned to
 * `setCategories` so every open picker updates without a refetch.
 */
export function useScenarioCategories() {
  const { data, loading, setData } = usePageData(
    "faculty:scenario-categories",
    fetchScenarioCategories,
  );
  return { categories: data ?? NO_CATEGORIES, loading, setCategories: setData };
}
