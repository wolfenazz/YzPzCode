// Worked example briefs for the composer. Each one is a request someone could really make:
// concrete names, numbers and a reason, so the AI has something to design from.
// Dependency-free (`npm run test:design`).

import type { DesignKind } from './types';

export interface ExamplePrompt {
  id: string;
  kind: DesignKind;
  title: string;
  prompt: string;
  /** Size ids to select with it, when the example is about one. */
  sizes?: string[];
  /** A starting-point template that suits it. */
  templateId?: string;
  ar?: { title: string; prompt: string };
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  // App
  { id: 'ex-app-habit', kind: 'app', title: 'Habit tracker', templateId: 'app-home', prompt: 'A habit tracker called Streak for people who keep quitting after two weeks. Home shows today\'s habits as big tappable rows with a streak count, a weekly strip, and one gentle nudge. Calm, light, one accent colour.', ar: { title: 'متتبّع العادات', prompt: 'تطبيق لتتبّع العادات اسمه «سلسلة» لمن يتوقفون بعد أسبوعين. الشاشة الرئيسية تعرض عادات اليوم في صفوف كبيرة قابلة للنقر مع عدد الأيام المتتالية وشريط أسبوعي وتذكير لطيف واحد. هادئ وفاتح بلون مميّز واحد.' } },
  { id: 'ex-app-bank', kind: 'app', title: 'Budget and savings', templateId: 'app-dashboard', prompt: 'A personal budgeting app for people in their twenties: this month at a glance, spending by category, a savings goal with a progress ring, and recent transactions. Trustworthy, not corporate; green and warm neutrals.' },
  { id: 'ex-app-recipe', kind: 'app', title: 'Recipe and shopping list', templateId: 'app-home', prompt: 'A recipe app that turns this week\'s plan into one shopping list. Screens: this week\'s plan, a recipe with steps and timers, the combined shopping list grouped by aisle. Food photography led, warm and generous.' },
  { id: 'ex-app-clinic', kind: 'app', title: 'Clinic appointments', templateId: 'app-booking', prompt: 'A clinic app for booking and managing appointments: choose a doctor, pick a time, confirmation, and an upcoming-visits list with reminders. Clean, reassuring, large text, high contrast for older patients.' },
  { id: 'ex-app-fitness', kind: 'app', title: 'Run club', prompt: 'An app for a weekend run club: next run with route and pace groups, a sign-up button, a leaderboard for the month, and a feed of photos from the last run. Energetic, dark, neon yellow accent.' },
  { id: 'ex-app-learn', kind: 'app', title: 'Language practice', prompt: 'A language-learning app with 10-minute daily sessions: today\'s lesson card, a speaking exercise with a mic button and waveform, a result screen with what to review. Playful but not childish.' },
  { id: 'ex-app-transit', kind: 'app', title: 'City transit', prompt: 'A transit app for one city: nearest stops with live departures, a trip planner with the fastest three routes, and a saved places list. Information first, tight and legible, one colour per line.' },
  { id: 'ex-app-pet', kind: 'app', title: 'Pet care', prompt: 'A pet-care app for a household with two dogs: a shared daily checklist (walk, feed, meds), vet history with documents, and a reminder for the next vaccination. Friendly and rounded.' },

