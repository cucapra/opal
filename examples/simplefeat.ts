import { Feature, ElementaryFeature, Score,
  LinearCombination } from '../src/feature';

let NOUNS = [
  'time', 'person', 'year', 'way', 'day', 'thing', 'man', 'world', 'life',
  'hand', 'part', 'child', 'eye', 'woman', 'place', 'work', 'week', 'case',
  'point', 'government', 'company', 'number', 'group', 'problem', 'fact',
];
let DOCS = [
  'Life is a gift horse in my opinion.',
  'It pays to be obvious, especially if you have a reputation for subtlety.',
  'The world is changing: I feel it in the water, I feel it in the earth, and I smell it in the air.',
  'Love, I find is like singing. Everybody can do enough to satisfy themselves, though it may not impress the neighbors as being very much.',
  'It is for man to establish the reign of liberty in the midst of the world of the given. To gain the supreme victory, it is necessary, for one thing, that by and through their natural differentiation men and women unequivocally affirm their brotherhood.',
];


/**
 * Construct features for the frequencies of a set of words.
 */
function* get_word_feats(words: string[] = NOUNS): Iterable<Feature<string>> {
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
    yield termfreq;
  }
}


function main() {
  // Get our list of single-word features.
  let word_feats = Array.from(get_word_feats());

  // First, let's just score the documents using the world's silliest
  // bag-of-words features.
  let words_feat = new LinearCombination(Score.uniform(word_feats));
  for (let doc of DOCS) {
    let score = words_feat.score(doc);
    console.log(score.total());
  }
}
main();
