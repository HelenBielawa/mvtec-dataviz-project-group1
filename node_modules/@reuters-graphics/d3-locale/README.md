![](badge.svg)

# @reuters-graphics/d3-locale

Easy translation for d3 charting.

Covers the following locales:
- `en`: US English
- `de`: German
- `es`: Spanish
- `fr`: French
- `it`: Italian
- `ja`: Japanese
- `pt`: Portuguese
- `zh`: Chinese

### Install

```
$ yarn add @reuters-graphics/d3-locale d3-format d3-time-format
```

### Use

```javascript
import D3Locale from '@reuters-graphics/d3-locale';

const locale = new D3Locale('de');

// Use it alone...
locale.format(',')(23000);
// '23.000'
locale.formatTime('%B %d')(new Date('2020-07-13'));
// 'Juli 13'

// ... or with an axis
d3.axisBottom(xScale)
  .tickFormat(locale.formatTime('%b. %d, %Y'));

// Can also override a part of a locale specifier...
locale.format('$')(12.2)
// R$12,2
locale.formatSpecifier = { currency: ['', '€'] };
locale.format('$')(12.2)
// '12,2€'
```

### Extra features

##### Japanese/Chinese myriad groupings

There is special handling for decimal notation with an SI prefix (`s` format) in Japanese and Chinese in order to handle grouping by [myriads](https://en.wikipedia.org/wiki/Japanese_numerals#Large_numbers) rather than thousands.

```javascript
const locale = new D3Locale('ja');
locale.format(',s')(16000);
// 1.6万
locale.format(',s')(25000000);
// 2,500万
locale.format('$,s')(1233000);
// 123.3万円
```
