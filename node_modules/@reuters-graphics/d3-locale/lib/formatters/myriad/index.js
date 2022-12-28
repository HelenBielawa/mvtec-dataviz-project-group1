
export default (localeInstance) => {
  const format = localeInstance.formatLocale.format;

  const insertMyriad = (str, myriad) => {
    const { decimal, thousands } = localeInstance.formatSpecifier;
    const regex = new RegExp(`([0-9${decimal}${thousands}]+)`, 'g');
    return str.replace(regex, `$1${myriad}`);
  };

  return (formatSpecifier) => {
    if (!formatSpecifier.includes('s')) return format(formatSpecifier);
    formatSpecifier = formatSpecifier.replace('~s', '').replace('s', '');
    return (number) => {
      if (number >= 1e48) return insertMyriad(format(formatSpecifier)(number / 1e48), '極');
      if (number >= 1e44) return insertMyriad(format(formatSpecifier)(number / 1e44), '載');
      if (number >= 1e40) return insertMyriad(format(formatSpecifier)(number / 1e40), '正');
      if (number >= 1e36) return insertMyriad(format(formatSpecifier)(number / 1e36), '澗');
      if (number >= 1e32) return insertMyriad(format(formatSpecifier)(number / 1e32), '溝');
      if (number >= 1e28) return insertMyriad(format(formatSpecifier)(number / 1e28), '穣');
      if (number >= 1e24) return insertMyriad(format(formatSpecifier)(number / 1e24), '𥝱');
      if (number >= 1e20) return insertMyriad(format(formatSpecifier)(number / 1e20), '垓');
      if (number >= 1e16) return insertMyriad(format(formatSpecifier)(number / 1e16), '京');
      if (number >= 1e12) return insertMyriad(format(formatSpecifier)(number / 1e12), '兆');
      if (number >= 1e8) return insertMyriad(format(formatSpecifier)(number / 1e8), '億');
      if (number >= 1e4) return insertMyriad(format(formatSpecifier)(number / 1e4), '万');
      return format(formatSpecifier)(number);
    };
  };
};
