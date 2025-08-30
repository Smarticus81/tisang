// Test WebRTC connection to OpenAI Realtime API
const testWebRTCConnection = async () => {
  try {
    // Get ephemeral token from our backend
    const tokenResponse = await fetch('https://tisang-production.up.railway.app/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!tokenResponse.ok) {
      console.error('Failed to get token:', await tokenResponse.text());
      return;
    }
    
    const tokenData = await tokenResponse.json();
    const token = tokenData.token;
    console.log('✅ Got token:', token.substring(0, 10) + '...');
    
    // Create a minimal WebRTC peer connection
    const pc = new RTCPeerConnection();
    
    // Create data channel
    const dc = pc.createDataChannel("oai-events");
    
    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    console.log('📡 SDP Offer created, making request to OpenAI...');
    
    // Test different model names
    const modelsToTest = ['gpt-realtime', 'gpt-4o-realtime-preview-2024-12-17'];
    
    for (const model of modelsToTest) {
      console.log(`🧪 Testing model: ${model}`);
      
      try {
        const response = await fetch(`https://api.openai.com/v1/realtime/calls?model=${model}`, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/sdp',
          },
        });
        
        console.log(`📊 Response status for ${model}:`, response.status);
        console.log(`📊 Response headers:`, Object.fromEntries(response.headers.entries()));
        
        if (response.ok) {
          const sdp = await response.text();
          console.log(`✅ Success with ${model}! SDP length:`, sdp.length);
          break;
        } else {
          const errorText = await response.text();
          console.log(`❌ Error with ${model}:`, errorText);
        }
      } catch (err) {
        console.log(`💥 Request failed for ${model}:`, err.message);
      }
    }
    
    pc.close();
  } catch (error) {
    console.error('🚨 Test failed:', error);
  }
};

// Run the test
testWebRTCConnection();
