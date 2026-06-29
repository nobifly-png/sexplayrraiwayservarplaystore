const { detectVideoLink } = require('./src/modules/telegram/link.parser');

const tests = [
  { text: 'https://clipnovawebistefronendvarsel-gyum.vercel.app/watch/abc12345' },
  { text: 'https://realnovahdboxfianlbackendlasttry.onrender.com/api/l/XYZ99999' },
  { text: 'check this https://clipnovawebistefronendvarsel-gyum.vercel.app/watch/Test1234 nice' },
  { text: 'https://1024terabox.com/s/abc123' },
  { text: 'random text no link' },
  { text: 'https://example.com/watch/ShortCode1' },
];

tests.forEach(msg => {
  const result = detectVideoLink(msg);
  console.log('INPUT :', msg.text.slice(0, 70));
  console.log('RESULT:', result ? JSON.stringify(result) : 'null');
  console.log('---');
});
