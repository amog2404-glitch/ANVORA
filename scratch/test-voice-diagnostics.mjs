// scratch/test-voice-diagnostics.mjs
// ANVORA 1.0 — Voice & Microphone Subsystem Diagnostics and Unit Verification Suite

import assert from 'node:assert/strict';

console.log('='.repeat(70));
console.log('ANVORA 1.0 — VOICE & AUDIO SUBSYSTEM AUTOMATED DIAGNOSTIC SUITE');
console.log('='.repeat(70));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

// 1. Text Preprocessing for Speech (Markdown stripping)
function cleanTextForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#+/g, '')
    .replace(/(\*\*|\*|__|_|~~|`)/g, '')
    .replace(/^[*\-+>]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

test('TTS Text Preprocessing: Strips bold, italics, code blocks and raw URLs', () => {
  const input = '### Weather Update\nHere is the **current temperature** `24°C`.\nVisit [AccuWeather](https://accuweather.com) or https://weather.com for details.\n```\nconst x = 10;\n```\n* High humidity';
  const cleaned = cleanTextForSpeech(input);
  
  assert.ok(!cleaned.includes('###'), 'Headers should be stripped');
  assert.ok(!cleaned.includes('**'), 'Bold markdown should be stripped');
  assert.ok(!cleaned.includes('`'), 'Code ticks should be stripped');
  assert.ok(!cleaned.includes('```'), 'Code fences should be stripped');
  assert.ok(!cleaned.includes('const x = 10'), 'Code block content should be removed');
  assert.ok(!cleaned.includes('https://'), 'Bare URLs and markdown links should not be spoken as URLs');
  assert.ok(cleaned.includes('AccuWeather'), 'Link text should be retained for natural reading');
  assert.ok(cleaned.includes('current temperature'), 'Prose should be intact');
});

test('TTS Text Preprocessing: Handles empty, whitespace, and formatting-only strings', () => {
  assert.equal(cleanTextForSpeech(''), '');
  assert.equal(cleanTextForSpeech('   \n\t  '), '');
  assert.equal(cleanTextForSpeech('** ** ` ` ### '), '');
});

// 2. Multilingual Voice Selection Logic
function findVoiceForLanguage(voices, langCode) {
  if (langCode === 'hi') {
    return voices.find(v => v.lang.toLowerCase().startsWith('hi')) ||
           voices.find(v => /hindi|swara|madhur|kalpana|hemant/i.test(v.name));
  }
  if (langCode === 'te') {
    return voices.find(v => v.lang.toLowerCase().startsWith('te')) ||
           voices.find(v => /telugu|shruti|chitra|mohan/i.test(v.name));
  }
  // Default to English
  return voices.find(v => v.name.includes('Google US English')) ||
         voices.find(v => v.name.includes('Google UK English Female')) ||
         voices.find(v => v.name.includes('Natural') && v.name.includes('Female')) ||
         voices.find(v => v.name.includes('Microsoft Zira') || v.name.includes('Microsoft Jenny')) ||
         voices.find(v => v.lang.toLowerCase().startsWith('en'));
}

test('Voice Selection: Correctly identifies Hindi voice', () => {
  const mockVoices = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Microsoft Heera', lang: 'te-IN' }
  ];
  const hiVoice = findVoiceForLanguage(mockVoices, 'hi');
  assert.equal(hiVoice?.name, 'Google हिन्दी');
  assert.equal(hiVoice?.lang, 'hi-IN');
});

test('Voice Selection: Correctly identifies Telugu voice', () => {
  const mockVoices = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google हिन्दी', lang: 'hi-IN' },
    { name: 'Microsoft Mohan - Telugu', lang: 'te-IN' }
  ];
  const teVoice = findVoiceForLanguage(mockVoices, 'te');
  assert.equal(teVoice?.name, 'Microsoft Mohan - Telugu');
  assert.equal(teVoice?.lang, 'te-IN');
});

test('Voice Selection: Falls back to premium English voice for en', () => {
  const mockVoices = [
    { name: 'Microsoft David', lang: 'en-US' },
    { name: 'Microsoft Zira', lang: 'en-US' }
  ];
  const enVoice = findVoiceForLanguage(mockVoices, 'en');
  assert.equal(enVoice?.name, 'Microsoft Zira');
});

