import fetch from 'node-fetch';

class SearchService {
  constructor() {
    // Using DuckDuckGo Instant Answer API (free, no API key required)
    this.searchEndpoint = 'https://api.duckduckgo.com/';
  }

  async search(query, maxResults = 5) {
    try {
      // DuckDuckGo Instant Answer API
      const response = await fetch(`${this.searchEndpoint}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      const data = await response.json();

      const results = [];

      // Add abstract if available
      if (data.Abstract) {
        results.push({
          title: data.Heading || 'Quick Answer',
          snippet: data.Abstract,
          url: data.AbstractURL,
          type: 'instant_answer'
        });
      }

      // Add definition if available
      if (data.Definition) {
        results.push({
          title: 'Definition',
          snippet: data.Definition,
          url: data.DefinitionURL,
          type: 'definition'
        });
      }

      // Add related topics
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        for (const topic of data.RelatedTopics.slice(0, Math.max(3, maxResults - results.length))) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'Related Topic',
              snippet: topic.Text,
              url: topic.FirstURL,
              type: 'related_topic'
            });
          }
        }
      }

      // If no results from DuckDuckGo, try a basic search suggestion
      if (results.length === 0) {
        results.push({
          title: `Search for "${query}"`,
          snippet: `I found limited information about "${query}". You might want to search for this topic on your preferred search engine for more detailed results.`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          type: 'search_suggestion'
        });
      }

      return results.slice(0, maxResults);
    } catch (error) {
      console.error('Search failed:', error);
      return [{
        title: 'Search Unavailable',
        snippet: `Sorry, I couldn't search for "${query}" right now. Please try again later.`,
        url: null,
        type: 'error'
      }];
    }
  }

  async getNews(topic = 'technology', maxResults = 3) {
    try {
      // Using DuckDuckGo for news-related searches
      const newsQuery = `${topic} news recent`;
      const response = await fetch(`${this.searchEndpoint}?q=${encodeURIComponent(newsQuery)}&format=json&no_html=1`);
      const data = await response.json();

      const results = [];

      if (data.Abstract) {
        results.push({
          title: `Latest on ${topic}`,
          snippet: data.Abstract,
          url: data.AbstractURL,
          type: 'news'
        });
      }

      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        for (const topic of data.RelatedTopics.slice(0, maxResults)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'News',
              snippet: topic.Text,
              url: topic.FirstURL,
              type: 'news'
            });
          }
        }
      }

      if (results.length === 0) {
        results.push({
          title: `${topic} News`,
          snippet: `I couldn't find recent news about ${topic} right now. You can check news websites for the latest updates.`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(newsQuery)}`,
          type: 'news_suggestion'
        });
      }

      return results.slice(0, maxResults);
    } catch (error) {
      console.error('News search failed:', error);
      return [{
        title: 'News Unavailable',
        snippet: `Sorry, I couldn't get news about "${topic}" right now.`,
        url: null,
        type: 'error'
      }];
    }
  }

  async getFactualInfo(query) {
    try {
      // Try to get factual information using DuckDuckGo
      const response = await fetch(`${this.searchEndpoint}?q=${encodeURIComponent(query)}&format=json&no_html=1`);
      const data = await response.json();

      if (data.AbstractText) {
        return {
          answer: data.AbstractText,
          source: data.AbstractSource,
          url: data.AbstractURL,
          type: 'factual'
        };
      }

      if (data.Answer) {
        return {
          answer: data.Answer,
          source: 'DuckDuckGo',
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          type: 'instant_answer'
        };
      }

      return null;
    } catch (error) {
      console.error('Factual search failed:', error);
      return null;
    }
  }
}

export default SearchService;
