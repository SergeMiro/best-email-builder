// @ts-check
/**
 * WHAT AN EMAIL IS FOR — the purposes offered by "Generate".
 *
 * Each purpose carries a short BRIEF for the model: the sections and the
 * information such an email needs (a password reset needs the link's expiry
 * and a "not you?" line; a sale needs the offer, its end date and a code).
 * The brief is the part of the prompt that changes with the purpose; the
 * design and MJML rules stay the same (see `prompt.js`).
 *
 * `kind` sets the footer:
 *   marketing      sent in bulk: an unsubscribe link is required (CAN-SPAM, GDPR);
 *   transactional  triggered by the recipient's action: a discreet link to the
 *                  email preferences;
 *   security       account security: no unsubscribe link at all, a line says
 *                  why the message was sent.
 *
 * Plain data: labels are English keys translated by the interface, briefs
 * stay in English (they are written for the model, not shown).
 */

/**
 * @typedef {'marketing'|'transactional'|'security'} PurposeKind
 * @typedef {{id: string, label: string}} PurposeCategory
 * @typedef {{id: string, label: string, category: string, kind: PurposeKind, brief: string}} EmailPurpose
 */

/** @type {PurposeCategory[]} */
export const PURPOSE_CATEGORIES = [
  { id: 'promotions', label: 'Sales and promotions' },
  { id: 'holidays', label: 'Holidays and occasions' },
  { id: 'events', label: 'Events and appointments' },
  { id: 'news', label: 'News and content' },
  { id: 'account', label: 'Account and security' },
  { id: 'orders', label: 'Orders and payments' },
  { id: 'relationship', label: 'Customer relationship' },
  { id: 'organization', label: 'Business and organization' },
];

/** @param {string} id @param {string} label @param {string} category @param {PurposeKind} kind @param {string} brief */
const purpose = (id, label, category, kind, brief) => ({ id, label, category, kind, brief });

