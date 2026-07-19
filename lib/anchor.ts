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

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
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

  for (let start = 0; start < source.text.length; start += 1) {
    for (let length = minLength; length <= maxLength; length += 1) {
      const end = start + length;
      if (end > source.text.length) {
        break;
      }

      const candidate = source.text.slice(start, end);
      const distance = levenshteinDistance(candidate, normalizedQuote);
      const score = 1 - distance / Math.max(candidate.length, normalizedQuote.length);
      const lengthDifference = Math.abs(length - normalizedQuote.length);
      if (
        score < threshold ||
        (bestMatch &&
          (score < bestMatch.score ||
            (score === bestMatch.score &&
              lengthDifference >= bestLengthDifference)))
      ) {
        continue;
      }

      bestMatch = matchForRange(source, start, end, score);
      bestLengthDifference = lengthDifference;
    }
  }

  return bestMatch;
}
