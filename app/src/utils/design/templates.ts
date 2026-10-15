// Starting points for the Design studio: what a person usually wants to make, with the
// boards it needs and the details worth asking for. Pure data and helpers, no DOM
// (`npm run test:design`). Each template has Arabic copy: the studio is RTL first-class.

import type { DesignKind } from './types';

export interface TemplateField {
  id: string;
  label: string;
  placeholder: string;
  ar: { label: string; placeholder: string };
}

export interface TemplateBoard {
  name: string;
  brief: string;
}

export interface DesignTemplate {
  id: string;
  kind: DesignKind;
  category: string;
  name: string;
  /** What the description box asks for this template. */
  question: string;
  ar: { name: string; question: string; category: string };
  /** Preset ids or custom `WxH` sizes; one for an app or web template, one per board for a graphic. */
  sizes: string[];
  boards: TemplateBoard[];
  fields: TemplateField[];
  /** The boards are the cards of one series (a carousel) and carry on from each other. */
  series?: boolean;
  /** How a graphic is best drawn: text-heavy ones as HTML (the page wraps the words), the rest as SVG. */
  draw?: 'svg' | 'html';
}

const field = (id: string, label: string, placeholder: string, arLabel: string, arPlaceholder: string): TemplateField => ({
  id, label, placeholder, ar: { label: arLabel, placeholder: arPlaceholder },
});

const F = {
  brand: field('brand', 'Name', 'Brand or product name', 'الاسم', 'اسم العلامة أو المنتج'),
  tagline: field('tagline', 'Tagline', 'One line about it', 'الشعار', 'سطر واحد عنها'),
  audience: field('audience', 'Audience', 'Who it is for', 'الجمهور', 'لمن هو موجّه'),
  website: field('website', 'Website', 'example.com', 'الموقع', 'example.com'),
  cta: field('cta', 'Main action', 'Sign up, Buy now, Book a table', 'الإجراء الرئيسي', 'سجّل، اشترِ الآن، احجز'),
  date: field('date', 'Date and time', 'Saturday 14 November, 7 pm', 'التاريخ والوقت', 'السبت ١٤ نوفمبر، ٧ مساءً'),
  place: field('place', 'Place', 'Venue and city', 'المكان', 'القاعة والمدينة'),
  title: field('title', 'Title', 'The headline or title', 'العنوان', 'العنوان الرئيسي'),
  price: field('price', 'Price or offer', '$29 / month, 20% off', 'السعر أو العرض', '٢٩ دولارًا شهريًا، خصم ٢٠٪'),
  contact: field('contact', 'Contact', 'Email, phone, handle', 'التواصل', 'بريد، هاتف، حساب'),
};

interface Spec {
  id: string;
  kind: DesignKind;
  category: string;
  name: string;
  question: string;
  ar: { name: string; question: string; category: string };
  sizes: string[];
  boards: Array<[string, string]>;
  fields?: TemplateField[];
  series?: boolean;
  draw?: 'svg' | 'html';
}

const make = (spec: Spec): DesignTemplate => ({
  id: spec.id,
  kind: spec.kind,
  category: spec.category,
  name: spec.name,
  question: spec.question,
  ar: spec.ar,
  sizes: spec.sizes,
  boards: spec.boards.map(([name, brief]) => ({ name, brief })),
  fields: spec.fields ?? [],
  series: spec.series,
  draw: spec.draw,
});

