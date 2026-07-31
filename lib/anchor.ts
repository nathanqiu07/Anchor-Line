export interface AnchorMatch {
  start: number;
  end: number;
  score: number;
}

interface NormalizedText {
  text: string;
  indexMap: number[];
}

function normalizeWithIndexMap(value: string): NormalizedText {
  const characters: string[] = [];
  const indexMap: number[] = [];
  let previousWasSpace = true;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\p{L}|\p{N}/u.test(character)) {
      characters.push(character.toLowerCase());
      indexMap.push(index);
      previousWasSpace = false;
    } else if (!previousWasSpace && /\s/u.test(character)) {
      characters.push(" ");
      indexMap.push(index);
      previousWasSpace = true;
    }
  }

  if (characters.at(-1) === " ") {
    characters.pop();
    indexMap.pop();
  }

  return { text: characters.join(""), indexMap };
}

function matchForRange(
  source: NormalizedText,
  start: number,
  end: number,
  score: number,
): AnchorMatch {
  return {
    start: source.indexMap[start],
    end: source.indexMap[end - 1] + 1,
    score,
  };
}

/**
 * Locates a quoted claim in a transcription, returning offsets into the original
 * (not normalized) transcription. Exact normalized matches are preferred.
 */
export function anchorQuote(
  transcription: string,
  quote: string,
  threshold = 0.85,
): AnchorMatch | null {
  const source = normalizeWithIndexMap(transcription);
  const normalizedQuote = normalizeWithIndexMap(quote).text;

  if (!source.text || !normalizedQuote) {
    return null;
  }

  const exactStart = source.text.indexOf(normalizedQuote);
  if (exactStart >= 0) {
    return matchForRange(
      source,
      exactStart,
      exactStart + normalizedQuote.length,
      1,
    );
  }

  const minLength = Math.max(
    1,
    Math.floor(normalizedQuote.length * 0.8),
  );
  const maxLength = Math.min(
    source.text.length,
    Math.ceil(normalizedQuote.length * 1.2),
  );
  let bestMatch: AnchorMatch | null = null;
  let bestLengthDifference = Number.POSITIVE_INFINITY;

  const quoteLength = normalizedQuote.length;
  // The most forgiving budget any candidate length in range could still earn.
  const widestBudget = Math.floor(
    (1 - threshold) * Math.max(maxLength, quoteLength),
  );
  const previous = new Array<number>(quoteLength + 1);
  const current = new Array<number>(quoteLength + 1);

  for (let start = 0; start < source.text.length; start += 1) {
    const windowLength = Math.min(maxLength, source.text.length - start);
    // Every later start is shorter still, so nothing beyond this point can reach minLength.
    if (windowLength < minLength) break;

    for (let index = 0; index <= quoteLength; index += 1) previous[index] = index;

    for (let length = 1; length <= windowLength; length += 1) {
      const sourceCharacter = source.text[start + length - 1];
      current[0] = length;
      let rowMinimum = length;
      for (let index = 1; index <= quoteLength; index += 1) {
        const value = Math.min(
          current[index - 1] + 1,
          previous[index] + 1,
          previous[index - 1] +
            (sourceCharacter === normalizedQuote[index - 1] ? 0 : 1),
        );
        current[index] = value;
        if (value < rowMinimum) rowMinimum = value;
      }

      if (length >= minLength) {
        const longest = Math.max(length, quoteLength);
        const score = 1 - current[quoteLength] / longest;
        const lengthDifference = Math.abs(length - quoteLength);
        const beatsBest =
          !bestMatch ||
          score > bestMatch.score ||
          (score === bestMatch.score && lengthDifference < bestLengthDifference);
        if (score >= threshold && beatsBest) {
          bestMatch = matchForRange(source, start, start + length, score);
          bestLengthDifference = lengthDifference;
        }
      }

      // Row minimums never decrease as the table fills, so once one clears the widest
      // budget no longer candidate from this start can qualify either.
      if (rowMinimum > widestBudget) break;
      for (let index = 0; index <= quoteLength; index += 1) {
        previous[index] = current[index];
      }
    }
  }

  return bestMatch;
}