  // Web
  { id: 'ex-web-coffee', kind: 'web', title: 'Coffee roaster', templateId: 'web-product', prompt: 'A small coffee roaster selling beans by subscription. Home with a hero, three current coffees with tasting notes, how the subscription works, and where it is roasted. Editorial, earthy, large photography, serif headlines.' },
  { id: 'ex-web-saas', kind: 'web', title: 'Invoice software', templateId: 'web-saas', prompt: 'A landing page for invoicing software for freelancers: get paid faster. Hero with a product screenshot as a drawn interface, three features, a customer quote, pricing teaser, and a clear Start free button. Precise and quiet.' },
  { id: 'ex-web-studio', kind: 'web', title: 'Architecture studio', templateId: 'web-portfolio', prompt: 'A portfolio site for a six-person architecture studio in Amman: selected projects as large images, a project page with plan and photos, a short studio statement, contact. Monochrome, generous space, small caps labels.' },
  { id: 'ex-web-conf', kind: 'web', title: 'Conference', prompt: 'A one-page site for a two-day design conference in October: speakers grid, schedule by day, venue, ticket tiers with the price, and an FAQ. Bold type, a tight palette, one illustration motif.' },
  { id: 'ex-web-nonprofit', kind: 'web', title: 'Charity campaign', prompt: 'A campaign page for a charity building wells in rural villages: the problem in one number, how a donation is used, three stories with photos, a donation box with preset amounts, and transparency report links.' },
  { id: 'ex-web-docs', kind: 'web', title: 'API documentation', templateId: 'web-docs', prompt: 'A documentation page for a payments API: the "Create a charge" endpoint with parameters table, a request example in three languages as tabs, a response example, and error codes. Developer-friendly, dense but calm.' },
  { id: 'ex-web-restaurant', kind: 'web', title: 'Restaurant', prompt: 'A site for a neighbourhood Lebanese restaurant: the story, a menu with photos and prices, opening hours, a reservation form, and the address. Warm, appetising, with a little pattern from tile work.' },

  // Graphic
  { id: 'ex-g-event', kind: 'graphic', title: 'Coffee shop opening', templateId: 'g-poster', sizes: ['poster-a4'], prompt: 'A poster for Hearth & Bean Coffee Roasters\' grand opening on Saturday 14 November, 7 am to 3 pm, 342 Maple Street, Historic Downtown. The first 50 guests receive a ceramic mug. hearthandbean.com. Cream and burnt orange, a hand-drawn feel.' },
  { id: 'ex-g-launch', kind: 'graphic', title: 'Sneaker drop', templateId: 'g-launch', sizes: ['ig-post', 'story'], prompt: 'Announce the Orbit 2 running shoe, available 3 March, 12% lighter than the first. One product-led image area, the name huge, the date, and a shop link. Black and signal orange.' },
  { id: 'ex-g-quote', kind: 'graphic', title: 'Founder quote', templateId: 'g-quote', sizes: ['ig-post'], prompt: 'A quote card: "Good design is mostly deciding what to leave out." — Noor Haddad, founder of Studio Nine. Quiet, typographic, off-white with one ink-blue accent.' },
  { id: 'ex-g-thumb', kind: 'graphic', title: 'Tutorial thumbnail', templateId: 'g-thumb', sizes: ['yt-thumb'], prompt: 'A thumbnail for a video "I built an app in one weekend". A cut-out style person on the right looking surprised, the words ONE WEEKEND in huge letters, a phone with a colourful app. High energy, yellow and deep blue.' },
  { id: 'ex-g-carousel', kind: 'graphic', title: 'Five tips carousel', templateId: 'g-carousel', sizes: ['ig-portrait'], prompt: 'A five-card LinkedIn carousel: "5 mistakes in your first design portfolio". Card 1 is the hook; cards 2 to 4 give a mistake and its fix each; card 5 asks people to follow. Bold, numbered, plenty of space.' },
  { id: 'ex-g-sale', kind: 'graphic', title: 'Weekend sale ad', templateId: 'g-adset', sizes: ['ig-post', 'story', 'rectangle'], prompt: 'A weekend sale for a plant shop, Leaf & Pot: 25% off all indoor plants, Friday to Sunday, free delivery over $50. Fresh greens, a hand-cut paper look, one big percentage.' },
  { id: 'ex-g-menu', kind: 'graphic', title: 'Cafe menu', templateId: 'g-menu', sizes: ['poster-a4'], prompt: 'An A4 menu for a bakery cafe: breakfast, pastries, coffee, and cold drinks, with prices from $3 to $9 and a vegan marker. Simple typographic layout with a tiny wheat-ear motif.' },
  { id: 'ex-g-cert', kind: 'graphic', title: 'Course certificate', templateId: 'g-cert', sizes: ['certificate'], prompt: 'A certificate of completion for the "Data Foundations" course from Northfield Academy, awarded to a placeholder recipient name, dated 12 June, with two signature lines. Formal, restrained, navy and a thin gold line.' },
];

export function examplesFor(kind: DesignKind): ExamplePrompt[] {
  return EXAMPLE_PROMPTS.filter((example) => example.kind === kind);
}
