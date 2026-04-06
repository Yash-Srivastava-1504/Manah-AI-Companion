'use strict';

// Canned Hinglish responses for offline dev / testing
const MOCK_RESPONSES = [
  'Main yahan hoon! 💙 Yeh sunke acha laga ki tumne share kiya. Thoda aur batao — kya chal raha hai tumhare saath?',
  'Bilkul, main samajh sakta hun. Exam ka pressure bahut heavy hota hai, especially jab family expectations bhi ho. Ek kaam karo — ek deep breath lo. Tumhara best hi kaafi hai.',
  'Arre yaar, yeh sab bahut overwhelming lagta hai. But remember, har mushkil waqt guzar jaata hai. Aaj tumne step liya — baatein ki, yeh bhi bahut hota hai. 🌿',
  'Totally valid feel hai yeh. Loneliness real hai, especially tab jab sab apni duniya mein busy ho. Main sun raha hoon — kya specifically tumhe sabse zyada akela feel kara raha hai?',
  'Wow, yeh share karna bada step tha. Relationship mein complications bahut drain karte hain energy. Apna khayal rakhna pehle — tumhara emotional health matter karta hai.',
  "Sometimes just talking about it helps more than you'd think. Main judge nahi kar raha, main sun raha hoon. Aur bolo. ✨",
  'Haan yaar, career anxiety hits different. But you are way more than just your job title or salary. Kya tum mujhe bata sakte ho — tumhe genuinely kya pasand hai karne mein?',
  'Tumhari feelings bilkul valid hain. Kabhi kabhi "okay" nahi hona bhi okay hai. I see you. 💙',
];

let responseIndex = 0;

/**
 * Non-streaming mock: returns a canned reply.
 * @returns {Promise<string>}
 */
async function chat(_messages) {
  // Simulate ~800ms network delay
  await new Promise((r) => setTimeout(r, 800));
  const reply = MOCK_RESPONSES[responseIndex % MOCK_RESPONSES.length];
  responseIndex++;
  return reply;
}

/**
 * Streaming mock: yields the reply word-by-word with 40ms delay.
 * @returns {AsyncGenerator<string>}
 */
async function* streamChat(_messages) {
  await new Promise((r) => setTimeout(r, 400)); // initial delay
  const reply = MOCK_RESPONSES[responseIndex % MOCK_RESPONSES.length];
  responseIndex++;

  const words = reply.split(' ');
  for (const word of words) {
    yield word + ' ';
    await new Promise((r) => setTimeout(r, 40));
  }
}

module.exports = { chat, streamChat };