/** @type {EmailPurpose[]} */
export const EMAIL_PURPOSES = [
  // Sales and promotions
  purpose('sale', 'Store sale', 'promotions', 'marketing',
    'An online store sale. A bold hero with the offer (discount and end date), a short reason to buy now, 2 to 4 featured products in two columns (image, name, old and new price, link), one "Shop the sale" button, and the conditions in small text.'),
  purpose('flash-sale', 'Flash sale', 'promotions', 'marketing',
    'A sale that lasts hours, not days. Urgency first: the deadline in the hero, a large discount, one button, very little text.'),
  purpose('discount-code', 'Discount code', 'promotions', 'marketing',
    'A personal discount code. The code in a large, easy-to-copy box (a colored section with the code in big letters), what it gives, its expiry date, and a button to use it.'),
  purpose('new-product', 'New product', 'promotions', 'marketing',
    'A product launch. A hero image with the product name, three benefits in three short columns or a list, the price or availability, and a "Discover" button.'),
  purpose('back-in-stock', 'Back in stock', 'promotions', 'marketing',
    'A product the recipient wanted is available again. The product (image, name, price), "limited stock" urgency without exaggeration, and a "Buy now" button.'),
  purpose('price-drop', 'Price drop', 'promotions', 'marketing',
    'A product the recipient looked at is now cheaper. Old and new price side by side, the product image, and a button.'),
  purpose('abandoned-cart', 'Abandoned cart', 'promotions', 'marketing',
    'Items left in the cart. A friendly reminder, the cart items (image, name, price), a "Return to my cart" button, and a reassurance line (free returns, secure payment, help contact).'),
  purpose('black-friday', 'Black Friday', 'promotions', 'marketing',
    'A Black Friday or Cyber Monday campaign. A dark, high-contrast hero with the offer and dates, featured categories or products in columns, and a strong button.'),
  purpose('loyalty-reward', 'Loyalty reward', 'promotions', 'marketing',
    'Thank a loyal customer with a reward: their status or points balance, the reward, how to use it, and a button.'),
  purpose('refer-a-friend', 'Refer a friend', 'promotions', 'marketing',
    'Invite the customer to refer friends. What the friend gets, what the customer gets, three short steps, and a button to share their link.'),

  // Holidays and occasions
  purpose('christmas', 'Christmas', 'holidays', 'marketing',
    'Christmas greetings from the company, warm and festive (deep red, green or gold accents), a short heartfelt message, an optional gift idea or offer, and the holiday opening hours if relevant.'),
  purpose('new-year', 'New Year', 'holidays', 'marketing',
    'New Year wishes. A celebratory hero, thanks for the past year, one or two highlights or promises for the year ahead, and warm wishes.'),
  purpose('season-greetings', "Season's greetings", 'holidays', 'marketing',
    'End-of-year greetings that suit every culture and belief (no religious reference): thanks, warm wishes, and the holiday closing dates.'),
  purpose('valentines-day', "Valentine's Day", 'holidays', 'marketing',
    "Valentine's Day: a romantic tone (soft pink or red), gift ideas in columns, and a delivery deadline."),
  purpose('easter', 'Easter', 'holidays', 'marketing',
    'Easter: a spring palette, greetings, and an optional seasonal offer.'),
  purpose('mothers-day', "Mother's Day", 'holidays', 'marketing',
    "Mother's Day: gift ideas in columns, the order deadline for delivery in time, and a gentle tone."),
  purpose('fathers-day', "Father's Day", 'holidays', 'marketing',
    "Father's Day: gift ideas in columns, the order deadline for delivery in time, and a warm tone."),
  purpose('halloween', 'Halloween', 'holidays', 'marketing',
    'Halloween: a playful, spooky tone (orange and near-black, still readable), a themed offer or event.'),
  purpose('back-to-school', 'Back to school', 'holidays', 'marketing',
    'Back to school: essentials or a checklist in columns, an offer, and a cheerful tone.'),
  purpose('summer', 'Summer holidays', 'holidays', 'marketing',
    'Summer: a bright palette, summer picks or plans, and the summer opening hours if relevant.'),
  purpose('birthday', 'Birthday wishes', 'holidays', 'marketing',
    "Happy birthday to the recipient by first name: a festive hero, a personal message, and a birthday gift or code with its validity."),
  purpose('anniversary', 'Customer anniversary', 'holidays', 'marketing',
    'One (or more) years since the recipient became a customer: thanks, a short look back, and a small gift.'),
  purpose('womens-day', "Women's Day", 'holidays', 'marketing',
    "International Women's Day (March 8): respectful greetings, an optional offer or a story about women of the team, no clichés."),
  purpose('thanksgiving', 'Thanksgiving', 'holidays', 'marketing',
    'Thanksgiving: gratitude to customers, a warm autumn palette, and an optional offer.'),
  purpose('lunar-new-year', 'Lunar New Year', 'holidays', 'marketing',
    'Lunar New Year: wishes for the new year (red and gold accents), the animal of the year if relevant, and an optional offer.'),
  purpose('ramadan-eid', 'Ramadan and Eid', 'holidays', 'marketing',
    'Ramadan Kareem or Eid Mubarak greetings: respectful and warm, adapted opening hours, an optional offer.'),
  purpose('diwali', 'Diwali', 'holidays', 'marketing',
    'Diwali, the festival of lights: warm wishes, a light-filled palette (gold, deep orange), an optional offer.'),

  // Events and appointments
  purpose('meeting-reminder', 'Meeting reminder', 'events', 'transactional',
    'A reminder of an upcoming meeting: what, when (date, time, time zone), where (address or video link), who, what to prepare, and buttons to join and to reschedule.'),
  purpose('appointment-confirmation', 'Appointment confirmation', 'events', 'transactional',
    'Confirm a booked appointment (doctor, salon, garage, consultant): service, date and time, address with directions, how to cancel or reschedule, and a contact.'),
  purpose('reservation-confirmation', 'Booking confirmation', 'events', 'transactional',
    'Confirm a booking (restaurant table, hotel room, class): booking details in a clear summary box, arrival information, and how to change it.'),
  purpose('event-invitation', 'Event invitation', 'events', 'marketing',
    'Invite to an event: a hero with the name, date and place, what to expect (program or speakers in columns), and an "I will come" RSVP button.'),
  purpose('webinar-invitation', 'Webinar invitation', 'events', 'marketing',
    'Invite to a webinar: the topic and what attendees will learn (three points), the speaker, date and time with time zone, and a "Register" button.'),
  purpose('save-the-date', 'Save the date', 'events', 'marketing',
    'Announce a date to keep free before the full invitation: the event name and date very large, one sentence, and an "Add to calendar" button.'),
  purpose('registration-confirmed', 'Registration confirmed', 'events', 'transactional',
    'Confirm a registration to an event, a course or a webinar: what, when, where or the access link, an "Add to calendar" button, and how to cancel.'),
  purpose('event-change', 'Cancellation or new date', 'events', 'transactional',
    'An event or appointment is cancelled or moved: the change in the first line, the new date if any, what happens to tickets or bookings, an apology, and a contact.'),
  purpose('event-follow-up', 'Thanks for attending', 'events', 'marketing',
    'Thank attendees after an event: a recap, links to the replay or slides, a short survey, and the next event.'),

  // News and content
  purpose('newsletter', 'Newsletter', 'news', 'marketing',
    'A newsletter: an intro, a lead story with an image, 2 or 3 shorter articles (title, two lines, "Read more" link), and an optional tip or quote.'),
  purpose('new-article', 'New article', 'news', 'marketing',
    'Share one new blog article or video: its image, title, a two-sentence teaser, and a "Read the article" button.'),
  purpose('product-update', "What's new", 'news', 'marketing',
    "A product update or release notes: the headline feature with an image, 2 or 3 smaller improvements, and a button to try it."),
  purpose('announcement', 'Announcement', 'news', 'marketing',
    'An important announcement (new name, new address, partnership, milestone): what changes, why, what it means for the recipient, and a button.'),
  purpose('tips', 'Tips and how-to', 'news', 'marketing',
    'Practical tips: 3 to 5 numbered tips, each with a short title and one or two sentences, and a button to learn more.'),

  // Account and security
  purpose('welcome', 'Welcome', 'account', 'transactional',
    'Welcome a new user or subscriber: a warm hero, what they can expect, 3 first steps, and one button to get started.'),
  purpose('verify-email', 'Email verification', 'account', 'security',
    'Ask to confirm the email address: one short sentence, a "Confirm my email" button, the link validity, and "If you did not sign up, ignore this email".'),
  purpose('password-reset', 'Password reset', 'account', 'security',
    'A password reset: "We received a request to reset your password", a "Reset my password" button, the link expiry, and "If you did not ask, ignore this email; your password stays the same". Sober and reassuring, no marketing.'),
  purpose('login-code', 'Login code', 'account', 'security',
    'A one-time sign-in code: the code as a placeholder in very large letters in a light box, its validity in minutes, and a warning never to share it. No button.'),
  purpose('security-alert', 'Security alert', 'account', 'security',
    'A new sign-in or account change: what happened, when, device and location, "If it was you, nothing to do", and a "Secure my account" button.'),
  purpose('onboarding', 'Getting started', 'account', 'transactional',
    'Help a new user get value: one key feature explained in 3 steps with short texts, a button, and where to find help.'),
  purpose('trial-ending', 'Trial ending', 'account', 'transactional',
    'The free trial ends soon: the end date, what they lose, the plans or price, and an "Upgrade" button.'),

  // Orders and payments
  purpose('order-confirmation', 'Order confirmation', 'orders', 'transactional',
    'Confirm an order: thanks, order number and date, the items in a summary (name, quantity, price), totals, shipping address, delivery estimate, and a "View my order" button.'),
  purpose('order-shipped', 'Order shipped', 'orders', 'transactional',
    'The order is on its way: carrier, expected delivery date, a "Track my parcel" button, and the shipped items.'),
  purpose('delivery-delay', 'Delivery delay', 'orders', 'transactional',
    'An order will arrive late: an apology, the new estimated date, the reason in one sentence, an optional gesture, and a "Track my order" button.'),
  purpose('receipt', 'Receipt or invoice', 'orders', 'transactional',
    'A payment receipt or invoice: amount paid, date, payment method, a clear breakdown, and a "Download the invoice" button.'),
  purpose('payment-failed', 'Payment failed', 'orders', 'transactional',
    'A payment did not go through: calm and helpful, what happens next and when, and an "Update my payment method" button.'),
  purpose('subscription-renewal', 'Subscription renewal', 'orders', 'transactional',
    'An upcoming subscription renewal: plan, amount, renewal date, and buttons to manage the subscription.'),
  purpose('refund', 'Refund issued', 'orders', 'transactional',
    'A refund was issued: amount, original order, when it reaches the account, and a contact for questions.'),

  // Customer relationship
  purpose('thank-you', 'Thank you', 'relationship', 'marketing',
    'A sincere thank-you (for a purchase, a year together, a donation, a recommendation): personal tone, short, and an optional small gift.'),
  purpose('review-request', 'Review request', 'relationship', 'marketing',
    'Ask for a review of a recent purchase or visit: the product or service, one sentence on why reviews matter, and a "Leave a review" button.'),
  purpose('survey', 'Survey', 'relationship', 'marketing',
    'Ask for feedback: how long it takes (for example 2 minutes), why it helps, an optional incentive, and a "Take the survey" button.'),
  purpose('win-back', 'We miss you', 'relationship', 'marketing',
    'Re-engage an inactive customer: what is new since their last visit, a comeback offer, and a button.'),
  purpose('follow-up', 'Follow-up', 'relationship', 'transactional',
    'A personal follow-up after a meeting, a call or a quote: a reminder of what was discussed, the next step, and an easy way to reply or book a call. Short and personal, like a message from one person.'),
  purpose('apology', 'Apology', 'relationship', 'transactional',
    'A sincere apology for a problem (outage, mistake, late delivery): what happened, what was done to fix it, a gesture if any, and a contact. No marketing.'),

  // Business and organization
  purpose('hiring', "We're hiring", 'organization', 'marketing',
    'Job openings: why join the team, 2 to 4 open roles (title, place, one line), and a "See the jobs" button.'),
  purpose('policy-update', 'Policy update', 'organization', 'transactional',
    'Updated terms or privacy policy: the date it takes effect, the key changes in a short list, and a link to the full text. Neutral and clear.'),
  purpose('price-change', 'Price change', 'organization', 'transactional',
    'A price change notice: old and new price, the effective date, why, and how to change plan or cancel. Honest and respectful.'),
  purpose('maintenance', 'Scheduled maintenance', 'organization', 'transactional',
    'Planned maintenance or an incident: when, how long, what is affected, and where to follow the status.'),
  purpose('closure', 'Closure or opening hours', 'organization', 'marketing',
    'Holiday closure or new opening hours: the dates and hours very clearly, what customers can still do, and wishes.'),
  purpose('donation-appeal', 'Donation appeal', 'organization', 'marketing',
    'A fundraising appeal for a nonprofit: one concrete story, what a gift makes possible (amount examples), and a "Donate" button.'),
  purpose('team-update', 'Internal update', 'organization', 'transactional',
    'An internal message to employees: news, dates to remember, and a contact. Plain and friendly.'),
];

/** @param {string|null|undefined} id */
export function purposeById(id) {
  return EMAIL_PURPOSES.find((entry) => entry.id === id) || null;
}

/** Purposes grouped by category, in category order. */
export function purposesByCategory(purposes = EMAIL_PURPOSES) {
  return PURPOSE_CATEGORIES.map((category) => ({
    ...category,
    purposes: purposes.filter((entry) => entry.category === category.id),
  })).filter((group) => group.purposes.length > 0);
}
