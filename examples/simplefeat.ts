import { Feature, ElementaryFeature, Score,
  LinearCombination } from '../src/feature';

let NOUNS = [
  'time', 'person', 'year', 'way', 'day', 'thing', 'man', 'world', 'life',
  'hand', 'part', 'child', 'eye', 'woman', 'place', 'work', 'week', 'case',
  'point', 'government', 'company', 'number', 'group', 'problem', 'fact',
];


/**
 * Construct a LinearCombination feature for the frequencies of a set of
 * words.
 */
function get_words_feat(words: string[] = NOUNS): Feature<string> {
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

  // Map the new features to their weights.
  return new LinearCombination(
    termfreqs,
    new Score(termfreqs, weights),
  );
}


function main() {
  let words_feat = get_words_feat();
}
main();
