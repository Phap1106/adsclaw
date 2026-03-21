
async function main() {
  const apiKey = 'sk-proj-...fake';
  try {
    console.log('Fetching models with fetch...');
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log('Success! Found ' + data.data.length + ' models.');
    console.log('First 5 models:');
    data.data.slice(0, 5).forEach(m => console.log(' - ' + m.id));
  } catch (err) {
    console.error('Error fetching models:');
    console.error(err);
  }
}

main();