// 3. Audio Queue Sequencer Mutex Simulation
class MockAudioQueue {
  constructor() {
    this.queue = [];
    this.isQueueBusy = false;
    this.history = [];
  }

  async speak(text) {
    return new Promise((resolve) => {
      this.queue.push(async () => {
        try {
          // Simulate TTS playback duration
          this.history.push({ event: 'start', text, time: Date.now() });
          await new Promise(r => setTimeout(r, 20));
          this.history.push({ event: 'end', text, time: Date.now() });
        } finally {
          this.isQueueBusy = false;
          resolve();
          this.processQueue();
        }
      });
      this.processQueue();
    });
  }

  processQueue() {
    if (this.queue.length > 0 && !this.isQueueBusy) {
      const next = this.queue.shift();
      if (next) {
        this.isQueueBusy = true;
        next();
      }
    }
  }
}

await asyncTest('Audio Queue Mutex: Enforces strictly sequential playback without overlaps', async () => {
  const player = new MockAudioQueue();
  
  // Dispatch 3 speaks concurrently
  const p1 = player.speak('First sentence');
  const p2 = player.speak('Second sentence');
  const p3 = player.speak('Third sentence');

  await Promise.all([p1, p2, p3]);

  assert.equal(player.history.length, 6, 'Must have 3 starts and 3 ends');
  assert.equal(player.history[0].text, 'First sentence');
  assert.equal(player.history[0].event, 'start');
  assert.equal(player.history[1].text, 'First sentence');
  assert.equal(player.history[1].event, 'end');

  assert.equal(player.history[2].text, 'Second sentence');
  assert.equal(player.history[2].event, 'start');
  assert.equal(player.history[3].text, 'Second sentence');
  assert.equal(player.history[3].event, 'end');

  assert.equal(player.history[4].text, 'Third sentence');
  assert.equal(player.history[4].event, 'start');
  assert.equal(player.history[5].text, 'Third sentence');
  assert.equal(player.history[5].event, 'end');
});

// 4. STT Language Mapping
function getSTTLanguageCode(lang) {
  if (lang === 'hi') return 'hi-IN';
  if (lang === 'te') return 'te-IN';
  return 'en-IN';
}

test('STT Language Mapping: Maps supported languages to Indian locales', () => {
  assert.equal(getSTTLanguageCode('en'), 'en-IN');
  assert.equal(getSTTLanguageCode('hi'), 'hi-IN');
  assert.equal(getSTTLanguageCode('te'), 'te-IN');
});

// 5. SpeechRecognition API Prefix Check
test('SpeechRecognition API: Supports both standard and webkit prefixes', () => {
  const mockWindowWithWebkit = { webkitSpeechRecognition: class WebkitSR {} };
  const mockWindowWithStandard = { SpeechRecognition: class StandardSR {} };
  const mockWindowNone = {};

  const getAPI = (win) => win.SpeechRecognition || win.webkitSpeechRecognition;

  assert.ok(getAPI(mockWindowWithWebkit));
  assert.ok(getAPI(mockWindowWithStandard));
  assert.equal(getAPI(mockWindowNone), undefined);
});

// 6. VoiceBridge State Transitions
class MockVoiceBridge {
  constructor() {
    this.state = 'idle';
    this.listeners = [];
  }
  subscribe(fn) {
    this.listeners.push(fn);
  }
  setState(st) {
    this.state = st;
    this.listeners.forEach(fn => fn(st));
  }
}

test('VoiceBridge: Accurately propagates state changes to UI listeners', () => {
  const bridge = new MockVoiceBridge();
  const states = [];
  bridge.subscribe((s) => states.push(s));

  bridge.setState('listening');
  bridge.setState('processing');
  bridge.setState('speaking');
  bridge.setState('idle');

  assert.deepEqual(states, ['listening', 'processing', 'speaking', 'idle']);
});

console.log('\n' + '-'.repeat(70));
console.log(`VOICE DIAGNOSTICS COMPLETE: Passed: ${passed}, Failed: ${failed}`);
console.log('-'.repeat(70));

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
