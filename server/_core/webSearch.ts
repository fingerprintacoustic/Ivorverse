/**
 * Web Search Integration
 * Provides live web search capabilities for current information retrieval
 * Supports Google Search, news, and other data sources
 */

import { callDataApi } from "./dataApi";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  date?: string;
  favicon?: string;
};

export type NewsResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date: string;
  image?: string;
};

export type SearchResponse = {
  results: SearchResult[];
  totalResults?: number;
  searchTime?: number;
};

export type NewsResponse = {
  articles: NewsResult[];
  totalResults?: number;
};

/**
 * Perform a web search using Google Search API
 * Returns current, up-to-date search results with source citations
 */
export async function webSearch(query: string, options?: { maxResults?: number; language?: string }): Promise<SearchResponse> {
  try {
    const maxResults = options?.maxResults || 10;
    const language = options?.language || "en";

    // Call Google Search API via data API
    const response = await callDataApi("Google/search", {
      query: {
        q: query,
        num: String(Math.min(maxResults, 20)), // Google Search supports up to 20 results
        hl: language,
        gl: "US",
      },
    });

    // Parse Google Search results
    if (!response || typeof response !== "object") {
      return { results: [], totalResults: 0 };
    }

    const results: SearchResult[] = [];

    // Handle organic search results
    if (Array.isArray((response as Record<string, unknown>).organic_results)) {
      const organicResults = (response as Record<string, unknown>).organic_results as Array<Record<string, unknown>>;
      for (const result of organicResults.slice(0, maxResults)) {
        if (result.title && result.link) {
          results.push({
            title: String(result.title),
            url: String(result.link),
            snippet: String(result.snippet || ""),
            source: extractDomain(String(result.link)),
            date: result.date ? String(result.date) : undefined,
          });
        }
      }
    }

    return {
      results,
      totalResults: (response as Record<string, unknown>).search_information
        ? Number((response as Record<string, unknown>).search_information)
        : results.length,
      searchTime: (response as Record<string, unknown>).search_time ? Number((response as Record<string, unknown>).search_time) : undefined,
    };
  } catch (error) {
    console.error("[WebSearch] Error performing web search:", error);
    return { results: [], totalResults: 0 };
  }
}

/**
 * Search for news articles using Google News API
 * Returns current news with dates and sources
 */
export async function newsSearch(query: string, options?: { maxResults?: number; language?: string }): Promise<NewsResponse> {
  try {
    const maxResults = options?.maxResults || 10;
    const language = options?.language || "en";

    // Call Google News API via data API
    const response = await callDataApi("Google/news", {
      query: {
        q: query,
        num: String(Math.min(maxResults, 20)),
        hl: language,
        gl: "US",
      },
    });

    if (!response || typeof response !== "object") {
      return { articles: [], totalResults: 0 };
    }

    const articles: NewsResult[] = [];

    // Handle news results
    if (Array.isArray((response as Record<string, unknown>).news_results)) {
      const newsResults = (response as Record<string, unknown>).news_results as Array<Record<string, unknown>>;
      for (const article of newsResults.slice(0, maxResults)) {
        if (article.title && article.link) {
          articles.push({
            title: String(article.title),
            url: String(article.link),
            snippet: String(article.snippet || ""),
            source: String(article.source || extractDomain(String(article.link))),
            date: String(article.date || new Date().toISOString()),
            image: article.image ? String(article.image) : undefined,
          });
        }
      }
    }

    return {
      articles,
      totalResults: articles.length,
    };
  } catch (error) {
    console.error("[WebSearch] Error performing news search:", error);
    return { articles: [], totalResults: 0 };
  }
}

/**
 * Search for current stock prices
 */
export async function stockSearch(symbol: string): Promise<Record<string, unknown> | null> {
  try {
    // Call stock price API via data API
    const response = await callDataApi("Finance/stock", {
      query: {
        symbol: symbol.toUpperCase(),
      },
    });

    return response as Record<string, unknown>;
  } catch (error) {
    console.error("[WebSearch] Error fetching stock price:", error);
    return null;
  }
}

/**
 * Extract domain from URL for source attribution
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

/**
 * Format search results with citations for LLM consumption
 */
export function formatSearchResultsForLLM(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No search results found.";
  }

  const formatted = results
    .map(
      (result, index) =>
        `[${index + 1}] ${result.title}\nSource: ${result.source}${result.date ? ` (${result.date})` : ""}\nURL: ${result.url}\nSnippet: ${result.snippet}`
    )
    .join("\n\n");

  return `Search Results:\n\n${formatted}`;
}

/**
 * Format news results with citations for LLM consumption
 */
export function formatNewsResultsForLLM(articles: NewsResult[]): string {
  if (articles.length === 0) {
    return "No news articles found.";
  }

  const formatted = articles
    .map(
      (article, index) =>
        `[${index + 1}] ${article.title}\nSource: ${article.source} | Date: ${article.date}\nURL: ${article.url}\nSnippet: ${article.snippet}`
    )
    .join("\n\n");

  return `Latest News:\n\n${formatted}`;
}

/**
 * Detect if a query is asking for current information
 */
export function isCurrentInfoQuery(query: string): boolean {
  const currentInfoKeywords = [
    "current",
    "today",
    "now",
    "latest",
    "recent",
    "2026",
    "2025",
    "this year",
    "this month",
    "this week",
    "breaking",
    "news",
    "president",
    "stock price",
    "weather",
    "sports score",
    "election",
    "right now",
    "at the moment",
    "currently",
  ];

  const lowerQuery = query.toLowerCase();
  return currentInfoKeywords.some((keyword) => lowerQuery.includes(keyword));
}

/**
 * Get current date and time for context
 */
export function getCurrentContext(): string {
  const now = new Date();
  return `Current date and time: ${now.toISOString()} (${now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} at ${now.toLocaleTimeString("en-US")})`;
}