const AR = {
  start: 'البدء', core: 'الشاشات الأساسية', commerce: 'التجارة', social: 'التواصل', states: 'الحالات',
  marketing: 'التسويق', product: 'المنتج', content: 'المحتوى', site: 'الموقع', email: 'البريد',
  posts: 'المنشورات', video: 'الفيديو', print: 'المطبوعات', ads: 'الإعلانات', web: 'الويب', brand: 'الهوية',
};

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  // App ----------------------------------------------------------------------------
  make({
    id: 'app-onboarding', kind: 'app', category: 'Start', name: 'Onboarding', question: 'What is the app, and what should a new person understand in three screens?',
    ar: { name: 'شاشات التعريف', question: 'ما هو التطبيق، وماذا ينبغي أن يفهم المستخدم الجديد في ثلاث شاشات؟', category: AR.start },
    sizes: ['phone'],
    boards: [['Welcome', 'Brand, one promise line, a big picture or illustration, and a Get started button.'], ['How it works', 'Three short benefits with icons; progress dots; Next and Skip.'], ['Get started', 'Create account or continue; permission explainer in one sentence.']],
    fields: [F.brand, F.audience],
  }),
  make({
    id: 'app-auth', kind: 'app', category: 'Start', name: 'Sign in and sign up', question: 'What app is this for, and how do people sign in?',
    ar: { name: 'تسجيل الدخول والتسجيل', question: 'لأي تطبيق هذا، وكيف يسجّل الناس دخولهم؟', category: AR.start },
    sizes: ['phone'],
    boards: [['Sign in', 'Email and password fields, a primary button, social sign-in, a link to create an account.'], ['Create account', 'Name, email, password with strength hint, terms line, primary button.'], ['Forgot password', 'One email field, a primary button, a way back, a short reassurance.']],
    fields: [F.brand],
  }),
  make({
    id: 'app-home', kind: 'app', category: 'Core', name: 'Home feed', question: 'What does the app show people first, and what can they do from there?',
    ar: { name: 'الصفحة الرئيسية', question: 'ماذا يعرض التطبيق أولًا، وماذا يستطيع المستخدم أن يفعل منها؟', category: AR.core },
    sizes: ['phone'],
    boards: [['Home', 'Greeting, a search field, a featured card, a scrolling list of items, a tab bar.'], ['Detail', 'A large picture, title, key facts, a primary action pinned at the bottom.'], ['Search', 'Search field with recent searches, filter chips, results list.']],
    fields: [F.brand, F.audience],
  }),
  make({
    id: 'app-dashboard', kind: 'app', category: 'Core', name: 'Dashboard', question: 'What numbers or activity should someone see at a glance?',
    ar: { name: 'لوحة المتابعة', question: 'ما الأرقام أو النشاط الذي ينبغي أن يراه المستخدم بنظرة واحدة؟', category: AR.core },
    sizes: ['phone'],
    boards: [['Overview', 'A headline figure with change, a small chart, three stat tiles, recent activity.'], ['Report', 'A date range switch, a larger chart, a breakdown list with values.'], ['Activity', 'A timeline of events grouped by day with icons and times.']],
    fields: [F.brand],
  }),
  make({
    id: 'app-profile', kind: 'app', category: 'Core', name: 'Profile and settings', question: 'Whose profile is it, and what can they change?',
    ar: { name: 'الملف الشخصي والإعدادات', question: 'ملف مَن هذا، وماذا يستطيع أن يغيّر؟', category: AR.core },
    sizes: ['phone'],
    boards: [['Profile', 'Avatar, name, short bio, three counts, a button to edit, a grid or list of content.'], ['Edit profile', 'Fields for name, handle, bio, links; a change-photo control; Save.'], ['Settings', 'Grouped rows with switches and chevrons: account, notifications, privacy, language, sign out.']],
  }),
  make({
    id: 'app-checkout', kind: 'app', category: 'Commerce', name: 'Checkout', question: 'What is being bought, and how do people pay?',
    ar: { name: 'إتمام الشراء', question: 'ما الذي يُشترى، وكيف يدفع الناس؟', category: AR.commerce },
    sizes: ['phone'],
    boards: [['Cart', 'Item rows with picture, name, quantity stepper and price; a promo field; totals; Checkout button.'], ['Payment', 'Address summary, payment method choices, order summary, Pay button with the total.'], ['Confirmation', 'A success mark, order number, delivery estimate, a button to track or continue.']],
    fields: [F.brand, F.price],
  }),
  make({
    id: 'app-chat', kind: 'app', category: 'Social', name: 'Messaging', question: 'Who talks to whom in this app, and about what?',
    ar: { name: 'المراسلة', question: 'من يتحدث مع من في هذا التطبيق، وعن ماذا؟', category: AR.social },
    sizes: ['phone'],
    boards: [['Inbox', 'Search, a list of conversations with avatar, name, last message, time and unread count.'], ['Conversation', 'Header with name and status, message bubbles for both sides with times, a composer with attach and send.'], ['New message', 'Recipient field with suggestions, recent contacts, a composer.']],
  }),
  make({
    id: 'app-booking', kind: 'app', category: 'Commerce', name: 'Booking', question: 'What can people book, and what do they choose first?',
    ar: { name: 'الحجز', question: 'ماذا يستطيع الناس أن يحجزوا، وماذا يختارون أولًا؟', category: AR.commerce },
    sizes: ['phone'],
    boards: [['Browse', 'Category chips, a list of bookable items with picture, name, rating and price.'], ['Details', 'Picture, description, what is included, reviews summary, a Book button.'], ['Pick a time', 'A calendar strip, time slots, a summary and Continue.'], ['Booked', 'Success state with the details, add to calendar, share, back to home.']],
    fields: [F.brand, F.price],
  }),
  make({
    id: 'app-states', kind: 'app', category: 'States', name: 'Empty and error states', question: 'Which screen needs its empty, loading, error and success states?',
    ar: { name: 'حالات الشاشة', question: 'أي شاشة تحتاج حالاتها الفارغة والتحميل والخطأ والنجاح؟', category: AR.states },
    sizes: ['phone'],
    boards: [['Empty', 'A calm illustration, a short line explaining why it is empty, one action.'], ['Loading', 'Skeleton blocks in the real layout, no spinner alone.'], ['Error', 'What went wrong in plain words, what to do, a Try again button.'], ['Success', 'A confirmation with the result and the next step.']],
  }),
  make({
    id: 'app-full', kind: 'app', category: 'Start', name: 'Whole app', question: 'Describe the app: what it does and for whom. The AI plans the screens.',
    ar: { name: 'تطبيق كامل', question: 'صِف التطبيق: ماذا يفعل ولمن. سيخطّط الذكاء الاصطناعي الشاشات.', category: AR.start },
    sizes: ['phone'],
    boards: [['Home', 'The main screen people land on.'], ['Core task', 'The screen where the main job is done.'], ['Detail', 'One item in depth.'], ['Profile', 'The person and their settings.']],
    fields: [F.brand, F.audience],
  }),

  // Web ----------------------------------------------------------------------------
  make({
    id: 'web-saas', kind: 'web', category: 'Marketing', name: 'Product landing page', question: 'What does the product do, and who is it for?',
    ar: { name: 'صفحة هبوط للمنتج', question: 'ماذا يفعل المنتج، ولمن هو؟', category: AR.marketing },
    sizes: ['desktop'],
    boards: [['Home', 'Header with navigation and a primary button; a hero with headline, one line and the main action beside a product picture; logos of customers; three features; how it works in steps; a quote; pricing teaser; final call to action; footer.']],
    fields: [F.brand, F.tagline, F.audience, F.cta],
  }),
  make({
    id: 'web-pricing', kind: 'web', category: 'Marketing', name: 'Pricing page', question: 'What are the plans, and what makes each different?',
    ar: { name: 'صفحة الأسعار', question: 'ما الخطط، وما الذي يميّز كل واحدة؟', category: AR.marketing },
    sizes: ['desktop'],
    boards: [['Pricing', 'Header; a headline with a monthly/yearly switch; three plan cards with the middle one highlighted, price, feature list and button; a comparison table; five questions answered; footer.']],
    fields: [F.brand, F.price],
  }),
  make({
    id: 'web-product', kind: 'web', category: 'Commerce', name: 'Product page', question: 'What is being sold, and what makes someone buy it?',
    ar: { name: 'صفحة منتج', question: 'ما الذي يُباع، وما الذي يدفع الشخص إلى شرائه؟', category: AR.commerce },
    sizes: ['desktop'],
    boards: [['Product', 'Header with cart; a picture gallery beside the title, rating, price, options and Add to cart; details tabs; reviews; related products; footer.']],
    fields: [F.brand, F.price],
  }),
  make({
    id: 'web-portfolio', kind: 'web', category: 'Site', name: 'Portfolio', question: 'Whose work is it, and what kind of work?',
    ar: { name: 'معرض أعمال', question: 'أعمال مَن هذه، وما نوعها؟', category: AR.site },
    sizes: ['desktop'],
    boards: [['Home', 'A confident intro line, selected work as a grid of large pictures with titles, a short about, contact.'], ['Project', 'Title and role, a hero picture, the story in three parts with pictures, the result, next project.'], ['About', 'A portrait, a short biography, skills, clients, contact details.']],
    fields: [F.brand, F.contact],
  }),
  make({
    id: 'web-blog', kind: 'web', category: 'Content', name: 'Blog article', question: 'What is the article about?',
    ar: { name: 'مقال مدوّنة', question: 'عن ماذا المقال؟', category: AR.content },
    sizes: ['desktop'],
    boards: [['Article', 'Header; title, author, date and reading time; a lead picture; a readable single column of text with a pull quote and a subheading; author box; related articles; footer.']],
    fields: [F.title],
  }),
  make({
    id: 'web-docs', kind: 'web', category: 'Content', name: 'Documentation page', question: 'What does this page of the docs explain?',
    ar: { name: 'صفحة توثيق', question: 'ماذا تشرح هذه الصفحة من التوثيق؟', category: AR.content },
    sizes: ['desktop'],
    boards: [['Docs', 'A left sidebar tree, a content column with title, intro, a code block, a note callout and steps, and a right-hand outline of the page; search at the top.']],
    fields: [F.brand],
  }),
  make({
    id: 'web-admin', kind: 'web', category: 'Product', name: 'Admin dashboard', question: 'What does the team manage here?',
    ar: { name: 'لوحة إدارة', question: 'ماذا يدير الفريق هنا؟', category: AR.product },
    sizes: ['desktop'],
    boards: [['Dashboard', 'A left navigation, a top bar with search and account; four KPI tiles; a main chart; a table of recent items with status chips; filters.']],
    fields: [F.brand],
  }),
  make({
    id: 'web-waitlist', kind: 'web', category: 'Marketing', name: 'Waitlist page', question: 'What is launching, and when?',
    ar: { name: 'صفحة قائمة الانتظار', question: 'ما الذي سيُطلق، ومتى؟', category: AR.marketing },
    sizes: ['desktop'],
    boards: [['Waitlist', 'A single focused screen: brand, headline, one sentence, an email field with a join button, a count of people waiting, three small teasers, social links.']],
    fields: [F.brand, F.tagline, F.date],
  }),
  make({
    id: 'web-404', kind: 'web', category: 'Site', name: 'Error page', question: 'What site is it, and what tone does it use?',
    ar: { name: 'صفحة الخطأ', question: 'ما الموقع، وما نبرته؟', category: AR.site },
    sizes: ['desktop'],
    boards: [['404', 'A clear message that the page was not found, a short human line, a search field, links to the main places, the header and footer.']],
    fields: [F.brand],
  }),
  make({
    id: 'web-about', kind: 'web', category: 'Site', name: 'About and team', question: 'Who are you, and what do you believe?',
    ar: { name: 'من نحن', question: 'من أنتم، وبماذا تؤمنون؟', category: AR.site },
    sizes: ['desktop'],
    boards: [['About', 'A mission statement as a large headline; the story in a few paragraphs with a picture; numbers; values; a grid of team members with photo, name and role; join us.']],
    fields: [F.brand, F.tagline],
  }),
  make({
    id: 'web-site', kind: 'web', category: 'Site', name: 'Small website', question: 'What is the business, and what do visitors need from it?',
    ar: { name: 'موقع صغير', question: 'ما النشاط، وماذا يحتاج الزوّار منه؟', category: AR.site },
    sizes: ['desktop'],
    boards: [['Home', 'Hero, what we do in three parts, a few proof points, a call to action.'], ['Services', 'Each service with a picture, a paragraph and what is included.'], ['About', 'Story, people, values.'], ['Contact', 'A form, address and hours, a map placeholder as a plain block.']],
    fields: [F.brand, F.contact],
  }),
  make({
    id: 'web-email', kind: 'web', category: 'Email', name: 'Marketing email', question: 'What is the email announcing, and what should the reader do?',
    ar: { name: 'بريد تسويقي', question: 'ماذا يعلن البريد، وماذا ينبغي أن يفعل القارئ؟', category: AR.email },
    sizes: ['email'],
    boards: [['Email', 'A 600px single column built from tables-friendly blocks: logo bar, hero picture, headline, two short paragraphs, one big button, a three-item row, a footer with address and unsubscribe. Use simple blocks, solid colours and web-safe font fallbacks; no layout that needs CSS grid or flexbox.']],
    fields: [F.brand, F.cta, F.price],
  }),

  // Graphic ------------------------------------------------------------------------
  make({
    id: 'g-social', kind: 'graphic', category: 'Posts', name: 'Social post', question: 'What is the post saying, and what should people do?',
    ar: { name: 'منشور اجتماعي', question: 'ماذا يقول المنشور، وماذا ينبغي أن يفعل الناس؟', category: AR.posts },
    sizes: ['ig-post'], boards: [['Post', 'One message with a clear focal point and the name or handle small.']],
    fields: [F.brand, F.title, F.cta],
  }),
  make({
    id: 'g-carousel', draw: 'html', kind: 'graphic', category: 'Posts', name: 'Carousel', question: 'What does the carousel teach or tell, step by step?',
    ar: { name: 'منشور متعدد الشرائح', question: 'ماذا يعلّم المنشور أو يحكي، خطوة بعد خطوة؟', category: AR.posts },
    sizes: ['ig-portrait', 'ig-portrait', 'ig-portrait', 'ig-portrait', 'ig-portrait'], series: true,
    boards: [['Cover', 'The hook: a big title and a swipe cue.'], ['Point 1', 'First idea, one line and a short explanation.'], ['Point 2', 'Second idea.'], ['Point 3', 'Third idea.'], ['Wrap up', 'The takeaway and a closing action, with the handle.']],
    fields: [F.brand, F.title],
  }),
  make({
    id: 'g-story', kind: 'graphic', category: 'Posts', name: 'Story', question: 'What is the story announcing?',
    ar: { name: 'ستوري', question: 'ماذا تعلن الستوري؟', category: AR.posts },
    sizes: ['story'], boards: [['Story', 'Vertical, text kept out of the top 250px and bottom 340px (app chrome), one message and a sticker-like action.']],
    fields: [F.brand, F.title, F.cta],
  }),
  make({
    id: 'g-quote', draw: 'html', kind: 'graphic', category: 'Posts', name: 'Quote card', question: 'What is the quote, and who said it?',
    ar: { name: 'بطاقة اقتباس', question: 'ما الاقتباس، ومن قاله؟', category: AR.posts },
    sizes: ['ig-post'], boards: [['Quote', 'The quote large and well set, the author small, a restrained graphic device.']],
    fields: [field('quote', 'Quote', 'The words', 'الاقتباس', 'العبارة'), field('author', 'Author', 'Name, role', 'القائل', 'الاسم والصفة')],
  }),
  make({
    id: 'g-thumb', kind: 'graphic', category: 'Video', name: 'YouTube thumbnail', question: 'What is the video about, and what should make someone click?',
    ar: { name: 'صورة مصغّرة ليوتيوب', question: 'عن ماذا الفيديو، وما الذي يدفع الشخص إلى النقر؟', category: AR.video },
    sizes: ['yt-thumb'], boards: [['Thumbnail', 'Readable at 168px wide: at most four words, one strong subject, high contrast, nothing in the bottom-right corner.']],
    fields: [F.title],
  }),
  make({
    id: 'g-poster', kind: 'graphic', category: 'Print', name: 'Event poster', question: 'What is the event, and why should people come?',
    ar: { name: 'ملصق فعالية', question: 'ما الفعالية، ولماذا ينبغي أن يحضر الناس؟', category: AR.print },
    sizes: ['poster-a4'], boards: [['Poster', 'Event name as the hero, date and place unmissable, one line of why, the website or ticket action, organiser at the bottom.']],
    fields: [F.title, F.date, F.place, F.website],
  }),
  make({
    id: 'g-magazine', kind: 'graphic', category: 'Print', name: 'Magazine cover', question: 'What is the issue about, and what are its headlines?',
    ar: { name: 'غلاف مجلة', question: 'عن ماذا العدد، وما عناوينه؟', category: AR.print },
    sizes: ['poster-a4'], boards: [['Cover', 'A masthead across the top, one dominant picture area, a main cover line and three smaller ones, issue and date, a barcode block.']],
    fields: [F.title, F.date],
  }),
  make({
    id: 'g-launch', kind: 'graphic', category: 'Ads', name: 'Product launch', question: 'What is launching, and what is the one thing to remember?',
    ar: { name: 'إطلاق منتج', question: 'ما الذي يُطلق، وما الشيء الوحيد الذي يجب أن يُتذكر؟', category: AR.ads },
    sizes: ['ig-post', 'story', 'linkedin-post'],
    boards: [['Square', 'The announcement with the product as the focus.'], ['Vertical', 'The same message for full-screen vertical viewing.'], ['Wide', 'The same message for a wide feed.']],
    fields: [F.brand, F.tagline, F.date, F.cta],
  }),
  make({
    id: 'g-adset', kind: 'graphic', category: 'Ads', name: 'Ad set', question: 'What is the offer, and what should the ad make people do?',
    ar: { name: 'مجموعة إعلانات', question: 'ما العرض، وماذا ينبغي أن يجعل الإعلان الناس يفعلون؟', category: AR.ads },
    sizes: ['ig-post', 'story', 'linkedin-post', 'rectangle', 'leaderboard'],
    boards: [['Square', 'The main ad.'], ['Story', 'Vertical version.'], ['LinkedIn', 'Wide feed version.'], ['Rectangle', 'Small display ad: logo, one short line, a button.'], ['Leaderboard', 'A very flat banner: logo, a few words, a button in one row.']],
    fields: [F.brand, F.price, F.cta],
  }),
  make({
    id: 'g-infographic', draw: 'html', kind: 'graphic', category: 'Posts', name: 'Infographic', question: 'What facts or steps are shown, and what should people conclude?',
    ar: { name: 'إنفوغرافيك', question: 'ما الحقائق أو الخطوات المعروضة، وما الذي ينبغي أن يستنتجه الناس؟', category: AR.posts },
    sizes: ['1080x2400'], boards: [['Infographic', 'A title block, three to five sections each with a number or icon, a short heading and one line of text; one big figure; sources at the bottom.']],
    fields: [F.title],
  }),
  make({
    id: 'g-bizcard', kind: 'graphic', category: 'Brand', name: 'Business card', question: 'Whose card is it, and for what business?',
    ar: { name: 'بطاقة عمل', question: 'بطاقة مَن، ولأي نشاط؟', category: AR.brand },
    sizes: ['business-card', 'business-card'], series: true,
    boards: [['Front', 'The mark and the name of the business, quiet.'], ['Back', 'Name, role, phone, email, website, address in a tidy block.']],
    fields: [F.brand, F.contact],
  }),
  make({
    id: 'g-cert', draw: 'html', kind: 'graphic', category: 'Print', name: 'Certificate', question: 'What is it awarded for, and by whom?',
    ar: { name: 'شهادة', question: 'لأي إنجاز تُمنح، ومن قِبل مَن؟', category: AR.print },
    sizes: ['certificate'], boards: [['Certificate', 'A formal title, the recipient name as the focus, the reason, date, signature lines and an issuer mark; a restrained border.']],
    fields: [F.title, F.date],
  }),
  make({
    id: 'g-menu', draw: 'html', kind: 'graphic', category: 'Print', name: 'Menu', question: 'What place is it for, and what do they serve?',
    ar: { name: 'قائمة طعام', question: 'لأي مكان، وماذا يقدّم؟', category: AR.print },
    sizes: ['poster-a4'], boards: [['Menu', 'The place name at the top, sections with item names, short descriptions and prices aligned, a note about allergens or hours.']],
    fields: [F.brand, F.contact],
  }),
  make({
    id: 'g-hero', kind: 'graphic', category: 'Web', name: 'Web banner', question: 'Where does the banner sit, and what does it say?',
    ar: { name: 'بانر للموقع', question: 'أين يوضع البانر، وماذا يقول؟', category: AR.web },
    sizes: ['web-hero'], boards: [['Banner', 'Text kept to one side with the other side free for the picture; a headline, one line, a button.']],
    fields: [F.brand, F.cta],
  }),
  make({
    id: 'g-og', draw: 'html', kind: 'graphic', category: 'Web', name: 'Link preview image', question: 'What page or article is the preview for?',
    ar: { name: 'صورة معاينة الرابط', question: 'لأي صفحة أو مقال المعاينة؟', category: AR.web },
    sizes: ['og-image'], boards: [['Preview', 'The title large, the site name and logo small, a simple background that stays readable when shown at 400px wide.']],
    fields: [F.title, F.brand],
  }),
  make({
    id: 'g-logo', kind: 'graphic', category: 'Brand', name: 'Logo', question: 'What is the name, and what should the mark feel like?',
    ar: { name: 'شعار', question: 'ما الاسم، وما الإحساس الذي ينبغي أن تنقله العلامة؟', category: AR.brand },
    sizes: ['logo'], boards: [['Logo', 'A simple mark with the name as a wordmark; works in one colour; clear space around it.']],
    fields: [F.brand, F.tagline],
  }),
];

