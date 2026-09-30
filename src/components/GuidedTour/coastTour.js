// The Coast product tour. `actions` opens/closes the real screens so each step can
// highlight the actual control it describes.
export function buildCoastTour(actions) {
  return [
    {
      target: '[data-tour="next-step"]',
      before: actions.showMap,
      placement: 'left',
      title: 'Your next step',
      body: 'The fastest way back into learning: continue your current lesson, or create your first one.',
    },
    {
      target: '[data-tour="nav"]',
      placement: 'bottom',
      title: 'Map, Lessons and Chat',
      body: 'The three places you’ll use most. You can replay this tour any time from your profile.',
    },
    {
      target: '[data-tour="profile"]',
      placement: 'right',
      title: 'Level, XP and streak',
      body: 'Every section you finish earns XP, and a focus session each day keeps your streak alive.',
    },
    {
      target: '[data-tour="region"]',
      placement: 'left',
      title: 'A map that grows with you',
      body: 'Finishing sections uncovers new regions — with rare drops hidden across the map that bring back what you learned at the right moment.',
    },
    {
      target: '[data-tour="new-lesson"]',
      before: actions.openLessons,
      placement: 'right',
      title: 'Turn your lectures into a lesson',
      body: 'Create a lesson and upload your slides or PDFs. Pedro plans a roadmap from them, and you can start as soon as the first section is ready — the rest prepares in the background.',
    },
    {
      target: '[data-tour="lesson-tabs"]',
      placement: 'bottom',
      title: 'Lessons, Workshops and Notes',
      body: 'Workshops are hands-on builds where Pedro coaches you through a real project — pick one from the library or create your own from sources. Notes collects everything you save while you learn.',
    },
    {
      target: '[data-tour="chat-composer"]',
      before: actions.openChat,
      placement: 'top',
      title: 'Ask Pedro anything',
      body: 'About your courses, a lecture from weeks ago, or something new. Pedro remembers what you’ve learned and how you like to learn.',
    },
    {
      target: null,
      before: actions.showMap,
      title: 'Pedro makes sure it sticks',
      body: 'Each section ends with a short check — you move on once you’ve shown you understand it. Already know part of a lesson? Tap “Skip what I know” and Pedro places you at the right section.',
    },
  ];
}
