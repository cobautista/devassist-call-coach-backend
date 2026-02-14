import { ConversationStage } from '../types';

export interface QualityScript {
  id: string;
  stage: ConversationStage;
  label: string;
  text: string;
  condition?: string; // Description of when to use this
}

export const QUALITY_SCRIPTS: QualityScript[] = [
  // --- GREETING & OPENER ---
  {
    id: 'opener-check',
    stage: 'GREETING',
    label: 'Audio Check',
    text: "Good morning, can you hear me okay?",
    condition: 'Start of call'
  },
  {
    id: 'intro-basic',
    stage: 'GREETING',
    label: 'Intro',
    text: "My name is [Agent Name], and uh, Bob and I are here; we're local website designers here in [Location].",
    condition: 'After audio check'
  },

  // --- HOOK / VALUE PROP ---
  {
    id: 'hook-affordable',
    stage: 'VALUE_PROP',
    label: 'Affordable Hook',
    text: "We're just wondering if you're interested in building or updating your website, uh, since we're super affordable. Just don't want you to miss out at all.",
    condition: 'After intro'
  },

  // --- OBJECTION HANDLING ---
  {
    id: 'obj-busy-or-have',
    stage: 'OBJECTION_HANDLING',
    label: 'Have One / Busy?',
    text: "Oh, you already got one though, or just busy right now to talk about it?",
    condition: 'Customer says "Not interested" or "I have one"'
  },

  // --- REBUTTAL / PIVOT (SEO) ---
  {
    id: 'pivot-seo',
    stage: 'OBJECTION_HANDLING',
    label: 'SEO Pivot',
    text: "Oh okay. I mean, that's great because we also optimize websites as well, especially with SEO, at super affordable costs.",
    condition: 'Customer says "I have a website"'
  },

  // --- CLOSING / DISCOVERY ---
  {
    id: 'ask-callback',
    stage: 'CLOSING',
    label: 'Ask for Call',
    text: "I mean, would you mind if I can have Bob or his partner give you a quick call later to talk about improving the look or ranking of your website?",
    condition: 'After pitch or objection handling'
  },
  {
    id: 'info-email',
    stage: 'CLOSING',
    label: 'Get Email',
    text: "Oh, what's your email?",
    condition: 'Customer agrees to call'
  },
  {
    id: 'validate-name',
    stage: 'CLOSING',
    label: 'Confirm Name',
    text: "And your name is? ... Oh, you're the owner? You're [Customer Name]?",
    condition: 'Validating lead details'
  },
  {
    id: 'trust-source',
    stage: 'CLOSING',
    label: 'Source',
    text: "We're scouting small to medium local businesses in the area, so we just got your number off of Google.",
    condition: 'Customer asks how you got number'
  },
  {
    id: 'final-close',
    stage: 'CLOSING',
    label: 'Soft Close',
    text: "And would it be okay, [Customer Name], if I can have either Bob or his partner give you a quick call later? Because they're the ones able to shoot you the email anyway. Should be a quick call.",
    condition: 'Final confirmation'
  },
  // --- SCRIPT 2 VARIATIONS ---
  {
    id: 'active-listening',
    stage: 'VALUE_PROP',
    label: 'Active Listening',
    text: "Oh, okay, yeah. I mean, that's why we're here... I mean, you said you're open to possibly updating if anything?",
    condition: 'Customer expresses interest/need'
  },
  {
    id: 'pivot-local',
    stage: 'VALUE_PROP',
    label: 'Local Pivot',
    text: "I mean, that's why we're here, because we're just trying to keep everything local here in [Location].",
    condition: 'Emphasize local connection'
  },
  {
    id: 'value-pricing',
    stage: 'CLOSING',
    label: 'Value Prop',
    text: "So then you can know pricing and all that.",
    condition: 'Explaining benefit of call'
  },
  {
    id: 'decision-maker',
    stage: 'CLOSING',
    label: 'Decision Maker',
    text: "And [Customer Name], you're the person in charge of the website we could talk to, right? Just to confirm.",
    condition: 'Confirming authority'
  },
  // --- SCRIPT 3 VARIATIONS (Familiarity / FOMO) ---
  {
    id: 'opener-familiar',
    stage: 'GREETING',
    label: 'Familiar Opener',
    text: "Good morning again, can you hear me okay?",
    condition: 'If re-dialing or establishing familiarity'
  },
  {
    id: 'intro-locations',
    stage: 'GREETING',
    label: 'Intro (Specific)',
    text: "Real quick though, my name is [Agent Name], and uh, Bob and I are here; we’re local website designers here in [Location].",
    condition: 'Alternative quick intro'
  },
  {
    id: 'pivot-seo-affirm',
    stage: 'OBJECTION_HANDLING',
    label: 'SEO Affirmation',
    text: "Yeah, I mean, that’s great that you already have one because we also optimize websites as well, especially with SEO.",
    condition: 'Stronger validation of existing site'
  },
  {
    id: 'ask-callback-fomo',
    stage: 'CLOSING',
    label: 'Ask + FOMO',
    text: "I mean, would you mind if I can actually have Bob or his partner though give you a quick call later to talk about improving the look or ranking of your website? I mean, should be a quick call anyway; just don't want you to miss out.",
    condition: 'If customer is hesitant (adds FOMO)'
  },
  {
    id: 'decision-confirm-soft',
    stage: 'CLOSING',
    label: 'Confirm Decision Maker',
    text: "Oh, you’re the owner? [Customer Name]? ... and you’re the person in charge of the website to talk about later just to confirm?",
    condition: 'Softer authority check'
  },
  // --- SCRIPT 4 VARIATIONS (Revamp / Options) ---
  {
    id: 'pivot-revamp',
    stage: 'OBJECTION_HANDLING',
    label: 'Revamp Pivot',
    text: "Oh yeah, I mean, that's great that you already have a website because we also, you know, optimize websites as well or revamping them, especially with SEO.",
    condition: 'Focus on modernization/revamping'
  },
  {
    id: 'sign-off-options',
    stage: 'CONVERSION',
    label: 'Sign Off (Options)',
    text: "We'll get back to you later. Have a beautiful day and I'm happy and glad that you're open for options and I'm super excited for you.",
    condition: 'Customer was open to options'
  },
  // --- SCRIPT 5 VARIATIONS (Digital Marketing / IP Control) ---
  {
    id: 'opener-targeted',
    stage: 'GREETING',
    label: 'Targeted Opener',
    text: "Good morning, is [Customer Name] available please?",
    condition: 'When calling a specific lead'
  },
  {
    id: 'pivot-digital-marketing',
    stage: 'OBJECTION_HANDLING',
    label: 'Digital Mktg Pivot',
    text: "Of course yeah. I mean, I was just about to say though [Customer Name], who we are is a whole digital marketing company... and we can actually help you host, maintain or even optimizing it, especially with SEO.",
    condition: 'Pivot to broad services'
  },
  {
    id: 'ask-pricing-samples',
    stage: 'CLOSING',
    label: 'Ask (Pricing/Samples)',
    text: "I mean, would you mind if I could actually have Bob or his partner give you a quick call later today to talk about pricing and all these samples that you wanted to look at?",
    condition: 'Focus on deliverables'
  },
  {
    id: 'obj-ip-control',
    stage: 'OBJECTION_HANDLING',
    label: 'IP/Control Assurance',
    text: "Of course yeah. We definitely let our clienteles get full control of their own website. I mean, we believe in having it to all yourself and for your business, that's what we do.",
    condition: 'Customer worries about ownership'
  },
  {
    id: 'sign-off-excited',
    stage: 'CONVERSION',
    label: 'Sign Off (Excited)',
    text: "Of course yeah, I'll talk to you later then. Have a beautiful day [Customer Name] and I'm super excited for you. Take care.",
    condition: 'High energy sign-off'
  }
];
