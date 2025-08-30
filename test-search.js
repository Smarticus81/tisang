// Quick test script for search functionality
import SearchService from './backend/search-service.js';

const searchService = new SearchService();

async function testSearch() {
  console.log('🔍 Testing web search...');
  
  try {
    const results = await searchService.search('artificial intelligence', 3);
    console.log('Search results:', JSON.stringify(results, null, 2));
    
    const news = await searchService.getNews('technology', 2);
    console.log('News results:', JSON.stringify(news, null, 2));
    
    const fact = await searchService.getFactualInfo('what is machine learning');
    console.log('Factual info:', JSON.stringify(fact, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testSearch();
