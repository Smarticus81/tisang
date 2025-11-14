import axios from 'axios';
import * as mathjs from 'mathjs';

class UtilityService {
  constructor() {
    this.weatherApiKey = process.env.OPENWEATHER_API_KEY || '';
    this.cryptoApiKey = process.env.COINMARKETCAP_API_KEY || '';
  }

  // Weather
  async getWeather(location, units = 'imperial') {
    try {
      if (!this.weatherApiKey) {
        // Fallback to free weather API
        const response = await axios.get(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
        const data = response.data;
        const current = data.current_condition[0];

        return {
          location: location,
          temperature: units === 'celsius' ? current.temp_C : current.temp_F,
          unit: units === 'celsius' ? '°C' : '°F',
          condition: current.weatherDesc[0].value,
          humidity: current.humidity + '%',
          windSpeed: current.windspeedMiles + ' mph',
          feelsLike: units === 'celsius' ? current.FeelsLikeC : current.FeelsLikeF
        };
      }

      const unitsParam = units === 'celsius' ? 'metric' : 'imperial';
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=${unitsParam}&appid=${this.weatherApiKey}`
      );

      return {
        location: response.data.name,
        temperature: Math.round(response.data.main.temp),
        unit: units === 'celsius' ? '°C' : '°F',
        condition: response.data.weather[0].description,
        humidity: response.data.main.humidity + '%',
        windSpeed: response.data.wind.speed + (units === 'celsius' ? ' m/s' : ' mph'),
        feelsLike: Math.round(response.data.main.feels_like)
      };
    } catch (error) {
      throw new Error('Failed to fetch weather data: ' + error.message);
    }
  }

  // Calculator
  calculate(expression) {
    try {
      const result = mathjs.evaluate(expression);
      return {
        expression,
        result: typeof result === 'number' ? Number(result.toFixed(10)) : result
      };
    } catch (error) {
      throw new Error('Invalid expression: ' + error.message);
    }
  }

  // Unit Conversion
  convertUnits(value, from, to) {
    try {
      const result = mathjs.unit(value, from).toNumber(to);
      return {
        value,
        from,
        to,
        result: Number(result.toFixed(6))
      };
    } catch (error) {
      throw new Error('Unit conversion failed: ' + error.message);
    }
  }

  // Translation
  async translateText(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      // Using LibreTranslate free API
      const response = await axios.post('https://libretranslate.com/translate', {
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: 'text'
      });

      return {
        original: text,
        translated: response.data.translatedText,
        sourceLanguage: response.data.detectedLanguage?.language || sourceLanguage,
        targetLanguage
      };
    } catch (error) {
      throw new Error('Translation failed: ' + error.message);
    }
  }

  // Dictionary
  async getDefinition(word) {
    try {
      const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const data = response.data[0];

      return {
        word: data.word,
        phonetic: data.phonetic || '',
        meanings: data.meanings.slice(0, 3).map(m => ({
          partOfSpeech: m.partOfSpeech,
          definition: m.definitions[0].definition,
          example: m.definitions[0].example || ''
        }))
      };
    } catch (error) {
      throw new Error('Definition not found');
    }
  }

  // Wikipedia
  async wikipediaSearch(query, sentences = 3) {
    try {
      const response = await axios.get('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query));

      return {
        title: response.data.title,
        summary: response.data.extract,
        url: response.data.content_urls.desktop.page,
        thumbnail: response.data.thumbnail?.source || null
      };
    } catch (error) {
      throw new Error('Wikipedia search failed: ' + error.message);
    }
  }

  // Stock Price
  async getStockPrice(symbol) {
    try {
      // Using free Yahoo Finance alternative API
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`);
      const data = response.data.chart.result[0];
      const quote = data.meta;

      return {
        symbol: symbol.toUpperCase(),
        price: quote.regularMarketPrice,
        change: quote.regularMarketPrice - quote.previousClose,
        changePercent: ((quote.regularMarketPrice - quote.previousClose) / quote.previousClose * 100).toFixed(2),
        currency: quote.currency
      };
    } catch (error) {
      throw new Error('Stock data not found: ' + error.message);
    }
  }

