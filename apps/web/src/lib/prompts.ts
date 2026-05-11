import type { ContentType, Prompt } from "@speakez/shared";

const promptBank: Record<ContentType, string[]> = {
  prompt: [
    "Describe a small habit that changed your week.",
    "Explain a skill you want to get noticeably better at.",
    "Tell a story about a time you surprised yourself.",
    "Make the case for taking more creative risks.",
    "Describe your ideal productive morning."
  ],
  word: ["Momentum", "Clarity", "Bravery", "Focus", "Spark"],
  interview: [
    "Tell me about yourself in a way that feels memorable.",
    "Describe a challenge you handled well.",
    "Why are you interested in this role?",
    "Tell me about a time you received difficult feedback.",
    "What strength would your friends say defines you?"
  ],
  storytelling: [
    "Tell a story that begins with a missed train.",
    "Describe the funniest misunderstanding you can imagine.",
    "Tell a story where the smallest detail matters most.",
    "Create a story about finding something unexpected.",
    "Tell a story about a promise that becomes complicated."
  ],
  debate: [
    "Should every student learn public speaking?",
    "Is remote work better for creativity?",
    "Should social media platforms hide follower counts?",
    "Is failure overrated as a teacher?",
    "Should cities prioritize bikes over cars?"
  ],
  sales_pitch: [
    "Pitch a smart water bottle for busy students.",
    "Sell a calendar app to someone who hates calendars.",
    "Pitch noise-canceling headphones to a commuter.",
    "Sell a note-taking app to a founder.",
    "Pitch a subscription box for learning new hobbies."
  ],
  elevator_pitch: [
    "Pitch yourself for a dream internship.",
    "Pitch SpeakEZ to someone nervous about speaking.",
    "Pitch a campus event in 60 seconds.",
    "Pitch a personal project you care about.",
    "Pitch a local business idea."
  ],
  timed_response: [
    "What does confidence mean when you are still learning?",
    "How would you explain your favorite app to a grandparent?",
    "What makes advice actually useful?",
    "What should people do less often?",
    "How do you recover from an awkward moment?"
  ],
  daily_challenge: [
    "Give a short talk about one thing you are grateful for today.",
    "Explain yesterday's biggest lesson in under two minutes.",
    "Describe one goal for tomorrow and why it matters.",
    "Teach one idea you learned recently.",
    "Give your future self one useful reminder."
  ]
};

export function getLocalPrompt(type: ContentType): Prompt {
  const items = promptBank[type];
  const text = items[Math.floor(Math.random() * items.length)];
  return {
    id: `local-${type}-${text.length}`,
    type,
    text
  };
}
