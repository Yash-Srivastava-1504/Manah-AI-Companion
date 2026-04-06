const fs = require('fs');
class MyReporter {
  onRunComplete(contexts, results) {
    let out = '';
    results.testResults.forEach(result => {
      result.testResults.forEach(tr => {
        if (tr.status === 'failed') {
          out += `\nFAIL: ${tr.fullName}\n${tr.failureMessages.join('\n')}\n`;
        }
      });
    });
    fs.writeFileSync('my_failures.txt', out);
  }
}
module.exports = MyReporter;