  // Crypto Price
  async getCryptoPrice(symbol, currency = 'USD') {
    try {
      // Using free CoinGecko API
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=${currency.toLowerCase()}&include_24hr_change=true`);

      const coinId = symbol.toLowerCase();
      if (!response.data[coinId]) {
        // Try with common mappings
        const mappings = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', ada: 'cardano' };
        const mappedId = mappings[coinId];
        if (mappedId && response.data[mappedId]) {
          const data = response.data[mappedId];
          return {
            symbol: symbol.toUpperCase(),
            price: data[currency.toLowerCase()],
            change24h: data[`${currency.toLowerCase()}_24h_change`]?.toFixed(2) || 0,
            currency: currency.toUpperCase()
          };
        }
        throw new Error('Cryptocurrency not found');
      }

      const data = response.data[coinId];
      return {
        symbol: symbol.toUpperCase(),
        price: data[currency.toLowerCase()],
        change24h: data[`${currency.toLowerCase()}_24h_change`]?.toFixed(2) || 0,
        currency: currency.toUpperCase()
      };
    } catch (error) {
      throw new Error('Crypto data not found: ' + error.message);
    }
  }

  // Time
  getTime(timezone) {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      return {
        timezone,
        time: formatter.format(now),
        timestamp: now.toISOString()
      };
    } catch (error) {
      throw new Error('Invalid timezone: ' + error.message);
    }
  }

  // Image Search
  async searchImages(query, maxResults = 5) {
    try {
      // Using DuckDuckGo image search (no API key needed)
      const response = await axios.get('https://duckduckgo.com/', {
        params: { q: query, iax: 'images', ia: 'images' }
      });

      // Note: DuckDuckGo requires scraping. For production, use Google Custom Search API
      return {
        query,
        message: 'Image search available. For best results, use: "search for ' + query + ' images"',
        suggestion: 'Visit: https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images'
      };
    } catch (error) {
      return {
        query,
        message: 'Visit: https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images'
      };
    }
  }

  // Video Search
  async searchVideos(query, maxResults = 5) {
    try {
      return {
        query,
        message: 'Video search available. For best results, use: "search for ' + query + ' videos"',
        suggestion: 'Visit: https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
      };
    } catch (error) {
      return {
        query,
        message: 'Visit: https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
      };
    }
  }

  // Advanced Web Search
  async advancedWebSearch(query, options = {}) {
    try {
      let searchQuery = query;

      if (options.site) {
        searchQuery += ` site:${options.site}`;
      }

      if (options.timeRange) {
        const timeMap = {
          day: 'd',
          week: 'w',
          month: 'm',
          year: 'y'
        };
        searchQuery += ` tbs:qdr:${timeMap[options.timeRange] || 'd'}`;
      }

      // Use DuckDuckGo for privacy-focused search
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: searchQuery,
          format: 'json',
          no_html: 1,
          skip_disambig: 1
        }
      });

      const results = [];
      if (response.data.AbstractText) {
        results.push({
          title: response.data.Heading,
          snippet: response.data.AbstractText,
          url: response.data.AbstractURL
        });
      }

      if (response.data.RelatedTopics) {
        response.data.RelatedTopics.slice(0, options.maxResults || 5).forEach(topic => {
          if (topic.Text) {
            results.push({
              title: topic.Text.split(' - ')[0],
              snippet: topic.Text,
              url: topic.FirstURL
            });
          }
        });
      }

      return {
        query: searchQuery,
        results: results.slice(0, options.maxResults || 5)
      };
    } catch (error) {
      throw new Error('Advanced search failed: ' + error.message);
    }
  }
}

export default UtilityService;