export function templatesFor(kind: DesignKind): DesignTemplate[] {
  return DESIGN_TEMPLATES.filter((template) => template.kind === kind);
}

export function findTemplate(id: string | null | undefined): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find((template) => template.id === id);
}

/** Categories in the order they first appear. */
export function categoriesOf(kind: DesignKind): string[] {
  return Array.from(new Set(templatesFor(kind).map((template) => template.category)));
}

export function categoryLabel(template: DesignTemplate, rtl: boolean): string {
  return rtl ? template.ar.category : template.category;
}

export const templateName = (template: DesignTemplate, rtl: boolean): string => (rtl ? template.ar.name : template.name);
export const templateQuestion = (template: DesignTemplate, rtl: boolean): string => (rtl ? template.ar.question : template.question);

/**
 * What goes to the AI beside the person's own words: the planned boards and the details they filled in.
 * Empty details are left out.
 */
export function composeExtra(template: DesignTemplate, values: Record<string, string>): string {
  const details = template.fields
    .map((entry) => ({ label: entry.label, value: (values[entry.id] ?? '').trim() }))
    .filter((entry) => entry.value);
  const lines: string[] = [];
  if (details.length > 0) lines.push('Details to use exactly:', ...details.map((entry) => `- ${entry.label}: ${entry.value}`), '');
  lines.push(`Starting point: ${template.name}. Plan these ${template.series ? 'cards in this order' : 'boards'}, changing them where the request needs it:`);
  template.boards.forEach((board, index) => lines.push(`${index + 1}. ${board.name}: ${board.brief}`));
  return lines.join('\n');
}

export interface ThumbRect { x: number; y: number; width: number; height: number }

/**
 * Where the template's boards sit in a thumbnail of `width` × `height`: in one row, true to their
 * aspect ratios, with a small gap. Used to draw the card's wireframe.
 */
export function thumbRects(sizes: Array<{ width: number; height: number }>, width = 64, height = 40, gap = 3): ThumbRect[] {
  if (sizes.length === 0) return [];
  const shown = sizes.slice(0, 5);
  const unit = shown.map((size) => size.width / size.height);
  const totalAspect = unit.reduce((sum, value) => sum + value, 0);
  const rowHeight = Math.min(height, (width - gap * (shown.length - 1)) / totalAspect);
  const rects: ThumbRect[] = [];
  let x = 0;
  const rowWidth = totalAspect * rowHeight + gap * (shown.length - 1);
  const offset = (width - rowWidth) / 2;
  const top = (height - rowHeight) / 2;
  shown.forEach((_size, index) => {
    const w = unit[index] * rowHeight;
    rects.push({ x: offset + x, y: top, width: w, height: rowHeight });
    x += w + gap;
  });
  return rects;
}
