/**
 * Utilities for interacting with LUIS.
 */
import * as botbuilder from 'botbuilder';
const request = require('request');

/**
 * Get a date from a LUIS response.
 */
export function getDate(luisdata: any): Date {
  // Get the date from the LUIS response.
  let dateEntities = botbuilder.EntityRecognizer.findAllEntities(
    luisdata.entities, "builtin.datetime.date"
  );
  if (dateEntities.length >= 1) {
    return botbuilder.EntityRecognizer.resolveTime(dateEntities);
  } else {
    return new Date();
  }
}

/**
 * Send a query to LUIS and return its complete API response.
 */
export function query(endpoint: string, text: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let queryURL = endpoint + '&q=' + encodeURIComponent(text);
    request(queryURL, (err, res, body) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(body));
      }
    });
  });
}

/**
 * Get the most likely intent object from a LUIS response, or `null` if none
 * seems likely.
 */
export function likelyIntent(luisdata: any): any {
  // Get the most likely intent.
  let max_intent: any;
  let max_score: number;
  for (let intent of luisdata.intents) {
    if (!max_intent || intent.score > max_score) {
      max_intent = intent;
      max_score = intent.score;
    }
  }

  // Max score too low?
  if (max_score < 0.1) {
    return null;
  } else {
    return max_intent;
  }
}


