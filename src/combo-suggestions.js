const MAGE = ['冰雷', '火毒', '主教'];

const TITLE_COMBO_RULES = {
  普拉: [
    { classes: MAGE, count: 1, label: '法師' },
  ],
  困拉: [
    { classes: MAGE, count: 2, label: '法師' },
    { classes: ['黑騎士'], count: 1, label: '黑騎士' },
  ],
  普炎: [
    { classes: ['暗影神偷', '夜使者'], count: 1, label: '暗影神偷或夜使者' },
    { classes: ['黑騎士'], count: 1, label: '黑騎士' },
    { classes: MAGE, count: 1, label: '法師' },
  ],
  蝴蝶王: [
    { classes: ['黑騎士'], count: 1, label: '黑騎士' },
  ],
  龍王: [
    { classes: ['黑騎士'], count: 2, label: '黑騎士' },
    { classes: ['暗影神偷'], count: 2, label: '暗影神偷' },
    { classes: ['拳霸'], count: 1, label: '拳霸' },
  ],
  樹王: [
    {
      anyOf: [
        { classes: MAGE, count: 2, label: '法師' },
        { classes: ['火毒', '主教'], count: 1, label: '火毒或主教' },
      ],
    },
    { classes: ['黑騎士'], count: 1, label: '黑騎士' },
  ],
  阿卡: [
    { classes: MAGE, count: 1, label: '法師' },
  ],
};

// Not tied to any specific boss - these fire whenever the trigger class is
// in the roster, regardless of which title the event is for.
const SYNERGY_HINTS = [
  { trigger: ['夜使者'], classes: ['箭神', '神射手'], count: 1, label: '箭神或神射手' },
  { trigger: ['聖騎士'], classes: ['火毒', '冰雷'], count: 1, label: '火毒或冰雷' },
];

function countClasses(signups, classes) {
  return signups.filter((signup) => classes.includes(signup.class)).length;
}

function remainingFor(signups, { classes, count }) {
  return Math.max(0, count - countClasses(signups, classes));
}

// Returns a "still need" fragment for one requirement, or null once it's met.
// For an anyOf requirement, the option closest to being satisfied is the one
// reported - no point telling people to bring both when either would do.
function describeShortage(signups, requirement) {
  if (requirement.anyOf) {
    const remainders = requirement.anyOf.map((option) => ({ option, remaining: remainingFor(signups, option) }));
    if (remainders.some(({ remaining }) => remaining === 0)) return null;
    const best = remainders.reduce((a, b) => (b.remaining < a.remaining ? b : a));
    return `${best.option.label} ${best.remaining} 位`;
  }
  const remaining = remainingFor(signups, requirement);
  return remaining > 0 ? `${requirement.label} ${remaining} 位` : null;
}

// The "still missing" half of the suggestion, e.g. "法師 1 位、黑騎士 1 位",
// or null once every rule for this title is met. Shared by the embed (which
// also appends synergy hints) and the compact /list line (which doesn't).
function getMissingClassesSummary(title, signups) {
  const rules = TITLE_COMBO_RULES[title] || [];
  const shortages = rules.map((rule) => describeShortage(signups, rule)).filter(Boolean);
  return shortages.length > 0 ? shortages.join('、') : null;
}

function getComboSuggestion(title, signups) {
  const missing = getMissingClassesSummary(title, signups);

  const hints = SYNERGY_HINTS
    .filter((hint) => countClasses(signups, hint.trigger) > 0)
    .map((hint) => {
      const remaining = remainingFor(signups, hint);
      return remaining > 0 ? `💡 已有${hint.trigger.join('/')}，建議再帶 ${remaining} 位${hint.label}` : null;
    })
    .filter(Boolean);

  const lines = [];
  if (missing) lines.push(`還缺：${missing}`);
  lines.push(...hints);

  return lines.length > 0 ? lines.join('\n') : null;
}

module.exports = { getComboSuggestion, getMissingClassesSummary, TITLE_COMBO_RULES, SYNERGY_HINTS };
