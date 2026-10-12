const { getComboSuggestion } = require('../src/combo-suggestions');

function signup(className) {
  return { class: className };
}

describe('getComboSuggestion', () => {
  test('普拉 flags a missing mage', () => {
    const result = getComboSuggestion('普拉', [signup('黑騎士')]);
    expect(result).toBe('還缺：法師 1 位');
  });

  test('主教 counts as a mage', () => {
    expect(getComboSuggestion('普拉', [signup('主教')])).toBeNull();
  });

  test('困拉 reports partial progress toward its mage requirement', () => {
    const result = getComboSuggestion('困拉', [signup('冰雷'), signup('黑騎士')]);
    expect(result).toBe('還缺：法師 1 位');
  });

  test('困拉 is satisfied with two mages and a 黑騎士', () => {
    expect(getComboSuggestion('困拉', [signup('冰雷'), signup('火毒'), signup('黑騎士')])).toBeNull();
  });

  test('普炎 requires a thief-type, a 黑騎士, and a mage', () => {
    const result = getComboSuggestion('普炎', []);
    expect(result).toBe('還缺：暗影神偷或夜使者 1 位、黑騎士 1 位、法師 1 位');
  });

  test('普炎 accepts either 暗影神偷 or 夜使者', () => {
    expect(getComboSuggestion('普炎', [signup('暗影神偷'), signup('黑騎士'), signup('火毒')])).toBeNull();
  });

  test('龍王 needs two 黑騎士, two 暗影神偷, and a 拳霸', () => {
    const result = getComboSuggestion('龍王', [signup('黑騎士'), signup('暗影神偷')]);
    expect(result).toBe('還缺：黑騎士 1 位、暗影神偷 1 位、拳霸 1 位');
  });

  test('樹王 is satisfied by two mages even without 火毒/主教 specifically', () => {
    expect(getComboSuggestion('樹王', [signup('冰雷'), signup('主教'), signup('黑騎士')])).toBeNull();
  });

  test('樹王 is satisfied by a single 主教 without a second mage', () => {
    expect(getComboSuggestion('樹王', [signup('主教'), signup('黑騎士')])).toBeNull();
  });

  test('樹王 reports the closer-to-satisfied anyOf option when neither is met', () => {
    const result = getComboSuggestion('樹王', []);
    expect(result).toBe('還缺：火毒或主教 1 位、黑騎士 1 位');
  });

  test('adds a synergy hint when 夜使者 is present without 箭神/神射手', () => {
    const result = getComboSuggestion('蝴蝶王', [signup('黑騎士'), signup('夜使者')]);
    expect(result).toBe('💡 已有夜使者，建議再帶 1 位箭神或神射手');
  });

  test('omits the 夜使者 synergy hint once 箭神 or 神射手 is present', () => {
    expect(getComboSuggestion('蝴蝶王', [signup('黑騎士'), signup('夜使者'), signup('箭神')])).toBeNull();
  });

  test('adds a synergy hint when 聖騎士 is present without 火毒/冰雷', () => {
    const result = getComboSuggestion('蝴蝶王', [signup('黑騎士'), signup('聖騎士')]);
    expect(result).toBe('💡 已有聖騎士，建議再帶 1 位火毒或冰雷');
  });

  test('combines unmet requirements and synergy hints on separate lines', () => {
    const result = getComboSuggestion('蝴蝶王', [signup('聖騎士')]);
    expect(result).toBe('還缺：黑騎士 1 位\n💡 已有聖騎士，建議再帶 1 位火毒或冰雷');
  });

  test('returns null for a title with no configured rules', () => {
    expect(getComboSuggestion('週三夜間團', [signup('黑騎士')])).toBeNull();
  });
});
