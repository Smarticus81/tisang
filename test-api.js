// Test the /api/token endpoint
fetch('https://tisang.vercel.app/api/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({})
})
.then(response => {
  console.log('Status:', response.status);
  console.log('Headers:', Object.fromEntries(response.headers.entries()));
  return response.text();
})
.then(text => {
  console.log('Raw Response:', text);
  try {
    const data = JSON.parse(text);
    console.log('Parsed JSON:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Not valid JSON');
  }
})
.catch(error => {
  console.error('Error:', error);
});
