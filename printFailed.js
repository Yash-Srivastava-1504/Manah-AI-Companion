const obj = require('./test.json');
let failed = 0;
obj.testResults.forEach(file => {
    file.assertionResults.forEach(res => {
        if(res.status === 'failed') {
            failed++;
            console.log(`\nFAIL: ${file.name.split('\\').pop()} -> ${res.title}`);
            console.log(res.failureMessages[0]);
        }
    });
});
console.log(`\nTotal Failed: ${failed}`);
