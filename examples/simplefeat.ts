import { Feature, ElementaryFeature, Score,
  LinearCombination } from '../src/feature';

let NOUNS = [
  'time', 'person', 'year', 'way', 'day', 'thing', 'man', 'world', 'life',
  'hand', 'part', 'child', 'eye', 'woman', 'place', 'work', 'week', 'case',
  'point', 'government', 'company', 'number', 'group', 'problem', 'fact',
];


/**
 * Construct a LinearCombination feature for the frequencies of a set of
 * words. The arguments are a list of words and (optionally) a list of
 * per-word weights. If the weights aren't provided, they are initialized to
 * 1.0 for all words.
 */
function get_words_feat(words: string[] = NOUNS,
                        weights?: number[]): Feature<string> {
  // Build a list of per-word features.
  let termfreqs: Feature<string>[] = [];
  for (let word of words) {
    // Construct a new feature for this word's frequency in a given document.
    let termfreq = new ElementaryFeature((doc: string) => {
      // (This is sort of unsatisfyingly inefficient: we are kinda
      // re-featurizing the document for every individual word feature.)
      let doc_words = doc.split(' ');
      let term_count = 0;
      for (let doc_word of doc_words) {
        if (doc_word.toLowerCase() == word.toLowerCase()) {
          term_count++;
        }
      }
      return term_count / doc_words.length;
    });
  }

  // Initialize the weights to all-1.
  if (!weights) {
    weights = [];
    for (let i = 0; i < words.length; ++i) {
      weights.push(1.0);
    }
  }

  // Map the new features to their weights.
  return new LinearCombination(
    new Score(termfreqs, weights),
  );
}


function main() {
  let words_feat = get_words_feat();
}
main();
