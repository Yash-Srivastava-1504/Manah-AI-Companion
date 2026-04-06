const fs = require('fs');
let text = fs.readFileSync('test.json', 'utf8');
const p = text.indexOf('{');
if (p !== -1) {
  text = text.slice(p);
  const data = JSON.parse(text);
  let failed = 0;
  data.testResults.forEach(r => {
    r.assertionResults.forEach(a => {
      if (a.status === 'failed') {
          failed++;
          console.log(`\nFAIL: ${r.name.split('\\\\').pop()} -> ${a.title}`);
          const msg = a.failureMessages.join('\n');
          console.log(msg.substring(0, Math.min(msg.length, 500)));
      }
    });
  });
  console.log(`\nTotal Failed: ${failed}`);
} else {
  console.log("No JSON object found in test.json");
}
